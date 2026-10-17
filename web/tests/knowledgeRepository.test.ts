import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase, type MigrationRow, type MigrationSession } from "@/lib/db/migrations";
import { createKnowledgeRepository } from "@/lib/repositories/knowledgeRepository";
import { createKnowledgeApi } from "@/lib/api/knowledgeApi";
import { createConversationRepository, LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { createMemoryCandidateRepository } from "@/lib/repositories/memoryCandidateRepository";
import { createMemoryCandidateService } from "@/lib/memory/memoryCandidateService";
import { createMemoryRepository } from "@/lib/repositories/memoryRepository";

const doc = { title: "学习资料", sourceKey: "chapter-1", format: "markdown" as const, content: "# 第一章\r\n本章的原文证据\r\n## 第二节\r\n更多说明", sourceUrl: "https://example.test/book", fileName: "test.md" };
const session = (db: Pick<PGlite, "query">): MigrationSession => ({ execute: async (query, parameters = []) => (await db.query<MigrationRow>(query, [...parameters])).rows });
const migrationDb = (db: PGlite) => ({ ...session(db), transaction: <T>(callback: (tx: MigrationSession) => Promise<T>) => db.transaction((tx) => callback(session(tx))) });

describe("R5.2 knowledge lifecycle and personal source deletion", () => {
  let pg: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  beforeEach(async () => { pg = new PGlite(); await migrateDatabase(migrationDb(pg), await loadMigrations()); database = drizzle(pg, { schema }); });
  afterEach(async () => pg.close());

  it("imports, locates, deduplicates, versions and replaces segments atomically, then deletes all derived bodies", async () => {
    const repo = createKnowledgeRepository(database);
    const collection = await repo.createCollection({ title: "数学", description: "材料", module: "professional" });
    const saved = await repo.saveDocument(collection.id, doc);
    const first = await repo.getDocument(saved.id);
    expect(first).toMatchObject({ version: 1, content: doc.content.replaceAll("\r\n", "\n"), chunkStrategy: "lines/r5.2-v1" });
    expect(first.chunks.map(({ startLine, endLine, heading }) => ({ startLine, endLine, heading }))).toEqual([{ startLine: 1, endLine: 2, heading: "第一章" }, { startLine: 3, endLine: 4, heading: "第二节" }]);
    expect(await repo.saveDocument(collection.id, doc)).toEqual({ id: first.id, version: 1, duplicate: true });
    expect((await repo.getDocument(first.id)).chunks.map((value) => value.id)).toEqual(first.chunks.map((value) => value.id));
    await expect(repo.saveDocument(collection.id, { ...doc, content: "不能通过重复导入覆盖" })).rejects.toMatchObject({ code: "KNOWLEDGE_CONFLICT" });
    const changed = { ...doc, content: "# 新版\n更正后的正文" };
    const second = await repo.saveDocument(collection.id, changed, { id: first.id, expectedVersion: 1 });
    expect(second.version).toBe(2);
    expect((await repo.getDocument(first.id)).chunks).toMatchObject([{ documentVersion: 2, content: changed.content }]);
    expect((await database.select().from(schema.knowledgeChunks)).some((value) => value.content.includes("原文证据"))).toBe(false);
    await expect(repo.saveDocument(collection.id, doc, { id: first.id, expectedVersion: 1 })).rejects.toMatchObject({ code: "KNOWLEDGE_CONFLICT" });
    await expect(repo.deleteDocument(first.id, 1)).rejects.toMatchObject({ code: "KNOWLEDGE_CONFLICT" });
    await expect(repo.deleteCollection(collection.id, 1)).rejects.toMatchObject({ code: "KNOWLEDGE_CONFLICT" });
    await repo.deleteDocument(first.id, 2);
    expect(await database.select().from(schema.knowledgeChunks)).toEqual([]);
    await expect(repo.getDocument(first.id)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
    const again = await repo.saveDocument(collection.id, doc);
    expect(again.id).not.toBe(first.id);
    const current = (await repo.listCollections())[0];
    const renamed = await repo.updateCollection(current.id, { title: "更新集合", description: "说明" }, current.version);
    expect(renamed.title).toBe("更新集合");
    await repo.deleteCollection(current.id, renamed.version);
    expect(await repo.listCollections()).toEqual([]);
    expect(await database.select().from(schema.knowledgeDocuments)).toEqual([]);
    expect(await database.select().from(schema.knowledgeChunks)).toEqual([]);
  });

  it("rolls back failed imports and replacement without retaining partial or stale chunks", async () => {
    const repo = createKnowledgeRepository(database);
    const collection = await repo.createCollection({ title: "原子性", module: "memorization", description: "" });
    const tooMany = { ...doc, content: Array.from({ length: 257 }, (_, index) => `# ${index}\n段落`).join("\n") };
    await expect(repo.saveDocument(collection.id, tooMany)).rejects.toMatchObject({ code: "KNOWLEDGE_LIMIT" });
    expect(await repo.listDocuments(collection.id)).toEqual([]);
    expect((await repo.listCollections())[0].version).toBe(1);
    const saved = await repo.saveDocument(collection.id, doc);
    await expect(repo.saveDocument(collection.id, tooMany, { id: saved.id, expectedVersion: 1 })).rejects.toMatchObject({ code: "KNOWLEDGE_LIMIT" });
    const retained = await repo.getDocument(saved.id);
    expect(retained.version).toBe(1);
    expect(retained.chunks).toHaveLength(2);
    await expect(repo.saveDocument(collection.id, { ...doc, content: "\0bad" })).rejects.toThrow();
  });

  it("filters owner and collection before returning any document body, with cross-owner FK protection", async () => {
    const foreign = "99999999-9999-4999-8999-999999999999";
    await database.insert(schema.users).values({ id: foreign });
    const [collection] = await database.insert(schema.knowledgeCollections).values({ userId: foreign, title: "Private", module: "game" }).returning();
    const [document] = await database.insert(schema.knowledgeDocuments).values({ userId: foreign, collectionId: collection.id, ...doc, contentHash: "a".repeat(64), chunkStrategy: "test" }).returning();
    const repo = createKnowledgeRepository(database);
    expect(await repo.listCollections()).toEqual([]);
    await expect(repo.getDocument(document.id)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
    await expect(repo.listDocuments(collection.id)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
    await expect(repo.saveDocument(collection.id, doc)).rejects.toMatchObject({ code: "KNOWLEDGE_NOT_FOUND" });
    await expect(repo.deleteCollection(collection.id, 1)).rejects.toMatchObject({ code: "KNOWLEDGE_CONFLICT" });
    await database.insert(schema.users).values({ id: LOCAL_USER_ID }).onConflictDoNothing();
    await expect(database.insert(schema.knowledgeDocuments).values({ userId: LOCAL_USER_ID, collectionId: collection.id, ...doc, sourceKey: "forged", contentHash: "b".repeat(64), chunkStrategy: "test" })).rejects.toThrow();
    expect((await database.select().from(schema.knowledgeDocuments))[0].content).toBe(doc.content);
  });

  it("validates API input, denies forged owner/scope/versions and does not fetch source URLs", async () => {
    const repo = createKnowledgeRepository(database); const api = createKnowledgeApi(repo);
    const request = (method: string, body?: unknown) => new Request("http://localhost/api/v1/knowledge", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect((await api.handle(request("POST", { title: "集合", module: "professional", userId: LOCAL_USER_ID }))).status).toBe(400);
    const collectionResponse = await api.handle(request("POST", { title: "集合", module: "reading" }));
    expect(collectionResponse.headers.get("cache-control")).toBe("no-store");
    const collection = (await collectionResponse.json()).data;
    expect((await api.handle(request("POST", doc), ["collections", collection.id, "documents"])).status).toBe(200);
    const listing = (await (await api.handle(request("GET"), ["collections", collection.id, "documents"])).json()).data;
    expect(listing[0].content).toBeUndefined();
    const id = listing[0].id;
    expect((await api.handle(request("PATCH", { ...doc, expectedVersion: 99 }), ["documents", id])).status).toBe(409);
    expect((await api.handle(request("PATCH", { title: "x", module: "game", expectedVersion: 1 }), ["collections", collection.id])).status).toBe(400);
    expect((await api.handle(request("POST", { ...doc, sourceUrl: "javascript:alert(1)" }), ["collections", collection.id, "documents"])).status).toBe(400);
    expect((await api.handle(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await api.handle(request("GET"), ["documents", "invalid-id"])).status).toBe(400);
    expect((await api.handle(request("GET"), ["unsupported"])).status).toBe(404);
    expect((await api.handle(request("DELETE", { expectedVersion: 1 }), ["documents", id])).status).toBe(200);
    expect((await api.handle(request("GET"), ["documents", id])).status).toBe(404);
  });

  it.each([false, true])("deletes source evidence transactionally; deleteRelatedMemories=%s", async (deleteRelatedMemories) => {
    const conversations = createConversationRepository(database);
    const conversation = await conversations.createConversation({ title: "删除来源", mode: "professional" });
    const message = await conversations.appendMessage(conversation.id, { parentMessageId: null, role: "user", content: "我的长期目标是学好数学", status: "complete", model: null, citations: [] });
    const candidates = createMemoryCandidateRepository(database);
    const proposal = await createMemoryCandidateService(candidates).proposeFromMessage(conversation.id, message.message.id, new Date());
    await candidates.confirm(proposal.candidate!.id, "目标：学好数学", 1, new Date());
    await database.insert(schema.memoryCandidates).values({ userId: LOCAL_USER_ID, sourceConversationId: conversation.id, kind: "fact", content: "pending secret", evidenceQuote: "pending secret", sensitivity: "personal", confidence: 80, reason: "test" });
    expect(await conversations.deleteConversation(conversation.id, { deleteRelatedMemories })).toBe(true);
    expect(await conversations.getConversation(conversation.id)).toBeNull();
    const memories = await createMemoryRepository(database).list();
    expect(memories).toHaveLength(deleteRelatedMemories ? 0 : 1);
    if (!deleteRelatedMemories) expect(memories[0]).toMatchObject({ content: "目标：学好数学", evidenceQuote: "", sourceConversationId: null, sourceMessageId: null });
    const remaining = await database.select().from(schema.memoryCandidates);
    expect(remaining.every((value) => !value.evidenceQuote && !value.content.includes("数学") && !value.content.includes("secret"))).toBe(true);
    expect(await conversations.deleteConversation(conversation.id)).toBe(false);
  });

  it("clears evidence independently and deletes the candidate copy when forgetting a memory", async () => {
    const conversations = createConversationRepository(database); const candidates = createMemoryCandidateRepository(database); const memories = createMemoryRepository(database);
    const conversation = await conversations.createConversation({ title: "独立记忆", mode: "professional" });
    const message = await conversations.appendMessage(conversation.id, { parentMessageId: null, role: "user", content: "我的长期目标是学好数学", status: "complete", model: null, citations: [] });
    const proposal = await createMemoryCandidateService(candidates).proposeFromMessage(conversation.id, message.message.id, new Date());
    await candidates.confirm(proposal.candidate!.id, "目标：数学", 1, new Date());
    const [item] = await memories.list();
    const updated = await memories.update({ ...item, expectedVersion: item.version, now: new Date(), clearSourceEvidence: true });
    expect(updated).toMatchObject({ content: "目标：数学", evidenceQuote: "", sourceMessageId: null, version: 2 });
    expect((await conversations.getConversation(conversation.id))?.messages).toHaveLength(1);
    await memories.delete(updated.id, updated.version);
    expect(await database.select().from(schema.memoryCandidates).where(and(eq(schema.memoryCandidates.id, item.candidateId), eq(schema.memoryCandidates.userId, LOCAL_USER_ID)))).toEqual([]);
  });

  it("upgrades old data, rolls back only the new library and re-applies the migration", async () => {
    const migrations = await loadMigrations();
    const conversations = createConversationRepository(database);
    const existing = await conversations.createConversation({ title: "保留旧数据", mode: "auto" });
    expect(await rollbackDatabase(migrationDb(pg), migrations)).toBe("0033_task_actions.sql");
    expect(await rollbackDatabase(migrationDb(pg), migrations)).toBe("0032_memory_controls.sql");
    expect(await rollbackDatabase(migrationDb(pg), migrations)).toBe("0031_memory_palaces.sql");
    expect(await rollbackDatabase(migrationDb(pg), migrations)).toBe("0030_conversation_summaries.sql");
    expect(await rollbackDatabase(migrationDb(pg), migrations)).toBe("0029_knowledge_retrieval_audit.sql");
    expect(await rollbackDatabase(migrationDb(pg), migrations)).toBe("0028_knowledge_library.sql");
    expect(await conversations.getConversation(existing.id)).not.toBeNull();
    expect(await migrateDatabase(migrationDb(pg), migrations)).toEqual(["0028_knowledge_library.sql", "0029_knowledge_retrieval_audit.sql", "0030_conversation_summaries.sql", "0031_memory_palaces.sql", "0032_memory_controls.sql", "0033_task_actions.sql"]);
    expect(await createKnowledgeRepository(database).listCollections()).toEqual([]);
  });
});
