import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { conversations, messages, conversationSummaries, personaProfiles, memoryItems, knowledgeDocuments, knowledgeCollections } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { branchPath, sourceRevisions, summaryHash, summaryLayer, summarySources, validateSummary, SUMMARY_POLICY, SummaryError, DEFAULT_SUMMARY_SETTINGS, type SummarySettings, type SummaryUse, type SummaryMessage } from "@/lib/conversation/summary";
import type { PromptMessage } from "@/lib/ai/messages";
import { estimateMemoryTokens } from "@/lib/memory/memoryRetrieval";
import { stableJson } from "@/lib/ai/stableJson";

type Database<T extends PgQueryResultHKT> = PgDatabase<T, typeof schema>;
import type { SummarySnapshot } from "@/lib/conversation/summary";
type SummaryRecord = SummarySnapshot<Date>;
export class ConversationSummaryRepository<T extends PgQueryResultHKT> {
  constructor(private readonly db: Database<T>) {}
  async branch(conversationId: string, leafId: string | null) {
    const [conversation] = await this.db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, LOCAL_USER_ID))).limit(1);
    if (!conversation) throw new SummaryError("对话不存在或无权访问。", 404);
    // Resolve topology first without reading sibling bodies, then fetch only the selected ancestors.
    const metadata = await this.db.select({ id: messages.id, parentMessageId: messages.parentMessageId, role: messages.role, status: messages.status }).from(messages).where(eq(messages.conversationId, conversationId));
    const ids = branchPath(metadata.map((v) => ({ ...v, content: "" })), leafId).map((v) => v.id);
    const rows = ids.length ? await this.db.select().from(messages).where(and(eq(messages.conversationId, conversationId), inArray(messages.id, ids))) : [];
    return { conversation, path: branchPath(rows, leafId) };
  }
  async contextStamp(mode: string, path: SummaryMessage[] = []): Promise<string> {
    const persona = mode === "entertainment" ? [] : await this.db.select({ version: personaProfiles.version }).from(personaProfiles).where(eq(personaProfiles.userId, LOCAL_USER_ID));
    const memories = mode === "entertainment" ? [] : await this.db.select({ id: memoryItems.id, version: memoryItems.version, validUntil: memoryItems.validUntil }).from(memoryItems).where(eq(memoryItems.userId, LOCAL_USER_ID)).orderBy(asc(memoryItems.id));
    const personal = mode === "entertainment" ? { domain: "game", personal: "none" } : { persona, memories: memories.map((v) => ({ ...v, validUntil: v.validUntil?.toISOString() ?? null, expired: v.validUntil ? v.validUntil <= new Date() : false })) };
    const references = path.flatMap((row) => row.citations?.flatMap((citation) => citation.knowledge ? [citation.knowledge] : []) ?? []);
    if (!references.length) return summaryHash(personal); // Preserve existing no-knowledge summaries.
    const ids = [...new Set(references.map((ref) => ref.documentId))].sort();
    if (ids.length > 200) throw new SummaryError("覆盖范围引用超过200篇资料，请缩小摘要范围。");
    const roots = await this.db.select({ id: knowledgeDocuments.id, version: knowledgeDocuments.version, hash: knowledgeDocuments.contentHash }).from(knowledgeDocuments).innerJoin(knowledgeCollections, and(eq(knowledgeCollections.id, knowledgeDocuments.collectionId), eq(knowledgeCollections.userId, LOCAL_USER_ID))).where(and(eq(knowledgeDocuments.userId, LOCAL_USER_ID), inArray(knowledgeDocuments.id, ids)));
    // Metadata only. A historical summary never silently imports new document bodies or receives RAG grants.
    return summaryHash({ ...personal, references, knowledgeRoots: ids.map((id) => roots.find((root) => root.id === id) ?? { id, deletedOrUnavailable: true }) });
  }
  async valid(record: SummaryRecord, path: SummaryMessage[], mode: string, modelKey: string) {
    if (record.policy !== SUMMARY_POLICY || record.mode !== mode || record.modelKey !== modelKey || record.contextStamp !== await this.contextStamp(mode, path.slice(0, record.sources.length)) || record.sources.length > path.length - record.settings.recent || !record.payload) return false;
    if (stableJson(await sourceRevisions(path.slice(0, record.sources.length))) !== stableJson(record.sources)) return false;
    // Conservative explicit-correction signal; not claimed to understand all semantic contradictions.
    if (path.slice(record.sources.length).some((row) => row.role === "user" && /更正|纠正|撤回|忘记前|取消之前|推翻之前/u.test(row.content))) return false;
    try { validateSummary(record.payload, path.slice(0, record.sources.length), record.settings); return true; } catch { return false; }
  }
  async inspect(conversationId: string, leafId: string | null, modelKey: string, approvedOnly = false) {
    const { conversation, path } = await this.branch(conversationId, leafId);
    const rows = await this.db.select().from(conversationSummaries).where(and(eq(conversationSummaries.userId, LOCAL_USER_ID), eq(conversationSummaries.conversationId, conversationId))).orderBy(desc(conversationSummaries.createdAt));
    for (const row of rows.sort((a, b) => b.sources.length - a.sources.length)) if ((approvedOnly ? row.status === "approved" : ["draft", "approved"].includes(row.status)) && await this.valid(row, path, conversation.mode, modelKey)) return { summary: row, messageCount: path.length, reason: "可用摘要；启用前请核对约束、决定与未决事项。" };
    return { summary: null, messageCount: path.length, reason: rows.length ? "没有适用于当前分支/模式/配置的有效摘要；继续使用完整历史。" : "尚无摘要；默认使用完整历史。" };
  }
  async begin(conversationId: string, leafId: string, modelKey: string, settings: SummarySettings = DEFAULT_SUMMARY_SETTINGS) {
    return this.db.transaction(async (tx) => {
      await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, LOCAL_USER_ID))).for("update");
      const repo = new ConversationSummaryRepository(tx);
      const { conversation, path } = await repo.branch(conversationId, leafId);
      if (conversation.activeLeafMessageId !== leafId) throw new SummaryError("分支已切换，请刷新后再生成。");
      const sources = summarySources(path, settings); const revisions = await sourceRevisions(sources); const contextStamp = await repo.contextStamp(conversation.mode, sources);
      const fingerprint = await summaryHash({ sources: revisions, mode: conversation.mode, modelKey, settings, contextStamp, policy: SUMMARY_POLICY });
      const rows = await tx.select().from(conversationSummaries).where(and(eq(conversationSummaries.conversationId, conversationId), eq(conversationSummaries.userId, LOCAL_USER_ID)));
      const existing = rows.find((row) => row.fingerprint === fingerprint);
      if (existing && existing.status !== "failed") {
        if (existing.status === "pending") throw new SummaryError("相同来源正在生成，不会重复收费；失败或进程中断后可清除摘要再显式重试。");
        return { record: existing, sources, reused: true };
      }
      if (rows.length >= 24 && !existing) throw new SummaryError("本对话已保留24份摘要，请先清除派生摘要；原消息不受影响。");
      const values = { userId: LOCAL_USER_ID, conversationId, fingerprint, mode: conversation.mode, policy: SUMMARY_POLICY, contextStamp, modelKey, settings, sources: revisions, status: "pending" as const, payload: null };
      const [record] = existing ? await tx.update(conversationSummaries).set({ ...values, version: existing.version + 1 }).where(eq(conversationSummaries.id, existing.id)).returning() : await tx.insert(conversationSummaries).values(values).returning();
      return { record, sources, reused: false };
    });
  }
  async complete(record: SummaryRecord, sources: SummaryMessage[], raw: unknown) {
    const payload = validateSummary(raw, sources, record.settings);
    return this.db.transaction(async (tx) => {
      await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, record.conversationId), eq(conversations.userId, LOCAL_USER_ID))).for("update");
      const repo = new ConversationSummaryRepository(tx);
      const { conversation, path } = await repo.branch(record.conversationId, conversationLeaf(sources));
      // Check source roots, mode and non-body dependencies again after the remote call.
      if (conversation.mode !== record.mode || record.contextStamp !== await repo.contextStamp(record.mode, path) || stableJson(await sourceRevisions(path)) !== stableJson(record.sources)) throw new SummaryError("生成期间来源/模式已变化；结果未保存，调用费用仍计入用量。");
      const [saved] = await tx.update(conversationSummaries).set({ payload, status: "draft", version: record.version + 1 }).where(and(eq(conversationSummaries.id, record.id), eq(conversationSummaries.version, record.version), eq(conversationSummaries.status, "pending"))).returning();
      if (!saved) throw new SummaryError("摘要已被清除或替换，本次结果未保存。");
      return saved;
    });
  }
  async approve(conversationId: string, leafId: string, id: string, expectedVersion: number, modelKey: string) {
    return this.db.transaction(async (tx) => {
      await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, LOCAL_USER_ID))).for("update");
      const repo = new ConversationSummaryRepository(tx); const { conversation, path } = await repo.branch(conversationId, leafId);
      const [record] = await tx.select().from(conversationSummaries).where(and(eq(conversationSummaries.id, id), eq(conversationSummaries.conversationId, conversationId), eq(conversationSummaries.userId, LOCAL_USER_ID), eq(conversationSummaries.version, expectedVersion), eq(conversationSummaries.status, "draft")));
      if (!record || !await repo.valid(record, path, conversation.mode, modelKey) || conversation.activeLeafMessageId !== leafId) throw new SummaryError("摘要/分支已失效或版本冲突，请刷新核对。");
      const [saved] = await tx.update(conversationSummaries).set({ status: "approved", version: record.version + 1 }).where(eq(conversationSummaries.id, id)).returning(); return saved;
    });
  }
  async fail(id: string) { await this.db.update(conversationSummaries).set({ status: "failed", payload: null }).where(and(eq(conversationSummaries.id, id), eq(conversationSummaries.userId, LOCAL_USER_ID), eq(conversationSummaries.status, "pending"))); }
  async clear(conversationId: string) {
    await this.branch(conversationId, null);
    return this.db.transaction(async (tx) => { await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, LOCAL_USER_ID))).for("update"); await tx.delete(conversationSummaries).where(and(eq(conversationSummaries.conversationId, conversationId), eq(conversationSummaries.userId, LOCAL_USER_ID))); });
  }
  async prepare(conversationId: string, leafId: string | null, modelKey: string, prompt: PromptMessage[]) {
    const { path } = await this.branch(conversationId, leafId);
    const full = [...prompt.filter((v) => v.kind !== "conversation"), ...path.map(({ role, content }): PromptMessage => ({ kind: "conversation", source: "conversation", role: role as "user" | "assistant", content }))];
    const inspection = await this.inspect(conversationId, leafId, modelKey, true); const row = inspection.summary;
    if (!row || row.status !== "approved" || !row.payload) return { prompt: full, usage: null, note: inspection.reason };
    const compact = [...full.filter((v) => v.kind !== "conversation"), summaryLayer(row.payload), ...full.filter((v) => v.kind === "conversation").slice(row.sources.length)];
    const originalEstimatedTokens = estimateMemoryTokens(stableJson(full)); const compactEstimatedTokens = estimateMemoryTokens(stableJson(compact));
    if (compactEstimatedTokens >= originalEstimatedTokens) return { prompt: full, usage: null, note: "摘要未减少上下文，本次回退完整历史。" };
    return { prompt: compact, usage: { id: row.id, fingerprint: row.fingerprint, sourceCount: row.sources.length, originalEstimatedTokens, compactEstimatedTokens } satisfies SummaryUse, note: "使用已审核分支摘要 + 近期原文；摘要是有损派生资料。" };
  }
  async verifyUse(conversationId: string, leafId: string | null, modelKey: string, use: SummaryUse) {
    const { conversation, path } = await this.branch(conversationId, leafId);
    const [row] = await this.db.select().from(conversationSummaries).where(and(eq(conversationSummaries.id, use.id), eq(conversationSummaries.userId, LOCAL_USER_ID), eq(conversationSummaries.conversationId, conversationId), eq(conversationSummaries.status, "approved")));
    if (!row || row.fingerprint !== use.fingerprint || !await this.valid(row, path, conversation.mode, modelKey)) throw new SummaryError("摘要在调用前已失效；未调用模型，请关闭摘要或刷新重试。");
  }
}
const conversationLeaf = (sources: SummaryMessage[]) => sources.at(-1)?.id ?? null;
export function createConversationSummaryRepository<T extends PgQueryResultHKT>(db: Database<T>) { return new ConversationSummaryRepository(db); }
export const summaryModelKey = (config: { baseUrl: string; model: string }) => `${config.baseUrl}|${config.model}`;
