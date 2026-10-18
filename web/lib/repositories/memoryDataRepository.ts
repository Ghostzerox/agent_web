import type { MemoryUsageRecord } from "@/lib/memory/controls";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as s from "@/lib/db/schema";
import { LOCAL_USER_ID as owner } from "./conversationRepository";
import { createMemoryControlRepository } from "./memoryControlRepository";
import { memoryExportSelectionSchema, memoryPackageSchema, MEMORY_PACKAGE_MAX_BYTES, type MemoryManifest } from "@/lib/memory/archive";
export class MemoryDataError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export function createMemoryDataRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof s>) {
  return {
    async manifest(): Promise<MemoryManifest> {
      const memories = await db.select({ id: s.memoryItems.id, version: s.memoryItems.version }).from(s.memoryItems).where(eq(s.memoryItems.userId, owner)).limit(1001);
      const collections = await db.select({ id: s.knowledgeCollections.id, version: s.knowledgeCollections.version, title: s.knowledgeCollections.title, module: s.knowledgeCollections.module }).from(s.knowledgeCollections).where(eq(s.knowledgeCollections.userId, owner));
      const documents = await db.select({ id: s.knowledgeDocuments.id, version: s.knowledgeDocuments.version }).from(s.knowledgeDocuments).innerJoin(s.knowledgeCollections, and(eq(s.knowledgeDocuments.collectionId, s.knowledgeCollections.id), eq(s.knowledgeCollections.userId, owner))).where(eq(s.knowledgeDocuments.userId, owner));
      const palaces = await db.select({ id: s.memoryPalaces.id, version: s.memoryPalaces.version }).from(s.memoryPalaces).where(eq(s.memoryPalaces.userId, owner));
      if (memories.length > 1000) throw new MemoryDataError("个人记忆超过1000条，请先在原模块分批管理。", 413);
      return { memories, collections, documents, palaces };
    },
    async export(raw: unknown) {
      const selection = memoryExportSelectionSchema.parse(raw);
      return db.transaction(async (tx) => {
        const collections = selection.collectionIds.length ? await tx.select().from(s.knowledgeCollections).where(and(eq(s.knowledgeCollections.userId, owner), inArray(s.knowledgeCollections.id, selection.collectionIds))) : [];
        if (collections.length !== selection.collectionIds.length) throw new MemoryDataError("所选集合已删除或不可访问，请刷新。");
        if (selection.collectionIds.length) {
          const [{ bytes, count }] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${s.knowledgeDocuments.content})),0)::int`, count: sql<number>`count(*)::int` }).from(s.knowledgeDocuments).where(and(eq(s.knowledgeDocuments.userId, owner), inArray(s.knowledgeDocuments.collectionId, selection.collectionIds)));
          if (bytes > MEMORY_PACKAGE_MAX_BYTES || count > 1000) throw new MemoryDataError("资料过大，请减少集合后分批导出。", 413);
        }
        const docs = selection.collectionIds.length ? await tx.select().from(s.knowledgeDocuments).where(and(eq(s.knowledgeDocuments.userId, owner), inArray(s.knowledgeDocuments.collectionId, selection.collectionIds))) : [];
        const memories = selection.memories ? await tx.select({ id: s.memoryItems.id, version: s.memoryItems.version, content: s.memoryItems.content, kind: s.memoryItems.kind, sensitivity: s.memoryItems.sensitivity, pinned: s.memoryItems.pinned, validUntil: s.memoryItems.validUntil }).from(s.memoryItems).where(eq(s.memoryItems.userId, owner)).limit(1001) : [];
        if (memories.length > 1000) throw new MemoryDataError("个人记忆超过1000条，请分批管理。", 413);
        const palaces = selection.palaces ? await tx.select({ id: s.memoryPalaces.id, title: s.memoryPalaces.title, purpose: s.memoryPalaces.purpose, version: s.memoryPalaces.version, rooms: s.memoryPalaces.rooms }).from(s.memoryPalaces).where(eq(s.memoryPalaces.userId, owner)) : [];
        const file = memoryPackageSchema.parse({ format: "ai-study-companion.memory-package", schemaVersion: 1, exportedAt: new Date().toISOString(), memories: memories.map((m) => ({ ...m, validUntil: m.validUntil?.toISOString() ?? null })), palaces,
          ...(selection.memories ? { controls: (await createMemoryControlRepository(tx).get()).settings } : {}),
          collections: collections.map((c) => ({ id: c.id, version: c.version, title: c.title, module: c.module, description: c.description, documents: docs.filter((d) => d.collectionId === c.id).map((d) => ({ id: d.id, version: d.version, title: d.title, sourceKey: d.sourceKey, format: d.format, content: d.content, sourceUrl: d.sourceUrl, fileName: d.fileName })) })) });
        if (new TextEncoder().encode(JSON.stringify(file)).length > MEMORY_PACKAGE_MAX_BYTES) throw new MemoryDataError("完整记忆包超过4MB，请减少所选范围。", 413);
        return file;
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async usage(): Promise<MemoryUsageRecord<Date>[]> {
      const runs = await db.select({ id: s.promptRuns.id, conversationId: s.promptRuns.conversationId, status: s.promptRuns.status, createdAt: s.promptRuns.createdAt, summary: s.promptRuns.summaryUsage, knowledge: s.promptRuns.knowledgeRetrieval }).from(s.promptRuns).innerJoin(s.conversations, and(eq(s.conversations.id, s.promptRuns.conversationId), eq(s.conversations.userId, owner))).where(eq(s.promptRuns.userId, owner)).orderBy(desc(s.promptRuns.createdAt)).limit(20);
      const used = runs.length ? await db.select({ runId: s.memoryUsages.promptRunId, memoryId: s.memoryUsages.memoryItemId, rank: s.memoryUsages.rank, estimatedTokens: s.memoryUsages.estimatedTokens, liveId: s.memoryItems.id, validUntil: s.memoryItems.validUntil }).from(s.memoryUsages).leftJoin(s.memoryItems, and(eq(s.memoryItems.id, s.memoryUsages.memoryItemId), eq(s.memoryItems.userId, owner))).where(and(eq(s.memoryUsages.userId, owner), inArray(s.memoryUsages.promptRunId, runs.map((r) => r.id)))).limit(100) : [];
      return runs.map((run) => ({ ...run, memories: used.filter((u) => u.runId === run.id).map((u) => ({ id: u.memoryId, rank: u.rank, estimatedTokens: u.estimatedTokens, currentState: !u.liveId ? "deleted-or-unavailable" : u.validUntil && u.validUntil <= new Date() ? "expired" : "present" })) }));
    },
  };
}
