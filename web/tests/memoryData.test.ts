import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase, type MigrationSession, type MigrationRow } from "@/lib/db/migrations";
import { createMemoryDataRepository } from "@/lib/repositories/memoryDataRepository";
import { createMemoryControlRepository } from "@/lib/repositories/memoryControlRepository";
import { createMemoryRepository } from "@/lib/repositories/memoryRepository";
import { createMemoryDataApi } from "@/lib/api/memoryDataApi";
import { DEFAULT_MEMORY_CONTROLS } from "@/lib/memory/controls";
import { parseMemoryPackage, previewMemoryPackage } from "@/lib/memory/archive";
import { createKnowledgeRepository } from "@/lib/repositories/knowledgeRepository";
import { createKnowledgeRetrievalRepository } from "@/lib/repositories/knowledgeRetrievalRepository";
import { createMemoryPalaceRepository } from "@/lib/repositories/memoryPalaceRepository";
import { createConversationRepository, LOCAL_USER_ID as owner } from "@/lib/repositories/conversationRepository";
import { createPromptRunRepository } from "@/lib/repositories/promptRunRepository";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";
const session = (pg: Pick<PGlite, "query">): MigrationSession => ({ execute: async (query, parameters = []) => (await pg.query<MigrationRow>(query, [...parameters])).rows });
const migrationsDb = (pg: PGlite) => ({ ...session(pg), transaction: <T>(fn: (tx: MigrationSession) => Promise<T>) => pg.transaction((tx) => fn(session(tx))) });
const doc = { title: "数学证据", sourceKey: "math", format: "markdown" as const, content: "# 数学\n矩阵乘法需要按行列计算。", sourceUrl: "", fileName: "" };
describe("R5.6 user controls, portable data and source-index recovery", () => {
  let pg: PGlite; let db: ReturnType<typeof drizzle<typeof s>>;
  beforeEach(async () => { pg = new PGlite(); await migrateDatabase(migrationsDb(pg), await loadMigrations()); db = drizzle(pg, { schema: s }); await db.insert(s.users).values({ id: owner }); });
  afterEach(async () => pg.close());
  async function memory(sensitivity: "low" | "sensitive" = "low") {
    const [candidate] = await db.insert(s.memoryCandidates).values({ userId: owner, kind: "goal", content: "数学目标", evidenceQuote: "不应导出的完整证据", sensitivity, confidence: 100, reason: "合成", status: "confirmed", resolvedAt: new Date() }).returning();
    return (await db.insert(s.memoryItems).values({ userId: owner, candidateId: candidate.id, kind: "goal", content: "数学目标", sensitivity }).returning())[0];
  }
  async function library() { const repo = createKnowledgeRepository(db); const collection = await repo.createCollection({ title: "合成资料", module: "professional", description: "" }); const saved = await repo.saveDocument(collection.id, doc); return { repo, collection, saved }; }
  async function conversation() { const repo = createConversationRepository(db); const c = await repo.createConversation({ title: "合成对话", mode: "professional" }); const m = await repo.appendMessage(c.id, { parentMessageId: null, role: "user", content: "数学矩阵乘法", citations: [], model: null, status: "complete" }); return { c, m: m.message }; }
  it("defaults to existing behavior, filters sensitive memories and fences cross-device setting conflicts", async () => {
    const controls = createMemoryControlRepository(db); expect(await controls.get()).toEqual({ settings: DEFAULT_MEMORY_CONTROLS, version: 0 });
    const a = await memory(); const b = await memory("sensitive"); const memories = createMemoryRepository(db);
    expect((await memories.retrieve("数学", new Date())).map((m) => m.id)).toContain(b.id);
    const settings = structuredClone(DEFAULT_MEMORY_CONTROLS); settings.professional.allowSensitive = false;
    await controls.update(settings, 0); expect((await memories.retrieve("数学", new Date())).map((m) => m.id)).toEqual([a.id]);
    expect((await memories.retrieve("数学", new Date(), "companion")).map((m) => m.id)).toContain(b.id);
    await expect(controls.update(DEFAULT_MEMORY_CONTROLS, 0)).rejects.toThrow("另一端");
    settings.professional.enabled = false; await controls.update(settings, 1);
    expect(await memories.retrieve("数学", new Date())).toEqual([]); expect((await memories.list()).length).toBe(2);
    expect((await controls.get()).version).toBe(2);
  });
  it("rechecks settings between retrieval and Run start, without a provider call or usage write", async () => {
    await memory("sensitive"); const { c, m } = await conversation(); const selected = await createMemoryRepository(db).retrieve("数学", new Date());
    const settings = structuredClone(DEFAULT_MEMORY_CONTROLS); settings.professional.allowSensitive = false;
    await createMemoryControlRepository(db).update(settings, 0);
    await expect(createPromptRunRepository(db).start(await createTestPromptEnvelope({ conversationId: c.id, activeLeafId: m.id }), selected)).rejects.toMatchObject({ code: "PROMPT_CONTEXT_CONFLICT" });
    expect(await db.select().from(s.promptRuns)).toEqual([]); expect(await db.select().from(s.memoryUsages)).toEqual([]);
  });
  it("exports only selected owner data, excludes credentials, raw chats, candidates and derived bodies", async () => {
    const mem = await memory(); const { repo, collection, saved } = await library(); const hidden = await repo.createCollection({ title: "不选集合", module: "game", description: "" }); await repo.saveDocument(hidden.id, { ...doc, content: "未选资料私密正文" });
    await db.insert(s.modelCredentials).values({ userId: owner, provider: "mock", baseUrl: "https://example.test", model: "mock", encryptedApiKey: "FAKE-ENCRYPTED-KEY", apiKeyHint: "fake" });
    const palace = await createMemoryPalaceRepository(db, { list: async () => [], get: async () => null, review: async () => null }).create({ title: "合成布局", purpose: "navigation" });
    const data = createMemoryDataRepository(db); const file = await data.export({ memories: true, palaces: true, collectionIds: [collection.id] });
    expect(file.memories[0].id).toBe(mem.id); expect(file.collections[0].documents[0].id).toBe(saved.id); expect(file.palaces[0].id).toBe(palace.id);
    expect(file.controls).toEqual(DEFAULT_MEMORY_CONTROLS);
    for (const secret of ["FAKE-ENCRYPTED-KEY", "未选资料私密正文", "不应导出的完整证据", "chunks", "userId", "candidateId"]) expect(JSON.stringify(file)).not.toContain(secret);
    expect(parseMemoryPackage(JSON.stringify(file))).toEqual(file);
    const minimal = await data.export({ memories: false, palaces: false, collectionIds: [collection.id] });
    expect(minimal.memories).toEqual([]); expect(minimal.palaces).toEqual([]); expect(minimal.controls).toBeUndefined();
    const foreign = crypto.randomUUID(); await db.insert(s.users).values({ id: foreign }); const [other] = await db.insert(s.knowledgeCollections).values({ userId: foreign, title: "其他用户", module: "professional" }).returning();
    await expect(data.export({ memories: false, palaces: false, collectionIds: [other.id] })).rejects.toThrow("不可访问");
    expect((await data.manifest()).collections.map((c) => c.id)).not.toContain(other.id);
  });
  it("previews locally without writes, reports ID/version conflicts and rejects malformed or oversized packages", async () => {
    await memory(); const data = createMemoryDataRepository(db); const file = await data.export({ memories: true, palaces: false, collectionIds: [] }); const manifest = await data.manifest();
    expect(previewMemoryPackage(file, manifest).memories[0].state).toBe("same-id-version");
    const altered = structuredClone(file); altered.memories[0].version++; altered.memories.push({ ...altered.memories[0], id: crypto.randomUUID() });
    expect(previewMemoryPackage(altered, manifest).memories.map((m) => m.state)).toEqual(["version-conflict", "new-id"]);
    expect(previewMemoryPackage(altered, manifest).writes).toBe(0); expect((await data.export({ memories: true, palaces: false, collectionIds: [] })).memories).toEqual(file.memories);
    for (const invalid of [{ ...file, apiKey: "bad" }, { ...file, schemaVersion: 99 }, { ...file, memories: [...file.memories, file.memories[0]] }]) expect(() => parseMemoryPackage(JSON.stringify(invalid))).toThrow();
    expect(() => parseMemoryPackage("x".repeat(4_000_001))).toThrow("4MB");
  });
  it("exposes only request-context metadata, including deleted source status, never old body", async () => {
    const mem = await memory(); const { c, m } = await conversation(); const { collection } = await library();
    const selected = await createMemoryRepository(db).retrieve("数学", new Date()); const found = await createKnowledgeRetrievalRepository(db).search({ consumer: "professional", collectionIds: [collection.id], query: "矩阵乘法" });
    await createPromptRunRepository(db).start(await createTestPromptEnvelope({ conversationId: c.id, activeLeafId: m.id }), selected, { consumer: "professional", collectionIds: [collection.id], result: found });
    const data = createMemoryDataRepository(db); const usage = await data.usage();
    expect(usage[0].memories[0]).toMatchObject({ id: mem.id, currentState: "present" }); expect(usage[0].knowledge?.sources).toHaveLength(1);
    expect(JSON.stringify(usage)).not.toContain("矩阵乘法需要"); expect(JSON.stringify(usage)).not.toContain("数学目标");
    await createMemoryRepository(db).delete(mem.id, 1);
    expect((await data.usage())[0].memories[0].currentState).toBe("deleted-or-unavailable");
  });
  it("rebuilds only changed derived segments, preserving root versions, other documents and no-op IDs", async () => {
    const { repo, collection, saved } = await library(); const other = await repo.saveDocument(collection.id, { ...doc, sourceKey: "other" });
    const original = await repo.getDocument(saved.id); const otherIds = (await repo.getDocument(other.id)).chunks.map((c) => c.id);
    expect((await repo.rebuildDocument(saved.id, 1)).rebuilt).toBe(false); expect((await repo.getDocument(saved.id)).chunks.map((c) => c.id)).toEqual(original.chunks.map((c) => c.id));
    await db.update(s.knowledgeChunks).set({ content: "损坏的派生正文" }).where(eq(s.knowledgeChunks.documentId, saved.id));
    expect((await repo.rebuildDocument(saved.id, 1)).rebuilt).toBe(true);
    const repaired = await repo.getDocument(saved.id); expect(repaired.contentHash).toBe(original.contentHash); expect(repaired.version).toBe(1); expect(repaired.chunks[0].content).toBe(doc.content);
    expect((await repo.getDocument(other.id)).chunks.map((c) => c.id)).toEqual(otherIds);
    await expect(repo.rebuildDocument(saved.id, 99)).rejects.toThrow();
  });
  it("falls back to bounded authorized source text, verifies virtual citations at Run time, then recovers index", async () => {
    const { repo, collection, saved } = await library(); await db.delete(s.knowledgeChunks).where(eq(s.knowledgeChunks.documentId, saved.id));
    const retrieval = createKnowledgeRetrievalRepository(db); const input = { consumer: "professional" as const, collectionIds: [collection.id], query: "矩阵乘法" };
    const result = await retrieval.search(input); expect(result.fallback).toBe("source-text"); expect(result.hits).toHaveLength(1);
    const { c, m } = await conversation(); const runs = createPromptRunRepository(db);
    const run = await runs.start(await createTestPromptEnvelope({ conversationId: c.id, activeLeafId: m.id }), [], { consumer: "professional", collectionIds: [collection.id], result });
    expect(run.knowledgeRetrieval?.fallback).toBe("source-text");
    const unselected = await repo.createCollection({ title: "未授权", description: "", module: "professional" }); await repo.saveDocument(unselected.id, doc);
    const foreignResult = await retrieval.search({ ...input, collectionIds: [unselected.id] }); foreignResult.fallback = "source-text";
    await expect(runs.start(await createTestPromptEnvelope({ runId: crypto.randomUUID(), conversationId: c.id, activeLeafId: m.id }), [], { consumer: "professional", collectionIds: [collection.id], result: foreignResult })).rejects.toMatchObject({ code: "PROMPT_CONTEXT_CONFLICT" });
    await repo.rebuildDocument(saved.id, 1); expect((await retrieval.search(input)).fallback).toBeUndefined();
    await repo.saveDocument(collection.id, { ...doc, content: "新版原文" }, { id: saved.id, expectedVersion: 1 });
    await expect(runs.start(await createTestPromptEnvelope({ runId: crypto.randomUUID(), conversationId: c.id, activeLeafId: m.id }), [], { consumer: "professional", collectionIds: [collection.id], result })).rejects.toMatchObject({ code: "PROMPT_CONTEXT_CONFLICT" });
    await expect(retrieval.search({ ...input, consumer: "game" })).rejects.toThrow();
  });
  it("handles the derived table being offline without treating a disconnected database as a successful lookup", async () => {
    const { collection, saved, repo } = await library(); await pg.exec("DROP TABLE knowledge_chunks");
    const readable = await repo.getDocument(saved.id, 1); expect(readable.content).toBe(doc.content); expect(readable.indexUnavailable).toBe(true); expect(readable.chunks).toEqual([]);
    const result = await createKnowledgeRetrievalRepository(db).search({ consumer: "professional", collectionIds: [collection.id], query: "矩阵乘法" });
    expect(result.fallback).toBe("source-text"); expect(result.hits).toHaveLength(1);
    const api = createMemoryDataApi(createMemoryDataRepository(db), createMemoryControlRepository(db));
    expect((await api.handle(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ settings: DEFAULT_MEMORY_CONTROLS, expectedVersion: 0, userId: owner }) }), ["controls"])).status).toBe(400);
    expect((await api.handle(new Request("http://localhost", { method: "POST", body: "{}" }), ["restore"])).status).toBe(405);
    const offline = createMemoryDataApi({ ...createMemoryDataRepository(db), manifest: async () => { throw new Error("private-db-connection-details"); } }, createMemoryControlRepository(db));
    const response = await offline.handle(new Request("http://localhost"), ["manifest"]); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-db-connection-details");
  });
  it("bounds source fallback before reading an oversized document set", async () => {
    const { saved } = await library(); const [root] = await db.select().from(s.knowledgeDocuments).where(eq(s.knowledgeDocuments.id, saved.id));
    await db.insert(s.knowledgeDocuments).values(Array.from({ length: 100 }, (_, n) => ({ ...root, id: crypto.randomUUID(), sourceKey: `bounded-${n}` })));
    await db.delete(s.knowledgeChunks).where(eq(s.knowledgeChunks.documentId, saved.id));
    await expect(createKnowledgeRetrievalRepository(db).search({ consumer: "professional", collectionIds: [root.collectionId], query: "数学" })).rejects.toMatchObject({ code: "KNOWLEDGE_LIMIT" });
  });
  it("refuses oversized exports without silently returning a truncated file", async () => {
    const { saved, collection } = await library(); const [root] = await db.select().from(s.knowledgeDocuments).where(eq(s.knowledgeDocuments.id, saved.id));
    await db.insert(s.knowledgeDocuments).values(Array.from({ length: 14 }, (_, n) => ({ ...root, id: crypto.randomUUID(), sourceKey: `large-${n}`, content: "字".repeat(100000) })));
    await expect(createMemoryDataRepository(db).export({ memories: false, palaces: false, collectionIds: [collection.id] })).rejects.toMatchObject({ status: 413 });
  });
  it("rolls controls down/up independently and leaves originals untouched", async () => {
    const m = await memory(); await createMemoryControlRepository(db).update(DEFAULT_MEMORY_CONTROLS, 0); const migrations = await loadMigrations();
    expect(await rollbackDatabase(migrationsDb(pg), migrations)).toBe("0032_memory_controls.sql");
    expect((await db.select().from(s.memoryItems))[0].id).toBe(m.id);
    expect(await migrateDatabase(migrationsDb(pg), migrations)).toEqual(["0032_memory_controls.sql"]);
    expect((await createMemoryControlRepository(db).get()).version).toBe(0);
  });
});
