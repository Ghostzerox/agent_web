import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { knowledgeCollections as collections, knowledgeDocuments as documents, knowledgeChunks as chunks, users } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { collectionInputSchema, documentInputSchema, KNOWLEDGE_CHUNK_STRATEGY, normalizeDocument, splitDocument, type CollectionInput, type DocumentInput } from "@/lib/knowledge/documents";
import { stableJson } from "@/lib/ai/stableJson";
import { documentSourceHash, sourceSegments, isMissingDerivedIndex } from "@/lib/knowledge/sourceIndex";

export class KnowledgeError extends Error {
  constructor(readonly code: "KNOWLEDGE_NOT_FOUND" | "KNOWLEDGE_CONFLICT" | "KNOWLEDGE_LIMIT", message: string) { super(message); this.name = "KnowledgeError"; }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const owner = LOCAL_USER_ID;
export class KnowledgeRepository<T extends PgQueryResultHKT> {
  constructor(private readonly database: PgDatabase<T, typeof schema>) {}
  async listCollections() {
    return this.database.select().from(collections).where(eq(collections.userId, owner)).orderBy(desc(collections.updatedAt), asc(collections.id));
  }
  async createCollection(raw: CollectionInput) {
    const input = collectionInputSchema.parse(raw);
    return this.database.transaction(async (tx) => {
      await tx.insert(users).values({ id: owner, displayName: "Local User" }).onConflictDoNothing();
      await tx.select({ id: users.id }).from(users).where(eq(users.id, owner)).for("update");
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(collections).where(eq(collections.userId, owner));
      if (count >= 50) throw new KnowledgeError("KNOWLEDGE_LIMIT", "最多保存 50 个知识集合。");
      return (await tx.insert(collections).values({ ...input, userId: owner }).returning())[0];
    });
  }
  async updateCollection(id: string, input: Pick<CollectionInput, "title" | "description">, expectedVersion: number) {
    // The domain cannot be silently changed underneath future grants/indexes.
    const values = collectionInputSchema.omit({ module: true }).parse(input);
    const [updated] = await this.database.update(collections).set({ ...values, version: sql`${collections.version} + 1`, updatedAt: new Date() }).where(and(eq(collections.id, id), eq(collections.userId, owner), eq(collections.version, expectedVersion))).returning();
    if (!updated) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "集合已变更或不存在，请刷新。");
    return updated;
  }
  async deleteCollection(id: string, expectedVersion: number) {
    const [deleted] = await this.database.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, owner), eq(collections.version, expectedVersion))).returning({ id: collections.id });
    if (!deleted) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "集合已变更或不存在，请刷新。");
  }
  private async collection(id: string) {
    const [row] = await this.database.select().from(collections).where(and(eq(collections.id, id), eq(collections.userId, owner)));
    if (!row) throw new KnowledgeError("KNOWLEDGE_NOT_FOUND", "找不到知识集合。");
    return row;
  }
  async listDocuments(collectionId: string) {
    await this.collection(collectionId);
    return this.database.select({ id: documents.id, collectionId: documents.collectionId, title: documents.title, sourceKey: documents.sourceKey, format: documents.format, sourceUrl: documents.sourceUrl, fileName: documents.fileName, contentHash: documents.contentHash, version: documents.version, updatedAt: documents.updatedAt }).from(documents).where(and(eq(documents.collectionId, collectionId), eq(documents.userId, owner))).orderBy(desc(documents.updatedAt), asc(documents.id));
  }
  async getDocument(id: string, expectedVersion?: number) {
    const [document] = await this.database.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, owner), expectedVersion === undefined ? undefined : eq(documents.version, expectedVersion)));
    if (!document) throw new KnowledgeError("KNOWLEDGE_NOT_FOUND", "找不到该版本的知识文档，可能已更正或删除；不会用新版本冒充旧引用。");
    try {
      const segments = await this.database.select().from(chunks).where(and(eq(chunks.documentId, id), eq(chunks.documentVersion, document.version))).orderBy(asc(chunks.ordinal));
      return { ...document, chunks: segments, indexUnavailable: false };
    } catch (error) {
      if (!isMissingDerivedIndex(error)) throw error;
      // Source remains readable when its derived table is unavailable; do not invent persisted locators.
      return { ...document, chunks: [], indexUnavailable: true };
    }
  }
  async saveDocument(collectionId: string, raw: DocumentInput, edit?: { id: string; expectedVersion: number }) {
    const input = documentInputSchema.parse(raw);
    input.content = normalizeDocument(input.content);
    documentInputSchema.parse(input);
    const contentHash = hash(stableJson({ ...input, strategy: KNOWLEDGE_CHUNK_STRATEGY }));
    return this.database.transaction(async (tx) => {
      const [collection] = await tx.select().from(collections).where(and(eq(collections.id, collectionId), eq(collections.userId, owner))).for("update");
      if (!collection) throw new KnowledgeError("KNOWLEDGE_NOT_FOUND", "找不到知识集合。");
      const [existing] = await tx.select().from(documents).where(and(eq(documents.collectionId, collectionId), eq(documents.userId, owner), edit ? eq(documents.id, edit.id) : eq(documents.sourceKey, input.sourceKey))).for("update");
      if (edit && (!existing || existing.version !== edit.expectedVersion || existing.sourceKey !== input.sourceKey)) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "文档已变更，或来源标识不一致，请刷新。");
      if (!edit && existing) {
        if (existing.contentHash === contentHash) return { id: existing.id, version: existing.version, duplicate: true };
        throw new KnowledgeError("KNOWLEDGE_CONFLICT", "该来源标识已存在；请打开原文档后明确更正，不能通过重新导入覆盖。");
      }
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(documents).where(eq(documents.collectionId, collectionId));
      if (!edit && count >= 100) throw new KnowledgeError("KNOWLEDGE_LIMIT", "每个集合最多 100 篇文档。");
      const version = existing ? existing.version + 1 : 1;
      const values = { ...input, contentHash, chunkStrategy: KNOWLEDGE_CHUNK_STRATEGY, version, updatedAt: new Date() };
      const [saved] = existing ? await tx.update(documents).set(values).where(eq(documents.id, existing.id)).returning() : await tx.insert(documents).values({ ...values, collectionId, userId: owner }).returning();
      await tx.delete(chunks).where(eq(chunks.documentId, saved.id));
      const segments = splitDocument(input.content);
      // A bounded document may still have many short sections: cap explicitly, never silently truncate.
      if (segments.length > 256) throw new KnowledgeError("KNOWLEDGE_LIMIT", "分段超过 256 段，请拆成较小文档。");
      if (segments.length) await tx.insert(chunks).values(segments.map((segment) => ({ ...segment, documentId: saved.id, documentVersion: version, contentHash: hash(segment.content) })));
      await tx.update(collections).set({ version: sql`${collections.version} + 1`, updatedAt: new Date() }).where(eq(collections.id, collectionId));
      return { id: saved.id, version, duplicate: false };
    });
  }
  async deleteDocument(id: string, expectedVersion: number) {
    // Same parent→child lock order as import/edit; parent version invalidates stale collection delete dialogs.
    const current = await this.getDocument(id);
    return this.database.transaction(async (tx) => {
      const [parent] = await tx.select().from(collections).where(and(eq(collections.id, current.collectionId), eq(collections.userId, owner))).for("update");
      if (!parent) throw new KnowledgeError("KNOWLEDGE_NOT_FOUND", "找不到集合。");
      const [deleted] = await tx.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, owner), eq(documents.version, expectedVersion))).returning({ id: documents.id });
      if (!deleted) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "文档已变更，请刷新。");
      await tx.update(collections).set({ version: sql`${collections.version} + 1`, updatedAt: new Date() }).where(eq(collections.id, current.collectionId));
    });
  }
  async rebuildDocument(id: string, expectedVersion: number) {
    const current = await this.getDocument(id, expectedVersion);
    return this.database.transaction(async (tx) => {
      const [parent] = await tx.select().from(collections).where(and(eq(collections.id, current.collectionId), eq(collections.userId, owner))).for("update");
      const [row] = await tx.select().from(documents).where(and(eq(documents.id, id), eq(documents.userId, owner), eq(documents.version, expectedVersion))).for("update");
      if (!parent || !row) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "来源已变化，请刷新后重建。");
      const root = { title: row.title, sourceKey: row.sourceKey, format: row.format, content: row.content, sourceUrl: row.sourceUrl, fileName: row.fileName };
      if (documentSourceHash(root) !== row.contentHash || row.chunkStrategy !== KNOWLEDGE_CHUNK_STRATEGY) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "原文或策略不一致，请通过原文更正保存，不静默重写事实版本。");
      const expected = sourceSegments(row.content); if (expected.length > 256) throw new KnowledgeError("KNOWLEDGE_LIMIT", "分段过多，请拆分原文。");
      const stored = await tx.select().from(chunks).where(eq(chunks.documentId, id)).orderBy(asc(chunks.ordinal));
      const intact = stored.length === expected.length && stored.every((part, n) => part.documentVersion === row.version && ["ordinal", "content", "contentHash", "startLine", "endLine", "heading"].every((key) => part[key as keyof typeof part] === expected[n][key as keyof typeof expected[number]]));
      if (intact) return { documentId: id, version: row.version, rebuilt: false, chunks: expected.length };
      await tx.delete(chunks).where(eq(chunks.documentId, id));
      if (expected.length) await tx.insert(chunks).values(expected.map((part) => ({ ...part, documentId: id, documentVersion: row.version })));
      return { documentId: id, version: row.version, rebuilt: true, chunks: expected.length };
    });
  }
}
export function createKnowledgeRepository<T extends PgQueryResultHKT>(database: PgDatabase<T, typeof schema>) { return new KnowledgeRepository(database); }
