import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createConversationRepository, LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { createConversationSummaryRepository, summaryModelKey } from "@/lib/repositories/conversationSummaryRepository";
import { createConversationSummaryApi } from "@/lib/api/conversationSummaryApi";
import { createPromptRunRepository } from "@/lib/repositories/promptRunRepository";
import { createModelApi } from "@/lib/api/modelApi";
import { createPromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { ModelProvider } from "@/lib/ai/server/modelProvider";
import { createKnowledgeRepository } from "@/lib/repositories/knowledgeRepository";
import { createKnowledgeRetrievalRepository } from "@/lib/repositories/knowledgeRetrievalRepository";
import { knowledgeCitations } from "@/lib/knowledge/retrieval";
const config = { apiKey: "synthetic-not-real", baseUrl: "https://example.test", model: "mock" }; const key = summaryModelKey(config);
describe("R5.4 real SQL + mock Provider", () => {
  let pg: PGlite; let db: ReturnType<typeof drizzle<typeof schema>>;
  beforeEach(async () => { pg = new PGlite(); await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); db = drizzle(pg, { schema }); });
  afterEach(async () => pg.close());
  async function setup() {
    const conversations = createConversationRepository(db); const conversation = await conversations.createConversation({ title: "测试分支", mode: "professional" });
    const rows = Array.from({ length: 20 }, (_, n) => ({ id: crypto.randomUUID(), conversationId: conversation.id, parentMessageId: null as string | null, role: n % 2 ? "assistant" as const : "user" as const, status: "complete" as const, content: `第${n}条：预算最多30元，最终期限周五。${"原始历史完整保留；不要编造已完成状态。".repeat(30)}` }));
    rows.forEach((row, n) => { row.parentMessageId = n ? rows[n - 1].id : null; });
    await db.insert(schema.messages).values(rows); const leaf = rows[19].id;
    await db.update(schema.conversations).set({ activeLeafMessageId: leaf }).where(eq(schema.conversations.id, conversation.id));
    const repo = createConversationSummaryRepository(db); const payload = { points: [{ kind: "constraint", text: "用户预算最多30元，最终期限周五；未确认完成。", evidence: [{ messageId: rows[0].id, quote: "预算最多30元，最终期限周五" }] }] };
    return { conversation, rows, leaf, repo, payload, conversations };
  }
  async function approved() { const s = await setup(); const begun = await s.repo.begin(s.conversation.id, s.leaf, key); const draft = await s.repo.complete(begun.record, begun.sources, s.payload); const record = await s.repo.approve(s.conversation.id, s.leaf, draft.id, draft.version, key); return { ...s, record }; }
  it("R5.6 invalidates summaries whose covered messages cite changed/deleted documents without erasing raw history", async () => {
    const s = await setup(); const library = createKnowledgeRepository(db); const c = await library.createCollection({ title: "引用来源", module: "professional", description: "" });
    const input = { title: "数学资料", sourceKey: "math", format: "text" as const, content: "矩阵乘法按行列计算。", sourceUrl: "", fileName: "" }; const doc = await library.saveDocument(c.id, input);
    const found = await createKnowledgeRetrievalRepository(db).search({ consumer: "professional", collectionIds: [c.id], query: "矩阵乘法" });
    await db.update(schema.messages).set({ citations: knowledgeCitations(found.hits) }).where(eq(schema.messages.id, s.rows[1].id));
    const first = await s.repo.begin(s.conversation.id, s.leaf, key); const draft = await s.repo.complete(first.record, first.sources, s.payload); await s.repo.approve(s.conversation.id, s.leaf, draft.id, draft.version, key);
    expect((await s.repo.inspect(s.conversation.id, s.leaf, key)).summary?.id).toBe(draft.id);
    await library.saveDocument(c.id, { ...input, content: "更正后的矩阵说明。" }, { id: doc.id, expectedVersion: 1 });
    expect((await s.repo.inspect(s.conversation.id, s.leaf, key)).summary).toBeNull();
    expect((await s.conversations.getConversation(s.conversation.id))?.messages).toHaveLength(20);
    const second = await s.repo.begin(s.conversation.id, s.leaf, key); expect(second.reused).toBe(false); expect(second.record.contextStamp).not.toBe(first.record.contextStamp);
    const renewed = await s.repo.complete(second.record, second.sources, s.payload); await s.repo.approve(s.conversation.id, s.leaf, renewed.id, renewed.version, key);
    await library.deleteDocument(doc.id, 2); expect((await s.repo.inspect(s.conversation.id, s.leaf, key)).summary).toBeNull();
  });
  it("generates once, reviews before use and reuses the same coverage without recursion", async () => {
    const s = await setup(); const first = await s.repo.begin(s.conversation.id, s.leaf, key);
    await expect(s.repo.begin(s.conversation.id, s.leaf, key)).rejects.toThrow("正在生成");
    const draft = await s.repo.complete(first.record, first.sources, s.payload);
    expect((await s.repo.prepare(s.conversation.id, s.leaf, key, [])).usage).toBeNull();
    await s.repo.approve(s.conversation.id, s.leaf, draft.id, draft.version, key);
    const result = await s.repo.prepare(s.conversation.id, s.leaf, key, []);
    expect(result.usage?.sourceCount).toBe(14); expect(result.prompt.filter((p) => p.kind === "conversation")).toHaveLength(6);
    expect(result.prompt.at(-1)?.content).toBe(s.rows[19].content);
    expect((await s.repo.begin(s.conversation.id, s.leaf, key)).reused).toBe(true);
    expect((await s.repo.begin(s.conversation.id, s.leaf, key)).sources).toHaveLength(14);
    const nextUser = { ...s.rows[18], id: crypto.randomUUID(), parentMessageId: s.leaf };
    const nextAnswer = { ...s.rows[19], id: crypto.randomUUID(), parentMessageId: nextUser.id };
    await db.insert(schema.messages).values([nextUser, nextAnswer]);
    await db.update(schema.conversations).set({ activeLeafMessageId: nextAnswer.id }).where(eq(schema.conversations.id, s.conversation.id));
    const next = await s.repo.begin(s.conversation.id, nextAnswer.id, key); await s.repo.complete(next.record, next.sources, s.payload);
    expect((await s.repo.prepare(s.conversation.id, nextAnswer.id, key, [])).usage?.id).toBe(draft.id);
  });
  it("reuses a shared ancestor prefix but never a sibling answer", async () => {
    const s = await approved(); const fork = { ...s.rows[19], id: crypto.randomUUID(), parentMessageId: s.rows[18].id, content: "新兄弟分支近期答案" }; await db.insert(schema.messages).values(fork);
    expect((await s.repo.prepare(s.conversation.id, fork.id, key, [])).usage?.id).toBe(s.record.id);
    const early = { ...fork, id: crypto.randomUUID(), parentMessageId: s.rows[2].id, content: "更早分叉" }; await db.insert(schema.messages).values(early);
    const denied = await s.repo.prepare(s.conversation.id, early.id, key, []); expect(denied.usage).toBeNull(); expect(JSON.stringify(denied)).not.toContain("第19条");
  });
  it("invalidates mode/model/Persona and explicit corrections without losing raw messages", async () => {
    const s = await approved(); expect((await s.repo.prepare(s.conversation.id, s.leaf, "different-model", [])).usage).toBeNull();
    await db.insert(schema.personaProfiles).values({ userId: LOCAL_USER_ID, name: "新名字" });
    expect((await s.repo.prepare(s.conversation.id, s.leaf, key, [])).usage).toBeNull();
    await db.delete(schema.personaProfiles); await db.update(schema.conversations).set({ mode: "companion" }).where(eq(schema.conversations.id, s.conversation.id));
    expect((await s.repo.prepare(s.conversation.id, s.leaf, key, [])).usage).toBeNull();
    await db.update(schema.conversations).set({ mode: "professional" }).where(eq(schema.conversations.id, s.conversation.id));
    const correction = { ...s.rows[18], id: crypto.randomUUID(), parentMessageId: s.leaf, content: "更正：预算改为10元。" }; await db.insert(schema.messages).values(correction);
    expect((await s.repo.prepare(s.conversation.id, correction.id, key, [])).usage).toBeNull();
    expect((await s.conversations.getConversation(s.conversation.id))?.messages).toHaveLength(21);
  });
  it("source edits/deletes physically invalidate derived text and reject stale use at Run time", async () => {
    const s = await approved(); const prepared = await s.repo.prepare(s.conversation.id, s.leaf, key, []); expect(prepared.usage).not.toBeNull();
    const envelope = await createPromptEnvelope({ runId: crypto.randomUUID(), trigger: "retry", conversation: { id: s.conversation.id, title: "摘要", activeLeafId: s.leaf }, prompt: prepared.prompt, provider: { provider: "openai-compatible", baseUrl: config.baseUrl, model: config.model } });
    await db.update(schema.messages).set({ content: "编辑来源" }).where(eq(schema.messages.id, s.rows[0].id));
    expect(await db.select().from(schema.conversationSummaries)).toEqual([]);
    await expect(createPromptRunRepository(db).start(envelope, [], undefined, prepared.usage!)).rejects.toThrow("失效");
    expect(await db.select().from(schema.promptRuns)).toEqual([]);
    const begun = await s.repo.begin(s.conversation.id, s.leaf, key); await s.repo.complete(begun.record, begun.sources, { points: [{ kind: "fact", text: "用户编辑了来源", evidence: [{ messageId: s.rows[0].id, quote: "编辑来源" }] }] });
    await db.delete(schema.messages).where(eq(schema.messages.id, s.rows[0].id)); expect(await db.select().from(schema.conversationSummaries)).toEqual([]);
  });
  it("denies foreign scope, clears summaries independently and cascades conversation deletion", async () => {
    const s = await approved(); await s.repo.clear(s.conversation.id); expect(await db.select().from(schema.conversationSummaries)).toEqual([]); expect((await s.conversations.getConversation(s.conversation.id))?.messages).toHaveLength(20);
    const foreign = crypto.randomUUID(); await db.insert(schema.users).values({ id: foreign }); await db.update(schema.conversations).set({ userId: foreign }).where(eq(schema.conversations.id, s.conversation.id));
    await expect(s.repo.inspect(s.conversation.id, s.leaf, key)).rejects.toMatchObject({ status: 404 });
    await db.update(schema.conversations).set({ userId: LOCAL_USER_ID }).where(eq(schema.conversations.id, s.conversation.id)); await s.repo.begin(s.conversation.id, s.leaf, key);
    await s.conversations.deleteConversation(s.conversation.id); expect(await db.select().from(schema.conversationSummaries)).toEqual([]);
  });
  it("refuses changed personal-memory metadata and changed policy", async () => {
    const s = await approved();
    const [candidate] = await db.insert(schema.memoryCandidates).values({ userId: LOCAL_USER_ID, content: "合成事实", kind: "fact", evidenceQuote: "", sensitivity: "low", confidence: 90, reason: "synthetic" }).returning();
    const [fact] = await db.insert(schema.memoryItems).values({ userId: LOCAL_USER_ID, candidateId: candidate.id, content: "合成事实", kind: "fact", sensitivity: "low" }).returning();
    expect((await s.repo.prepare(s.conversation.id, s.leaf, key, [])).usage).toBeNull();
    await db.delete(schema.memoryItems).where(eq(schema.memoryItems.id, fact.id));
    expect((await s.repo.prepare(s.conversation.id, s.leaf, key, [])).usage).not.toBeNull();
    await db.update(schema.conversationSummaries).set({ policy: "old-policy" }).where(eq(schema.conversationSummaries.id, s.record.id));
    expect((await s.repo.prepare(s.conversation.id, s.leaf, key, [])).usage).toBeNull();
  });
  it("uses measured summary business once and exposes failure without automatic retry", async () => {
    const s = await setup(); const calls = vi.fn(); let malformed = true;
    const provider: ModelProvider = { async *stream(request) { calls(request); yield { type: "delta", text: malformed ? "not-json" : JSON.stringify(s.payload) }; yield { type: "done" }; } };
    const api = createConversationSummaryApi(s.repo, async () => config, () => provider);
    const request = () => new Request("https://app.test/summary", { method: "POST", body: JSON.stringify({ leafId: s.leaf, confirmPaid: true }) });
    expect((await api.handle(new Request("https://app.test/summary", { method: "POST", body: JSON.stringify({ leafId: s.leaf }) }), s.conversation.id)).status).toBe(422); expect(calls).toHaveBeenCalledTimes(0);
    expect((await api.handle(request(), s.conversation.id)).status).toBe(422); expect(calls).toHaveBeenCalledTimes(1);
    expect((await db.select().from(schema.conversationSummaries))[0].status).toBe("failed");
    malformed = false; expect((await api.handle(request(), s.conversation.id)).status).toBe(200); expect(calls).toHaveBeenCalledTimes(2);
    expect(calls.mock.calls[1][0]).toMatchObject({ business: "context-summary", promptVersion: "branch-summary/r5.5-v1" });
    expect((await api.handle(request(), s.conversation.id)).status).toBe(200); expect(calls).toHaveBeenCalledTimes(2);
  });
  it("sends summary+recent raw messages through Model API and records only usage metadata", async () => {
    const s = await approved(); const captured = vi.fn(); const runs = createPromptRunRepository(db);
    const api = createModelApi({ getConfig: () => config, getStatus: () => ({ configured: true, baseUrl: config.baseUrl, model: config.model, missing: [] }), summaries: s.repo, runs, createProvider: () => ({ async *stream(request) { captured(request); yield { type: "delta", text: "保留预算约束，待完成事项仍待处理。" }; yield { type: "done" }; } }) });
    const result = await api.stream(new Request("https://app.test/stream", { method: "POST", body: JSON.stringify({ trigger: "retry", conversation: { id: s.conversation.id, title: "摘要", activeLeafId: s.leaf }, useSummary: true, searchMode: "off", prompt: [{ kind: "conversation", source: "conversation", role: "user", content: "伪造客户端正文不应替换真实分支" }] }) }));
    expect(result.status).toBe(200); const stream = await result.text(); expect(stream).toContain('"compressed":true'); expect(stream).not.toContain("伪造客户端正文");
    expect(captured.mock.calls[0][0].messages.filter((m: { role: string }) => m.role !== "system")).toHaveLength(6);
    const [run] = await db.select().from(schema.promptRuns); expect(run.summaryUsage?.sourceCount).toBe(14); expect(JSON.stringify(run)).not.toContain("预算最多30元");
  });
});
