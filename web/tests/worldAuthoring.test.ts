import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase } from "@/lib/db/migrations";
import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { createGameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { createGameNarrativeGenerator, GameNarrativeGenerationError, type GameNarrativeGeneratorPort } from "@/lib/game/gameNarrativeGenerator";
import { createWorldGenerationService, WORLD_CREATION_PROMPT_VERSION } from "@/lib/game/worlds/generation";
import { seededWorldBlueprint as blankWorldBlueprint } from "./helpers/worldBlueprint";
import { compileWorld, worldDraftIssues } from "@/lib/game/worlds/compile";
import { WORLD_SECTIONS, type WorldBrief } from "@/lib/game/worlds/contracts";
import { startWorld, applyExplorationAction } from "@/lib/game/exploration/engine";
import { explorationStateSchema } from "@/lib/game/exploration/contracts";
import { explorationMessages } from "@/lib/game/exploration/prompt";
import { createGameWorldApi } from "@/lib/api/gameWorldApi";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { createGameTurnSchema } from "@/lib/game/contracts";

const brief: WorldBrief = { brief: "蒸汽时代的无魔法港城，来访者调查旧记录。", constraints: ["禁止复活", "人物不能读心"], magic: "forbidden", numericPolicy: "qualitative" };
function blueprint(input = brief) {
  const content = blankWorldBlueprint(input);
  content.overview.name = "合成铜湾";
  content.overview.era = "蒸汽时代"; content.overview.technology = "蒸汽机与电报";
  content.overview.cultures = ["居民敬重可核对的契约"];
  content.authorNotes = ["SYNTH_HOST_NOTE"];
  content.lore = [
    { id: "notice", text: "公开告示SYNTH_NOTICE", kind: "fact", locationId: "arrival", visibility: "public", knownBy: ["guide"] },
    { id: "secret", text: "SYNTH_AUTHOR_SECRET", kind: "rumor", locationId: "arrival", visibility: "author", knownBy: [] },
  ];
  return content;
}

describe("R10.3 persisted world creation and playable revisions", () => {
  const pglite = new PGlite(); const db = drizzle(pglite, { schema });
  const repo = createGameWorldRepository(db); const sessions = createGameSessionRepository(db);
  beforeAll(async () => { await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations()); });
  afterAll(async () => { await pglite.close(); });
  const filled = async () => { const row = await repo.create(brief); return repo.update(row.id, { expectedVersion: row.version, input: brief, content: blueprint(), lockedSections: [] }); };

  it("validates reference graphs, explicit policies and visible conflicts before publishing", () => {
    expect(worldDraftIssues(brief, blueprint())).toEqual([]);
    const broken = blueprint(); broken.region.locations[1].exits = []; broken.characters[0].locationId = "missing";
    broken.overview.usesSupernatural = true; broken.ranks.levelsPerTier = 3; broken.conflicts = ["历史待核对"];
    expect(worldDraftIssues(brief, broken).join(" ")).toMatch(/无法返回/);
    expect(worldDraftIssues(brief, broken).join(" ")).toMatch(/地点不存在/);
    expect(worldDraftIssues(brief, broken).join(" ")).toMatch(/硬约束冲突/);
    expect(worldDraftIssues(brief, broken).join(" ")).toMatch(/定性世界/);
    expect(worldDraftIssues(brief, broken).join(" ")).toMatch(/历史待核对/);
    const light = { ...brief, numericPolicy: "light" as const };
    expect(worldDraftIssues(light, blueprint()).join(" ")).toMatch(/每阶等级/);
  });

  it("runs both numeric policies through the same engine without manufacturing qualitative levels", () => {
    for (const numericPolicy of ["qualitative", "light"] as const) {
      const input = { ...brief, numericPolicy }; const world = compileWorld(crypto.randomUUID(), 1, input, blueprint(input));
      const resolve = () => world; let state = startWorld(world.id, world.version, resolve);
      expect(state.progress.level).toBe(numericPolicy === "light" ? 1 : undefined);
      expect(explorationStateSchema.safeParse({ ...state, progress: { ...state.progress, level: numericPolicy === "light" ? undefined : 1 } }).success).toBe(false);
      state = applyExplorationAction(state, { action: "investigate", targetId: "arrival-discovery" }, "investigate", resolve);
      expect(JSON.stringify(state.history)).toContain("SYNTH_NOTICE");
      expect(JSON.stringify(state)).not.toContain("SYNTH_AUTHOR_SECRET");
      state = applyExplorationAction(state, { action: "choose", eventId: "first-meeting", choiceId: "decline" }, "decline", resolve);
      expect(state.view.events[0].settled).toBe(true);
      expect(() => applyExplorationAction(state, { action: "choose", eventId: "first-meeting", choiceId: "accept" }, "again", resolve)).toThrow();
      state = applyExplorationAction(state, { action: "move", targetId: "crossroads" }, "move", resolve);
      expect(state.locationId).toBe("crossroads");
    }
  });

  it("persists drafts, rejects stale edits and foreign owners, and requires explicit publication confirmation", async () => {
    const row = await filled();
    await expect(repo.update(row.id, { expectedVersion: 1, input: brief, content: blueprint(), lockedSections: [] })).rejects.toMatchObject({ code: "WORLD_VERSION_CONFLICT" });
    expect((await repo.get(row.id)).version).toBe(2);
    const api = createGameWorldApi(repo);
    const response = await api(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ expectedVersion: row.version, confirmed: true }) }), [row.id, "publish"]);
    expect(response.status).toBe(400); expect(await repo.revisions(row.id)).toEqual([]);
    const foreign = crypto.randomUUID(); const foreignWorld = crypto.randomUUID();
    await pglite.query("INSERT INTO users(id) VALUES ($1)", [foreign]);
    await pglite.query("INSERT INTO game_world_drafts(id,user_id,input) VALUES ($1,$2,$3)", [foreignWorld, foreign, JSON.stringify(brief)]);
    await expect(repo.get(foreignWorld)).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
    expect((await repo.list()).map((item) => item.id)).not.toContain(foreignWorld);
    expect(JSON.stringify(await repo.list())).not.toContain("SYNTH_HOST_NOTE");
    const broken = blueprint(); broken.overview.usesSupernatural = true;
    const updated = await repo.update(row.id, { expectedVersion: row.version, input: brief, content: broken, lockedSections: [] });
    await expect(repo.publish(row.id, updated.version)).rejects.toMatchObject({ code: "WORLD_INVALID" });
    expect(await repo.revisions(row.id)).toEqual([]);
  });

  it("retains world rules and author secrets during host budget fallback, or fails visibly rather than dropping them", () => {
    const world = compileWorld(crypto.randomUUID(), 1, brief, blueprint()); const resolve = () => world;
    const state = startWorld(world.id, world.version, resolve);
    state.conditions = Array.from({ length: 20 }, () => "SYNTH_LONG_CONDITION".repeat(30));
    state.characters.guide.knownInformation = Array.from({ length: 20 }, () => "SYNTH_LONG_INFORMATION".repeat(25));
    const messages = explorationMessages(state, "观察", undefined, [], [], undefined, resolve);
    const context = messages.at(-2)!.content as string; const parsed = JSON.parse(context.slice(context.indexOf("\n") + 1));
    expect(parsed.conditions).toBeUndefined(); expect(parsed.rules).toContain("人物不能读心");
    expect(context).toContain("SYNTH_HOST_NOTE"); expect(context).toContain("SYNTH_AUTHOR_SECRET");
    const huge = blueprint(); huge.authorNotes = Array.from({ length: 12 }, () => "H".repeat(590));
    huge.lore = Array.from({ length: 12 }, (_, i) => ({ id: `secret-${i}`, text: "S".repeat(590), kind: "fact", locationId: "arrival", visibility: "author", knownBy: [] }));
    const oversized = compileWorld(crypto.randomUUID(), 1, brief, huge);
    expect(() => explorationMessages(startWorld(oversized.id, oversized.version, () => oversized), "观察", undefined, [], [], undefined, () => oversized)).toThrow("超出预算");
  });

  it("publishes immutable revisions, creates idempotent saves and reloads the pinned world for real turns", async () => {
    const row = await filled(); const published = await repo.publish(row.id, row.version);
    expect(await repo.publish(row.id, row.version)).toEqual(published);
    expect(await repo.revisions(row.id)).toHaveLength(1);
    const requestId = crypto.randomUUID(); let current = await repo.createSave(row.id, 1, requestId);
    expect((await repo.createSave(row.id, 1, requestId)).id).toBe(current.id);
    expect(current.worldRules).toContain("人物不能读心"); expect(current.worldPremise).toBe(brief.brief);
    current = await sessions.updateStatus(current.id, { expectedVersion: current.version, status: "active", now: new Date() });
    const content = blueprint(); content.overview.name = "新版铜湾"; content.overview.technology = "SYNTH_NEW_TECH";
    const changed = await repo.update(row.id, { expectedVersion: row.version, input: brief, content, lockedSections: [] });
    expect((await repo.publish(row.id, changed.version)).revision).toBe(2);
    await expect(repo.createSave(row.id, 2, requestId)).rejects.toMatchObject({ code: "WORLD_VERSION_CONFLICT" });
    const freshRepo = createGameWorldRepository(db); // No global/static registration or warm-process cache needed.
    const requests: ModelStreamRequest[] = [];
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }),
      createProvider: () => ({ stream: async function* (request) { requests.push(structuredClone(request)); yield { type: "delta", text: '{"narrative":"合成向导回应","statePatch":{}}' }; } }) });
    const service = createGameTurnService(sessions, generator, () => new Date(), () => crypto.randomUUID(), freshRepo.resolveSessionTemplate);
    const run = async (extra: object) => { current = await service.create(current.id, createGameTurnSchema.parse({ content: "合成操作", expectedVersion: current.version,
      parentTurnId: current.activeLeafTurnId, requestId: crypto.randomUUID(), ...extra })); };
    await run({ explorationAction: { action: "start", templateId: `world-${row.id}`, templateVersion: "1.0.1" } });
    expect(requests).toHaveLength(0);
    expect(current.turns.at(-1)!.stateSnapshot.exploration!.view.world).toBe("合成铜湾");
    await run({ explorationAction: { action: "talk", targetId: "guide" }, narrate: true,
      semanticInput: [{ kind: "dialogue", text: "你好", targetId: "guide", channel: "direct" }] });
    expect(requests).toHaveLength(1);
    const actor = JSON.stringify(requests[0]); expect(actor).toContain("蒸汽机与电报"); expect(actor).toContain("SYNTH_NOTICE");
    expect(actor).not.toMatch(/SYNTH_AUTHOR_SECRET|SYNTH_HOST_NOTE|SYNTH_NEW_TECH/);
    const world = await freshRepo.resolveSessionTemplate(current.id, `world-${row.id}`, "1.0.1");
    const director = JSON.stringify(explorationMessages(current.turns.at(-1)!.stateSnapshot.exploration!, "观察", undefined, [], [], undefined, () => world));
    expect(director).toContain("SYNTH_HOST_NOTE"); expect(director).toContain("SYNTH_AUTHOR_SECRET");
    expect(world.setting?.cultures).toEqual(["居民敬重可核对的契约"]);
    await expect(freshRepo.resolveSessionTemplate(current.id, world.id, "1.0.2")).rejects.toMatchObject({ code: "WORLD_INVALID" });
    await run({ explorationAction: { action: "move", targetId: "crossroads" } });
    expect(current.turns.at(-1)!.stateSnapshot.exploration!.locationId).toBe("crossroads");
    const loaded = await sessions.get(current.id); expect(loaded?.turns).toHaveLength(3);
    const serialized = JSON.stringify(loaded); expect(serialized).not.toMatch(/SYNTH_HOST_NOTE|SYNTH_AUTHOR_SECRET|SYNTH_NEW_TECH/);
    await expect(pglite.query("DELETE FROM game_world_revisions WHERE world_id=$1 AND revision=1", [row.id])).rejects.toThrow();
    expect((await pglite.query<{ count: number }>("SELECT count(*)::int AS count FROM scheduled_tasks")).rows[0].count).toBe(0);
  });

  it("generates only requested unlocked sections, records actual Provider purpose and replays without another call", async () => {
    const row = await filled();
    const locked = await repo.update(row.id, { expectedVersion: row.version, input: brief, content: blueprint(), lockedSections: ["overview"] });
    const requests: ModelStreamRequest[] = [];
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }),
      createProvider: () => ({ stream: async function* (request) { requests.push(structuredClone(request)); yield { type: "delta", text: JSON.stringify({ opening: { text: "合成新开场", playerRole: "调查者" } }) }; } }) });
    const service = createWorldGenerationService(repo, generator); const input = { expectedVersion: locked.version, requestId: crypto.randomUUID(), sections: ["opening", "overview"] };
    const [first, duplicate] = await Promise.all([service.generate(row.id, input), service.generate(row.id, input)]);
    expect(first).toEqual(duplicate); expect(requests).toHaveLength(1); expect(requests[0].promptVersion).toBe(WORLD_CREATION_PROMPT_VERSION);
    expect(requests[0].outputProfile).toBe("world-section");
    expect(first.content?.overview).toEqual(locked.content?.overview); expect(first.content?.opening.text).toBe("合成新开场");
    expect(first.origins.opening).toBe("ai"); expect(first.origins.overview).toBe("user");
    expect(JSON.parse(requests[0].messages.at(-1)!.content as string).requestedSections).toEqual(["opening"]);
    const context = JSON.parse(requests[0].messages.at(-1)!.content as string);
    expect(context.operation).toBe("regenerate");
    expect(context.current).not.toHaveProperty("opening");
    expect(context.current.overview).toEqual(locked.content!.overview);
    expect((await createWorldGenerationService(repo, generator).generate(row.id, input)).version).toBe(first.version);
    expect(requests).toHaveLength(1);
    await expect(service.generate(row.id, { ...input, sections: ["region"] })).rejects.toMatchObject({ code: "WORLD_VERSION_CONFLICT" });
    await expect(service.generate(row.id, { ...input, requestId: crypto.randomUUID(), expectedVersion: first.version, sections: ["overview"] })).rejects.toMatchObject({ code: "WORLD_INVALID" });
    expect(requests).toHaveLength(1); expect(await repo.revisions(row.id)).toEqual([]);
  });

  it("regenerates the same brief repeatedly without using replacement targets as source, then cold-loads the newest draft", async () => {
    const original = await filled();
    const payloads: { operation: string; input: WorldBrief; current: unknown }[] = [];
    const generator = { generate: vi.fn<GameNarrativeGeneratorPort["generate"]>(async (messages) => {
      payloads.push(JSON.parse(messages.at(-1)!.content as string));
      const next = blueprint(); next.overview.name = `全新设计${payloads.length}`; next.region.name = `新区域${payloads.length}`;
      return { content: JSON.stringify(next), model: "synthetic" };
    }) };
    const service = createWorldGenerationService(repo, generator);
    const firstRequest = { expectedVersion: original.version, requestId: crypto.randomUUID(), sections: [...WORLD_SECTIONS] };
    const first = await service.generate(original.id, firstRequest);
    const replay = await createWorldGenerationService(repo, generator).generate(original.id, firstRequest);
    expect(replay).toEqual(first); expect(generator.generate).toHaveBeenCalledOnce();
    const second = await service.generate(original.id, { ...firstRequest, expectedVersion: first.version, requestId: crypto.randomUUID() });
    expect(first.content!.overview.name).toBe("全新设计1");
    expect(second.content!.overview.name).toBe("全新设计2");
    expect(second.content!.region.name).toBe("新区域2");
    expect(second.version).toBe(original.version + 2);
    expect(await createGameWorldRepository(db).get(original.id)).toEqual(second);
    expect(payloads).toEqual([1, 2].map(() => ({ operation: "regenerate", input: brief, current: {}, requestedSections: [...WORLD_SECTIONS], lockedSections: [] })));
    expect(original.content!.overview.name).toBe("合成铜湾");
    expect(await repo.revisions(original.id)).toEqual([]);
  });

  it("does not report an identical model response as a new saved version or retry it automatically", async () => {
    const row = await filled();
    // Key order is not a meaningful change.
    const overview = Object.fromEntries(Object.entries(row.content!.overview).reverse());
    const generate = vi.fn<GameNarrativeGeneratorPort["generate"]>().mockResolvedValue({ content: JSON.stringify({ overview }), model: "synthetic" });
    const api = createGameWorldApi(repo, createWorldGenerationService(repo, { generate }));
    const response = await api(new Request(`http://test.invalid/api/v1/game-worlds/${row.id}/generate`, { method: "POST",
      body: JSON.stringify({ expectedVersion: row.version, requestId: crypto.randomUUID(), sections: ["overview"] }) }), [row.id, "generate"]);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({ code: "WORLD_GENERATION_FAILED", message: expect.stringContaining("完全相同"), retryable: false });
    expect(await repo.get(row.id)).toEqual(row);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("initially generates all sections, but malformed, canceled, stale and racing outputs never overwrite prior edits", async () => {
    const row = await repo.create(brief); const generation = { expectedVersion: row.version, requestId: crypto.randomUUID(), sections: [...WORLD_SECTIONS] };
    const generate = vi.fn<GameNarrativeGeneratorPort["generate"]>(async () => ({ content: JSON.stringify(blueprint()), model: "synthetic" }));
    const service = createWorldGenerationService(repo, { generate });
    await expect(service.generate(row.id, { ...generation, sections: ["opening"] })).rejects.toMatchObject({ code: "WORLD_INVALID" });
    expect(generate).not.toHaveBeenCalled();
    const complete = await service.generate(row.id, generation); expect(complete.content?.region.locations).toHaveLength(2);
    expect(generate.mock.calls[0][2]).toMatchObject({ outputProfile: "world-authoring" });
    await expect(service.generate(row.id, { ...generation, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "WORLD_VERSION_CONFLICT" });
    expect(generate).toHaveBeenCalledOnce();
    const partial = { expectedVersion: complete.version, requestId: crypto.randomUUID(), sections: ["opening"] };
    generate.mockResolvedValueOnce({ content: '{"overview":{"name":"illegal extra"}}', model: "synthetic" });
    await expect(service.generate(row.id, partial)).rejects.toMatchObject({ code: "WORLD_GENERATION_FAILED" });
    expect(await repo.get(row.id)).toEqual(complete);
    const controller = new AbortController(); controller.abort(); const calls = generate.mock.calls.length;
    await expect(service.generate(row.id, { ...partial, requestId: crypto.randomUUID() }, controller.signal)).rejects.toMatchObject({ code: "WORLD_GENERATION_FAILED" });
    expect(generate.mock.calls).toHaveLength(calls);
    const racing = createWorldGenerationService(repo, { generate: async () => {
      await repo.update(row.id, { expectedVersion: complete.version, input: brief, content: blueprint(), lockedSections: ["opening"] });
      return { content: JSON.stringify({ opening: { text: "不应覆盖", playerRole: "调查者" } }), model: "synthetic" };
    } });
    await expect(racing.generate(row.id, { ...partial, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "WORLD_VERSION_CONFLICT" });
    expect((await repo.get(row.id)).lockedSections).toEqual(["opening"]);
  });

  it("reports truncated world output with actionable recovery, preserving drafts without a retry", async () => {
    const row = await repo.create(brief);
    const generate = vi.fn<GameNarrativeGeneratorPort["generate"]>().mockRejectedValue(new GameNarrativeGenerationError("PROVIDER_OUTPUT_TRUNCATED", "length", false));
    const api = createGameWorldApi(repo, createWorldGenerationService(repo, { generate }));
    const response = await api(new Request(`http://test.invalid/api/v1/game-worlds/${row.id}/generate`, { method: "POST",
      body: JSON.stringify({ expectedVersion: row.version, requestId: crypto.randomUUID(), sections: [...WORLD_SECTIONS] }) }), [row.id, "generate"]);
    expect(response.status).toBe(502);
    const failure = await response.json();
    expect(failure.error).toMatchObject({ code: "PROVIDER_OUTPUT_TRUNCATED", retryable: false });
    expect(failure.error.message).toContain("起始表单"); expect(failure.error.message).toContain("没有自动重试");
    expect(failure.error.message).toContain("默认未设置应用输出Token配额");
    expect(generate).toHaveBeenCalledOnce(); expect(await repo.get(row.id)).toEqual(row);
    expect(await repo.revisions(row.id)).toEqual([]);
  });

  it("returns bounded field diagnostics and the failed result only to its author, without saving it", async () => {
    const row = await repo.create(brief); const broken = JSON.parse(JSON.stringify(blueprint()));
    delete broken.characters[0].profile.privateBackground;
    const rawOutput = JSON.stringify(broken);
    const generate = vi.fn<GameNarrativeGeneratorPort["generate"]>().mockResolvedValue({ content: rawOutput, model: "synthetic" });
    const api = createGameWorldApi(repo, createWorldGenerationService(repo, { generate }));
    const requestId = crypto.randomUUID();
    const response = await api(new Request(`http://test.invalid/api/v1/game-worlds/${row.id}/generate`, { method: "POST",
      body: JSON.stringify({ expectedVersion: row.version, requestId, sections: [...WORLD_SECTIONS] }) }), [row.id, "generate"]);
    expect(response.status).toBe(422); const failure = await response.json();
    expect(failure.error.details).toMatchObject({ worldId: row.id, expectedVersion: row.version, requestId, rawOutput, rawComplete: true,
      issues: expect.arrayContaining([expect.objectContaining({ path: "characters.0.profile.privateBackground" })]) });
    expect(await repo.get(row.id)).toEqual(row); expect(generate).toHaveBeenCalledOnce();
    const messages = generate.mock.calls[0][0]; expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("privateBackground");
    expect(messages[0].content).toContain("profile.faction");
    expect(messages[0].content).toContain("不能写空串");
    expect(messages[0].content).toContain("itemRules.slots数组只放英文ID");
    expect(messages[0].content).toContain("普通创作补全、篇幅选择与生成过程说明不属于冲突");
    expect(JSON.parse(messages.at(-1)!.content as string)).not.toHaveProperty("example");
    expect(messages[0].content).not.toContain(brief.brief); expect(messages[1].content).not.toContain(brief.brief);
  });

  it("fences a newer authoring downgrade without deleting existing game sessions", async () => {
    const migrationDB = createPgliteMigrationDatabase(pglite); const migrations = await loadMigrations();
    // New R10.4 data deliberately fences a lossy downgrade; old sessions still remain intact.
    await expect(rollbackDatabase(migrationDB, migrations)).resolves.toBe("0037_game_event_designs.sql");
    await expect(rollbackDatabase(migrationDB, migrations)).resolves.toBe("0036_game_item_draws.sql");
    await expect(rollbackDatabase(migrationDB, migrations)).rejects.toThrow("R10.4 authoring data exists");
    await migrateDatabase(migrationDB, migrations);
    const before = (await pglite.query<{ count: number }>("SELECT count(*)::int AS count FROM game_sessions")).rows[0].count;

    expect((await pglite.query<{ count: number }>("SELECT count(*)::int AS count FROM game_sessions")).rows[0].count).toBe(before);
    await expect(migrateDatabase(migrationDB, migrations)).resolves.toEqual([]);
  });
});
