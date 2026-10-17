import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase, type MigrationRow, type MigrationSession } from "@/lib/db/migrations";
import { createMemoryPalaceRepository } from "@/lib/repositories/memoryPalaceRepository";
import { createKnowledgeRepository } from "@/lib/repositories/knowledgeRepository";
import { createMemoryPalaceApi } from "@/lib/api/memoryPalaceApi";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { createMemorizationService } from "@/lib/memorization/service";
import { PluginCapabilityGateway, createPluginStorageCapabilityAdapter } from "@/lib/plugins/capabilityGateway";
import { PluginRegistry } from "@/lib/plugins/pluginRegistry";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import { createPluginRepository } from "@/lib/repositories/pluginRepository";
import { createPluginCapabilityRepository } from "@/lib/repositories/pluginCapabilityRepository";
import { createPluginStorageRepository } from "@/lib/repositories/pluginStorageRepository";
import { assertPalaceSource, validateLayout, type PalaceView, type PalaceOperation } from "@/lib/memory/palace";
import { summaryInstructionForMode } from "@/lib/conversation/summary";
const session = (pg: Pick<PGlite, "query">): MigrationSession => ({ execute: async (query, parameters = []) => (await pg.query<MigrationRow>(query, [...parameters])).rows });
const migrationsDb = (pg: PGlite) => ({ ...session(pg), transaction: <T>(fn: (tx: MigrationSession) => Promise<T>) => pg.transaction((tx) => fn(session(tx))) });

describe("R5.5 memory palace and authorized learning loop", () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repo: ReturnType<typeof createMemoryPalaceRepository>;
  let learning: ReturnType<typeof createMemorizationService>;
  let policy: ReturnType<typeof createPluginCapabilityRepository>;
  let gateway: PluginCapabilityGateway;
  let invoke: MockInstance<PluginCapabilityGateway["invoke"]>;
  beforeEach(async () => {
    pg = new PGlite(); await migrateDatabase(migrationsDb(pg), await loadMigrations()); db = drizzle(pg, { schema });
    const registry = new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS);
    await createPluginRepository(db, registry).setEnabled({ pluginId: "study.memorization", enabled: true, expectedVersion: 0, now: new Date() });
    policy = createPluginCapabilityRepository(db, registry);
    await policy.setGrant({ pluginId: "study.memorization", capabilityId: "storage.read-write", granted: true, expectedVersion: 0, now: new Date() });
    gateway = new PluginCapabilityGateway(policy, [createPluginStorageCapabilityAdapter(createPluginStorageRepository(db))]);
    invoke = vi.spyOn(gateway, "invoke"); learning = createMemorizationService(gateway); repo = createMemoryPalaceRepository(db, learning);
  });
  afterEach(async () => { vi.restoreAllMocks(); await pg.close(); });
  async function room(purpose: PalaceView["purpose"] = "navigation", module: "professional" | "memorization" | "game" = "professional") {
    const created = await repo.create({ title: "合成宫殿", purpose });
    return repo.mutate(created.id, { operation: "add-room", expectedVersion: 1, title: "书房", module });
  }
  async function memory() {
    const [candidate] = await db.insert(schema.memoryCandidates).values({ userId: LOCAL_USER_ID, content: "喜欢数学", kind: "preference", evidenceQuote: "喜欢数学", sensitivity: "low", confidence: 100, reason: "合成测试", status: "confirmed", resolvedAt: new Date() }).returning();
    return (await db.insert(schema.memoryItems).values({ userId: LOCAL_USER_ID, candidateId: candidate.id, content: "喜欢数学", kind: "preference", useCount: 3 }).returning())[0];
  }
  async function bind(palace: PalaceView, source: Extract<PalaceOperation, { operation: "add-locus" }>["source"], label = "门口") {
    return repo.mutate(palace.id, { operation: "add-locus", expectedVersion: palace.version, roomId: palace.rooms[0].id, label, association: "门口的数学树", source });
  }
  it("persists only references, edits/reorders layout with CAS, and deletes no original source", async () => {
    let p = await room(); const m = await memory(); p = await bind(p, { kind: "memory", id: m.id });
    const locus = p.rooms[0].loci[0];
    expect(JSON.stringify(p.rooms)).not.toContain("喜欢数学");
    expect(await repo.resolve(p.id, locus.id)).toMatchObject({ status: "ready", text: "喜欢数学", useCount: 3 });
    expect((await db.select().from(schema.memoryItems))[0].useCount).toBe(3); // Viewing is not model usage.
    await expect(repo.mutate(p.id, { operation: "rename", title: "stale", expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(bind(p, { kind: "memory", id: m.id })).rejects.toThrow("重复");
    p = await repo.mutate(p.id, { operation: "edit-locus", locusId: locus.id, label: "窗台", association: "新联想", expectedVersion: p.version });
    expect((await repo.get(p.id)).rooms[0].loci[0].label).toBe("窗台");
    await repo.delete(p.id, p.version); expect(await repo.list()).toEqual([]);
    expect((await db.select().from(schema.memoryItems))[0].content).toBe("喜欢数学");
  });
  it("refuses changed, expired and deleted personal memory without returning old bodies", async () => {
    let p = await room(); const m = await memory(); p = await bind(p, { kind: "memory", id: m.id }); const locus = p.rooms[0].loci[0];
    await db.update(schema.memoryItems).set({ version: 2, content: "新版私人正文" }).where(eq(schema.memoryItems.id, m.id));
    expect(await repo.resolve(p.id, locus.id)).toEqual({ status: "changed" });
    p = await repo.mutate(p.id, { operation: "rebind", locusId: locus.id, source: { kind: "memory", id: m.id }, expectedVersion: p.version });
    expect((await repo.resolve(p.id, locus.id)).text).toBe("新版私人正文");
    await db.update(schema.memoryItems).set({ validUntil: new Date(0) }).where(eq(schema.memoryItems.id, m.id));
    expect(await repo.resolve(p.id, locus.id)).toEqual({ status: "expired" });
    await db.delete(schema.memoryItems).where(eq(schema.memoryItems.id, m.id));
    expect(await repo.resolve(p.id, locus.id)).toEqual({ status: "missing" });
  });
  it("checks owner, room domain and document version before resolving knowledge text", async () => {
    let p = await room(); const kb = createKnowledgeRepository(db); const c = await kb.createCollection({ title: "证据", module: "professional", description: "" });
    const input = { title: "原文", sourceKey: "source", format: "text" as const, content: "原始证据", sourceUrl: "", fileName: "" };
    const doc = await kb.saveDocument(c.id, input); p = await bind(p, { kind: "knowledge", id: doc.id });
    const locus = p.rooms[0].loci[0]; expect((await repo.resolve(p.id, locus.id)).text).toBe("原始证据");
    await kb.saveDocument(c.id, { ...input, content: "更正证据" }, { id: doc.id, expectedVersion: 1 });
    expect(await repo.resolve(p.id, locus.id)).toEqual({ status: "changed" });
    expect(await repo.source("navigation", "game", { kind: "knowledge", id: doc.id })).toEqual({ status: "missing" });
    const foreign = crypto.randomUUID(); await db.insert(schema.users).values({ id: foreign });
    await db.update(schema.memoryPalaces).set({ userId: foreign }).where(eq(schema.memoryPalaces.id, p.id));
    expect(await repo.list()).toEqual([]); await expect(repo.get(p.id)).rejects.toMatchObject({ status: 404 });
    await expect(repo.mutate(p.id, { operation: "rename", title: "forged", expectedVersion: p.version })).rejects.toMatchObject({ status: 404 });
  });
  it("reuses authorized units, reads each material once per route and writes one deterministic review", async () => {
    let p = await room("learning", "memorization");
    const stored = await learning.create({ title: "合成英语", sourceText: "alpha beta", units: [{ cue: "第一词", content: "alpha" }, { cue: "第二词", content: "beta" }] });
    for (const unit of stored.material.units) p = await bind(p, { kind: "unit", id: stored.material.id, unitId: unit.id }, unit.cue);
    invoke.mockClear(); const plan = await repo.route(p.id, p.rooms[0].id, "ordered", "seed", 24);
    expect(invoke.mock.calls.filter(([input]) => input.capabilityId === "storage.read-write")).toHaveLength(1);
    expect(JSON.stringify(plan)).not.toContain("alpha"); expect(plan.steps).toHaveLength(2);
    expect((await repo.route(p.id, p.rooms[0].id, "random", "seed", 24)).steps).toEqual((await repo.route(p.id, p.rooms[0].id, "random", "seed", 24)).steps);
    const locus = p.rooms[0].loci[0]; const target = await repo.resolve(p.id, locus.id);
    const result = await repo.review(p.id, locus.id, p.version, target.storageVersion!, "alpah");
    expect(result.evaluation.source).toBe("deterministic"); expect(result.evaluation.spelling?.changes.length).toBeGreaterThan(0);
    expect(result.material.attempts).toHaveLength(1); expect(result.material.units[0].nextReviewAt).toBeTruthy();
    await expect(repo.review(p.id, locus.id, p.version, target.storageVersion!, "alpha")).rejects.toMatchObject({ status: 409 });
    expect((await learning.get(stored.material.id))?.material.attempts).toHaveLength(1);
    expect((await repo.resolve(p.id, locus.id)).status).toBe("ready"); // Review state is not source revision.
    expect(invoke.mock.calls.some(([input]) => input.capabilityId === "model.generate")).toBe(false);
    expect((await repo.route(p.id, p.rooms[0].id, "weak", "seed", 24)).steps[0].locusId).toBe(p.rooms[0].loci[1].id);
    expect((await repo.route(p.id, p.rooms[0].id, "due", "seed", 24)).steps[0].locusId).toBe(p.rooms[0].loci[1].id);
  });
  it("invalidates replaced material and rechecks plugin grants on every new request", async () => {
    let p = await room("learning", "memorization"); const stored = await learning.create({ title: "正文", sourceText: "旧材料", units: [{ cue: "提示", content: "旧答案" }] });
    p = await bind(p, { kind: "unit", id: stored.material.id, unitId: stored.material.units[0].id });
    const locus = p.rooms[0].loci[0];
    await learning.update(stored.material.id, { title: "更正", sourceText: "新材料", units: [{ cue: "提示", content: "新答案" }], expectedVersion: stored.storageVersion });
    expect(await repo.resolve(p.id, locus.id)).toEqual({ status: "changed" });
    expect((await repo.route(p.id, p.rooms[0].id, "ordered", "seed", 24)).blocked).toEqual([locus.id]);
    await expect(repo.review(p.id, locus.id, p.version, stored.storageVersion, "旧答案")).rejects.toMatchObject({ status: 409 });
    await policy.setGrant({ pluginId: "study.memorization", capabilityId: "storage.read-write", granted: false, expectedVersion: 1, now: new Date() });
    await expect(repo.resolve(p.id, locus.id)).rejects.toMatchObject({ code: "CAPABILITY_NOT_GRANTED" });
    await expect(repo.route(p.id, p.rooms[0].id, "ordered", "seed", 24)).rejects.toThrow();
    await expect(repo.catalog("memorization")).rejects.toThrow();
  });
  it("fences simultaneous duplicate reviews and removed material without losing the first record", async () => {
    let p = await room("learning", "memorization"); const stored = await learning.create({ title: "并发", sourceText: "alpha", units: [{ cue: "词", content: "alpha" }] });
    p = await bind(p, { kind: "unit", id: stored.material.id, unitId: stored.material.units[0].id }); const locus = p.rooms[0].loci[0];
    const results = await Promise.allSettled([repo.review(p.id, locus.id, p.version, 1, "alpha"), repo.review(p.id, locus.id, p.version, 1, "alpha")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = (await learning.get(stored.material.id))!; expect(current.material.attempts).toHaveLength(1);
    await learning.delete(stored.material.id, { expectedVersion: current.storageVersion });
    expect(await repo.resolve(p.id, locus.id)).toEqual({ status: "missing" });
    expect((await repo.route(p.id, p.rooms[0].id, "ordered", "seed", 24)).steps).toEqual([]);
    await expect(repo.review(p.id, locus.id, p.version, current.storageVersion, "alpha")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects foreign source IDs, isolates catalog domains and moves only layout references", async () => {
    let p = await room(); const a = await memory(); const b = await memory();
    p = await bind(p, { kind: "memory", id: a.id }, "左"); p = await bind(p, { kind: "memory", id: b.id }, "右");
    p = await repo.mutate(p.id, { operation: "move-locus", locusId: p.rooms[0].loci[1].id, direction: "up", expectedVersion: p.version });
    expect(p.rooms[0].loci.map((l) => l.label)).toEqual(["右", "左"]);
    const foreign = crypto.randomUUID(); await db.insert(schema.users).values({ id: foreign });
    await db.update(schema.memoryItems).set({ userId: foreign }).where(eq(schema.memoryItems.id, b.id));
    expect(await repo.resolve(p.id, p.rooms[0].loci[0].id)).toEqual({ status: "missing" });
    expect((await repo.catalog("professional")).memories.map((m) => m.id)).toEqual([a.id]);
    expect((await repo.catalog("game")).memories).toEqual([]);
    const learningPalace = await repo.create({ title: "学习", purpose: "learning" });
    await expect(repo.mutate(learningPalace.id, { operation: "add-room", title: "错误域", module: "game", expectedVersion: 1 })).rejects.toMatchObject({ status: 403 });
  });
  it("rejects cross-domain personal facts before any learning read and validates strict API/CAS", async () => {
    const p = await room("navigation", "game"); const m = await memory(); invoke.mockClear();
    await expect(bind(p, { kind: "memory", id: m.id })).rejects.toMatchObject({ status: 403 }); expect(invoke).not.toHaveBeenCalled();
    const api = createMemoryPalaceApi(repo); const request = (method: string, body?: unknown) => new Request("http://localhost/api/v1/memory-palaces", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    expect((await api.handle(request("POST", { title: "forged", purpose: "navigation", userId: LOCAL_USER_ID }))).status).toBe(400);
    expect((await api.handle(request("PATCH", { operation: "rename", title: "x", expectedVersion: 1 }), [p.id])).status).toBe(409);
    expect((await api.handle(request("POST", { locusId: crypto.randomUUID(), expectedVersion: p.version, expectedStorageVersion: 1, recitation: "x", mode: "semantic" }), [p.id, "review"])).status).toBe(400);
    expect((await api.handle(request("GET"))).headers.get("cache-control")).toBe("no-store");
    expect((await api.handle(request("GET"), ["catalog"])).status).toBe(400);
  });
  it("enforces room/position caps, duplicate IDs and purpose boundaries", async () => {
    const p = await room(); const m = await memory(); const bound = await bind(p, { kind: "memory", id: m.id }); const r = bound.rooms[0];
    expect(() => validateLayout(Array(7).fill(r))).toThrow();
    expect(() => validateLayout([{ ...r, loci: Array(25).fill(r.loci[0]) }])).toThrow();
    expect(() => validateLayout([{ ...r, loci: [{ ...r.loci[0], id: r.id }] }])).toThrow("唯一");
    expect(() => assertPalaceSource("learning", "professional", { kind: "memory", id: m.id })).toThrow();
    expect(() => assertPalaceSource("navigation", "companion", { kind: "knowledge", id: m.id })).toThrow();
    expect(() => assertPalaceSource("navigation", "game", { kind: "unit", id: m.id, unitId: m.id })).toThrow();
    for (let n = 1; n < 6; n++) { const current = await repo.get(p.id); await repo.mutate(p.id, { operation: "add-room", title: `${n}`, module: "professional", expectedVersion: current.version }); }
    const current = await repo.get(p.id); await expect(repo.mutate(p.id, { operation: "add-room", title: "overflow", module: "professional", expectedVersion: current.version })).rejects.toThrow();
    expect((await repo.get(p.id)).rooms).toHaveLength(6);
  });
  it("rolls only the new layout migration back and up, preserving source data", async () => {
    await room(); const m = await memory(); const migrations = await loadMigrations();
    expect(await rollbackDatabase(migrationsDb(pg), migrations)).toBe("0032_memory_controls.sql");
    expect(await rollbackDatabase(migrationsDb(pg), migrations)).toBe("0031_memory_palaces.sql");
    expect((await db.select().from(schema.memoryItems))[0].id).toBe(m.id);
    expect(await migrateDatabase(migrationsDb(pg), migrations)).toEqual(["0031_memory_palaces.sql", "0032_memory_controls.sql"]);
    expect(await repo.list()).toEqual([]);
  });
});

it("specializes summary focus without promoting fiction, suggestions or completed task state", () => {
  expect(summaryInstructionForMode("companion")).toContain("情绪只是当时表达");
  expect(summaryInstructionForMode("reflection")).toContain("目标—行动—反馈");
  expect(summaryInstructionForMode("entertainment")).toContain("不读取现实人格/记忆");
  expect(summaryInstructionForMode("professional")).toContain("证据版本");
  expect(summaryInstructionForMode("unknown")).toContain("不扩大记忆范围");
});
