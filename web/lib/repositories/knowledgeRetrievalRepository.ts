import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { conversations, messages, knowledgeCollections as collections, knowledgeDocuments as documents, knowledgeChunks as chunks } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { MEMORY_DOMAIN_POLICIES, memoryModuleForConversationMode, type MemoryModuleId } from "@/lib/memory/domainPolicy";
import { assessMemorySourceRead, type MemoryReadContext } from "@/lib/memory/sourceReference";
import { KnowledgeError } from "./knowledgeRepository";
import { KNOWLEDGE_CANDIDATE_LIMIT, KNOWLEDGE_RETRIEVAL_VERSION, knowledgeNeedles, knowledgeQueryGroups, rankKnowledge, type KnowledgeRetrievalResult } from "@/lib/knowledge/retrieval";

export const knowledgeSearchInputSchema = z.object({ consumer: z.enum(["professional", "reflection", "news", "reading", "tasks", "memorization", "problem-solving", "game"]), collectionIds: z.array(z.uuid()).min(1).max(10).refine((values) => new Set(values).size === values.length), query: z.string().trim().min(1).max(500) }).strict();
export class KnowledgeRetrievalRepository<T extends PgQueryResultHKT> {
  constructor(private readonly database: PgDatabase<T, typeof schema>) {}
  async search(raw: z.infer<typeof knowledgeSearchInputSchema>): Promise<KnowledgeRetrievalResult> {
    const started = performance.now(); const input = knowledgeSearchInputSchema.parse(raw);
    const policy = MEMORY_DOMAIN_POLICIES[input.consumer];
    // Explicit IDs express user selection, not authority: resolve owner and stored module first.
    const allowedModules = [...policy.collectionModules] as Array<(typeof collections.$inferSelect)["module"]>;
    const selected = await this.database.select({ id: collections.id, module: collections.module }).from(collections).where(and(eq(collections.userId, LOCAL_USER_ID), inArray(collections.id, input.collectionIds), inArray(collections.module, allowedModules)));
    if (selected.length !== input.collectionIds.length || !policy.knowledge.maxItems) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "所选集合已删除、无权访问或不属于当前模式，请重新选择。");
    const groups = knowledgeQueryGroups(input.query);
    const empty = (): KnowledgeRetrievalResult => ({ status: "no-match", hits: [], candidateCount: 0, estimatedTokens: 0, durationMs: performance.now() - started, version: KNOWLEDGE_RETRIEVAL_VERSION });
    if (!groups.length) return empty();
    const coarseMatches = groups.map((group) => {
      const terms = group.map((term) => or(...knowledgeNeedles(term).flatMap((needle) => {
        const pattern = `%${needle.replace(/[\\%_]/gu, (value) => `\\${value}`)}%`;
        return [ilike(chunks.content, pattern), ilike(chunks.heading, pattern), ilike(documents.title, pattern)];
      })));
      return sql`(${sql.join(terms.map((predicate) => sql`case when ${predicate} then 1 else 0 end`), sql` + `)}) >= ${Math.ceil(group.length * 0.6)}`;
    });
    const candidates = await this.database.select({ ownerId: documents.userId, collectionId: documents.collectionId, module: collections.module, documentId: documents.id, chunkId: chunks.id, title: documents.title, heading: chunks.heading, content: chunks.content, version: documents.version, contentHash: documents.contentHash, chunkHash: chunks.contentHash, startLine: chunks.startLine, endLine: chunks.endLine }).from(chunks)
      .innerJoin(documents, and(eq(chunks.documentId, documents.id), eq(chunks.documentVersion, documents.version)))
      .innerJoin(collections, and(eq(documents.collectionId, collections.id), eq(documents.userId, collections.userId)))
      .where(and(eq(documents.userId, LOCAL_USER_ID), eq(collections.userId, LOCAL_USER_ID), inArray(collections.id, selected.map((value) => value.id)), inArray(collections.module, allowedModules), or(...coarseMatches)))
      .orderBy(asc(documents.id), asc(chunks.ordinal)).limit(KNOWLEDGE_CANDIDATE_LIMIT + 1);
    if (candidates.length > KNOWLEDGE_CANDIDATE_LIMIT) return { ...empty(), status: "too-broad", candidateCount: candidates.length };
    const ranked = rankKnowledge(candidates, input.query, policy.knowledge);
    const context: MemoryReadContext = { ownerId: LOCAL_USER_ID, consumer: input.consumer, collections: selected.map((value) => ({ module: value.module, collectionId: value.id })), datasets: [], conversation: null, game: null };
    if (ranked.hits.some((hit) => !assessMemorySourceRead(context, hit.reference, new Date()).allowed)) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "资料来源范围发生变化，请重试。");
    return { ...ranked, durationMs: performance.now() - started };
  }
  async forConversation(conversationId: string, messageId: string | null, collectionIds: string[]): Promise<{ result: KnowledgeRetrievalResult; consumer: MemoryModuleId; query: string }> {
    const [source] = messageId ? await this.database.select({ mode: conversations.mode, content: messages.content, role: messages.role }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(and(eq(conversations.userId, LOCAL_USER_ID), eq(conversations.id, conversationId), eq(messages.id, messageId))).limit(1) : [];
    const consumer = source ? memoryModuleForConversationMode(source.mode) : null;
    if (!source || source.role !== "user" || !consumer || !MEMORY_DOMAIN_POLICIES[consumer].knowledge.maxItems) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "当前模式或真实问题不允许使用所选资料。");
    const query = source.content.trim().slice(0, 500);
    const input = knowledgeSearchInputSchema.parse({ consumer, query, collectionIds });
    return { result: await this.search(input), consumer, query };
  }
}
export function createKnowledgeRetrievalRepository<T extends PgQueryResultHKT>(database: PgDatabase<T, typeof schema>) { return new KnowledgeRetrievalRepository(database); }
