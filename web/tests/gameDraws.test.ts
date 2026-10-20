import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase } from "@/lib/db/migrations";
import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { createGameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createGameDrawRepository } from "@/lib/repositories/gameDrawRepository";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { createGameTurnSchema } from "@/lib/game/contracts";
import { blankWorldBlueprint } from "@/lib/game/worlds/blueprint";
import { blankAssetDesign } from "@/lib/game/worlds/assetBlueprint";
import type { ItemDesign } from "@/lib/game/worlds/assetContracts";
import type { DrawEntry, DrawPool } from "@/lib/game/draws/contracts";
import { drawPoolIssues, eligibleDrawEntries, sampleDraw, weightedEntry } from "@/lib/game/draws/pools";
import { createDrawGenerationService, DRAW_ITEM_PROMPT_VERSION } from "@/lib/game/draws/generation";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import { createGameDrawApi } from "@/lib/api/gameDrawApi";
import { explorationMessages } from "@/lib/game/exploration/prompt";
import { perceptionScope } from "@/lib/game/exploration/perception";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";

const input = { brief: "合成无魔法港城", constraints: ["工艺必须来自港城"], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
const fixed = (id = "copper"): DrawEntry => ({ id, source: "fixed", definitionId: id, weight: 1, minQuantity: 2, maxQuantity: 2 });
const generated: DrawEntry = { id: "local-material", source: "generated", theme: "当地工艺材料", category: "material", quality: "ordinary", tier: "ordinary", rating: "ordinary", unique: false, weight: 1, minQuantity: 2, maxQuantity: 2 };
const pool = (id: string, entries: DrawEntry[], extra: Partial<DrawPool> = {}): DrawPool => ({ id, name: id, explanation: "场外虚构补给，不公开抽取记录。", locationId: null, minTick: 0, coinCost: 0, maxDraws: 5, replacement: true, entries, ...extra });

describe("R10.4.1 weighted host sampling", () => {
  it("P11 proves exact weight boundaries, zero exclusion, quantity endpoints and empty/invalid random handling", () => {
    const entries = [{ ...fixed(), weight: 1 }, { ...fixed("silk"), weight: 3 }, { ...fixed("zero"), weight: 0 }];
    expect(weightedEntry(entries, () => 0).id).toBe("copper"); expect(weightedEntry(entries, () => 0.249999).id).toBe("copper");
    expect(weightedEntry(entries, () => 0.25).id).toBe("silk"); expect(weightedEntry(entries, () => 0.999999).id).toBe("silk");
    expect(() => weightedEntry([], () => 0)).toThrow("没有可抽取"); expect(() => weightedEntry([entries[2]], () => 0)).toThrow();
    for (const invalid of [-1, 1, NaN, Infinity]) expect(() => weightedEntry(entries, () => invalid)).toThrow();
    expect(sampleDraw([{ ...fixed(), minQuantity: 1, maxQuantity: 3 }], "seed", () => 0).quantity).toBe(1);
    expect(sampleDraw([{ ...fixed(), minQuantity: 1, maxQuantity: 3 }], "seed", () => 0.99999).quantity).toBe(3);
    expect(sampleDraw(entries, "same")).toEqual(sampleDraw(entries, "same"));
  });
});

describe("R10.4.1 real SQL pending draws, branch snapshots and shared inventory", () => {
  const pg = new PGlite(); const db = drizzle(pg, { schema }); const migrationDb = createPgliteMigrationDatabase(pg);
  const worlds = createGameWorldRepository(db); const sessions = createGameSessionRepository(db); const draws = createGameDrawRepository(db);
  const neverGenerate = vi.fn(async () => ({ content: '{"narrative":"合成","statePatch":{}}', model: "synthetic" }));
  const turns = createGameTurnService(sessions, { generate: neverGenerate }, undefined, undefined, worlds.resolveSessionTemplate);
  beforeAll(async () => { await migrateDatabase(migrationDb, await loadMigrations()); }); afterAll(async () => { await pg.close(); });
  const setup = async (pools = [pool("fixed", [fixed()]), pool("keyword", [generated])], coins = 0) => {
    const created = await worlds.create(input); const content = blankWorldBlueprint(input);
    const material = blankAssetDesign("item", "copper", input, content) as ItemDesign; material.name = "合成铜片"; material.stackable = true; material.details.category = "material";
    content.items.definitions = [material]; content.drawPools = pools; content.authorNotes = ["SYNTH_HOST_SECRET"];
    const world = await worlds.update(created.id, { expectedVersion: created.version, input, content, lockedSections: [], drawPoolsConfirmed: true });
    await worlds.publish(world.id, world.version);
    // Synthetic fixture funds only: real authored worlds still start with their published initial resources.
    if (coins) await pg.query("UPDATE game_world_revisions SET definition = jsonb_set(definition, '{initial,coins}', $1::jsonb) WHERE world_id=$2", [JSON.stringify(coins), world.id]);
    let session = await worlds.createSave(world.id, 1, crypto.randomUUID());
    session = await sessions.updateStatus(session.id, { status: "active", expectedVersion: session.version, now: new Date() });
    session = await turns.create(session.id, createGameTurnSchema.parse({ content: "开启", parentTurnId: null, expectedVersion: session.version, requestId: crypto.randomUUID(), explorationAction: { action: "start", templateId: `world-${world.id}`, templateVersion: "1.0.1" } }));
    return { world, session, template: await worlds.resolveSessionTemplate(session.id, `world-${world.id}`, "1.0.1") };
  };
  const prepare = (session: Awaited<ReturnType<typeof setup>>["session"], poolId = "fixed", requestId = crypto.randomUUID()) => draws.prepare(session.id, { requestId, parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, poolId, keywords: "SYNTH_PRIVATE_KEYWORD", confirmed: true }, "controlled-seed");

  it("P11 fixes immutable pools to the published revision and requires an explicit configuration confirmation", async () => {
    const { world, session } = await setup(); const content = structuredClone(world.content!); content.drawPools![0].coinCost = 4;
    await expect(worlds.update(world.id, { expectedVersion: world.version, input, content, lockedSections: [] })).rejects.toThrow("明确确认");
    const changed = await worlds.update(world.id, { expectedVersion: world.version, input, content, lockedSections: [], drawPoolsConfirmed: true });
    const context = await draws.list(session.id, session.activeLeafTurnId!); expect(context.pools[0].pool.coinCost).toBe(0);
    expect(context.pools[0].probabilities).toEqual([{ entryId: "copper", probability: 1 }]);
    expect(changed.content?.drawPools?.[0].coinCost).toBe(4); expect(JSON.stringify(context)).not.toContain("SYNTH_HOST_SECRET");
  });

  it("P11 fixed pools use zero model calls, stack materials in one inventory and settle once even across concurrent repositories", async () => {
    let { session } = await setup(); const before = neverGenerate.mock.calls.length;
    const requestId = crypto.randomUUID(); const first = await prepare(session, "fixed", requestId);
    const replay = await prepare(session, "fixed", requestId); expect(replay).toEqual(first);
    await expect(draws.prepare(session.id, { requestId, parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, poolId: "keyword", keywords: "changed", confirmed: true })).rejects.toThrow("同一请求ID");
    await expect(prepare(session)).rejects.toThrow("已有待处理");
    const other = createGameDrawRepository(db); const [one, two] = await Promise.all([draws.settle(first.id, first.version), other.settle(first.id, first.version)]);
    expect(one.settledTurnId).toBe(two.settledTurnId); session = (await sessions.get(session.id))!;
    expect(session.turns).toHaveLength(2); expect(session.turns.at(-1)!.stateSnapshot.exploration!.instances[0]).toMatchObject({ owner: "player", quantity: 2, equippedSlot: null });
    const second = await prepare(session); await draws.settle(second.id, second.version); session = (await sessions.get(session.id))!;
    const state = session.turns.at(-1)!.stateSnapshot.exploration!; expect(state.instances).toHaveLength(1); expect(state.instances[0].quantity).toBe(4); expect(state.acquisitions?.receipts).toHaveLength(2);
    expect((await draws.list(session.id, session.activeLeafTurnId!)).history).toHaveLength(2);
    expect(neverGenerate.mock.calls.length).toBe(before);
  });

  it("P11 enforces no replacement, finite limits, locations, coins and unique definitions even when unspawned or consumed", async () => {
    const { session, template } = await setup([pool("fixed", [fixed()], { replacement: false })]);
    const record = await prepare(session); await draws.settle(record.id, record.version); const changed = (await sessions.get(session.id))!;
    await expect(prepare(changed)).rejects.toThrow("没有可抽取"); const state = structuredClone(session.turns.at(-1)!.stateSnapshot.exploration!);
    expect(eligibleDrawEntries(pool("cost", [fixed()], { coinCost: 1 }), state, template)).toEqual([]);
    expect(eligibleDrawEntries(pool("place", [fixed()], { locationId: "crossroads" }), state, template)).toEqual([]);
    expect(eligibleDrawEntries(pool("time", [fixed()], { minTick: 1 }), state, template)).toEqual([]);
    state.acquisitions = { items: [], receipts: [{ requestId: crypto.randomUUID(), poolId: "limited", entryId: "copper", definitionId: "copper", quantity: 2, sourceTurnId: session.activeLeafTurnId! }] };
    expect(eligibleDrawEntries(pool("limited", [fixed()], { maxDraws: 1 }), state, template)).toEqual([]);
    delete state.acquisitions;
    template.items[0].unique = true; template.items[0].stackable = false;
    template.instances.push({ id: "unspawned-unique", definitionId: "copper", owner: "crossroads", quantity: 1, equippedSlot: null, source: "setting" });
    expect(eligibleDrawEntries(pool("unique", [{ ...fixed(), minQuantity: 1, maxQuantity: 1 }]), state, template)).toEqual([]);
    template.instances = []; state.acquisitions = { items: [], receipts: [{ requestId: crypto.randomUUID(), poolId: "other", entryId: "other", definitionId: "copper", quantity: 1, sourceTurnId: session.activeLeafTurnId! }] };
    expect(eligibleDrawEntries(pool("unique", [{ ...fixed(), minQuantity: 1, maxQuantity: 1 }]), state, template)).toEqual([]);
    expect(drawPoolIssues([pool("bad", [{ ...generated, quality: "unknown" }])], template).join(" ")).toContain("quality");
    expect(drawPoolIssues([pool("bad", [{ ...generated, category: "equipment" }])], template).join(" ")).toContain("仅非唯一材料");
  });

  it("P12 rolls the receipt, inventory and nonzero cost back together if appending the result turn fails", async () => {
    const { session } = await setup([pool("fixed", [fixed()], { coinCost: 3 })], 9); const row = await prepare(session);
    await pg.exec("ALTER TABLE game_turns ADD CONSTRAINT synthetic_reject_draw CHECK (model <> 'host-item-draw/v1') NOT VALID");
    try { await expect(draws.settle(row.id, row.version)).rejects.toThrow(); }
    finally { await pg.exec("ALTER TABLE game_turns DROP CONSTRAINT synthetic_reject_draw"); }
    expect((await draws.get(row.id)).status).toBe("ready"); const unchanged = (await sessions.get(session.id))!;
    expect(unchanged.turns).toHaveLength(1); expect(unchanged.turns[0].stateSnapshot.exploration!.coins).toBe(9); expect(unchanged.turns[0].stateSnapshot.exploration!.instances).toEqual([]);
    await draws.settle(row.id, row.version); const settled = (await sessions.get(session.id))!;
    expect(settled.turns.at(-1)!.stateSnapshot.exploration!.coins).toBe(6); expect(settled.turns.at(-1)!.stateSnapshot.exploration!.instances[0].quantity).toBe(2);
  });

  it("generated equipment and consumables remain usable by the same host engine without auto-equipping", async () => {
    for (const category of ["equipment", "consumable"] as const) {
      let { session } = await setup([pool("keyword", [{ ...generated, category, minQuantity: 1, maxQuantity: 1 }])]);
      const row = await prepare(session, "keyword"); const item = row.data.item!;
      if (category === "consumable") item.useEffect = { locationId: "arrival", requiresCondition: null, addCondition: "合成精神振奋", removeCondition: null };
      const ready = await draws.edit(row.id, row.version, item); await draws.settle(row.id, ready.version); session = (await sessions.get(session.id))!;
      const acquired = session.turns.at(-1)!.stateSnapshot.exploration!; expect(acquired.instances[0].equippedSlot).toBeNull();
      const result = await turns.create(session.id, createGameTurnSchema.parse({ content: "验证物品", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(),
        explorationAction: { action: category === "equipment" ? "equip" : "use", instanceId: acquired.instances[0].id } }));
      const state = result.turns.at(-1)!.stateSnapshot.exploration!;
      if (category === "equipment") expect(state.instances[0].equippedSlot).toBe("hand"); else { expect(state.instances).toEqual([]); expect(state.conditions).toContain("合成精神振奋"); }
    }
  });

  it("P11 sends a bounded actual Provider request with locked sample, validates magic/quality and keeps keywords out of NPC perception", async () => {
    const { session, template } = await setup(); const row = await prepare(session, "keyword"); const requests: ModelStreamRequest[] = [];
    const design = { ...row.data.item!, name: "合成铆钉", description: "来自当地工坊的普通铆钉" };
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }), createProvider: () => ({ stream: async function* (request) { requests.push(request); yield { type: "delta", text: JSON.stringify(design) }; } }) });
    const result = await createDrawGenerationService(draws, generator).generate(row.id, { attemptId: crypto.randomUUID(), confirmed: true });
    expect(result.status).toBe("ready"); expect(result.data.sample.quantity).toBe(2); expect(requests).toHaveLength(1); expect(requests[0].promptVersion).toBe(DRAW_ITEM_PROMPT_VERSION);
    expect(JSON.stringify(requests)).toContain("SYNTH_PRIVATE_KEYWORD"); expect(JSON.stringify(requests)).not.toContain("SYNTH_HOST_SECRET");
    await expect(draws.edit(row.id, result.version, { ...design, quality: "legendary" })).rejects.toThrow("已抽定");
    await expect(draws.edit(row.id, result.version, { ...design, usesSupernatural: true })).rejects.toThrow("无超自然");
    await draws.settle(row.id, result.version); const saved = (await sessions.get(session.id))!; const state = saved.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.view.items.some((item) => item.name === "合成铆钉")).toBe(true); expect(state.acquisitions?.items[0].definition.details?.category).toBe("material");
    const actor = explorationMessages(state, "你好", "guide", [], [], perceptionScope(saved, saved.activeLeafTurnId), () => template);
    expect(JSON.stringify(actor)).not.toMatch(/SYNTH_PRIVATE_KEYWORD|合成铆钉|SYNTH_HOST_SECRET/);
    const moved = await turns.create(saved.id, createGameTurnSchema.parse({ content: "移动", parentTurnId: saved.activeLeafTurnId, expectedVersion: saved.version, requestId: crypto.randomUUID(), explorationAction: { action: "move", targetId: "crossroads" } }));
    expect(moved.turns.at(-1)!.stateSnapshot.exploration!.view.items[0].name).toBe("合成铆钉");
  });

  it("rejects the real-model wrapper/omitted-empty-keys failure, retaining its sample without inventory writes", async () => {
    const { session } = await setup(); const row = await prepare(session, "keyword");
    const { abilities, consumable, ...partial } = row.data.item!; void abilities; void consumable;
    const result = await createDrawGenerationService(draws, { generate: async (messages) => {
      expect(messages[0].content).toContain('不要输出"type":"json_object"');
      expect(messages[0].content).toContain("空数组abilities:[]、consumable:false");
      return { content: JSON.stringify({ ...partial, type: "json_object" }), model: "synthetic-recorded-failure" };
    } }).generate(row.id, { attemptId: crypto.randomUUID(), confirmed: true });
    expect(result.status).toBe("failed"); expect(result.data.sample).toEqual(row.data.sample); expect(result.data.item).toEqual(row.data.item);
    expect((await sessions.get(session.id))!.turns).toHaveLength(1);
  });

  it("P12 persists claims across service instances/restarts and explicit retry IDs never bill twice or resample", async () => {
    const { session } = await setup(); const row = await prepare(session, "keyword"); const attemptId = crypto.randomUUID();
    let release!: () => void; const pause = new Promise<void>((resolve) => { release = resolve; });
    const generate = vi.fn(async () => { await pause; return { content: JSON.stringify({ ...row.data.item!, name: "合成材料" }), model: "synthetic" }; });
    const one = createDrawGenerationService(draws, { generate }).generate(row.id, { attemptId, confirmed: true });
    await vi.waitFor(async () => expect((await draws.get(row.id)).status).toBe("generating"));
    const second = await createDrawGenerationService(createGameDrawRepository(db), { generate }).generate(row.id, { attemptId, confirmed: true });
    expect(second.status).toBe("generating"); expect(generate).toHaveBeenCalledOnce();
    await expect(draws.claimGeneration(row.id, crypto.randomUUID())).rejects.toThrow("不能发起");
    release(); const ready = await one; expect(ready.status).toBe("ready"); expect(ready.data.sample).toEqual(row.data.sample);
    await createDrawGenerationService(draws, { generate }).generate(row.id, { attemptId, confirmed: true }); expect(generate).toHaveBeenCalledOnce();
    // A process could disappear after persisting its claim: a fresh service must not take over automatically.
    const another = await setup(); const pending = await prepare(another.session, "keyword"); await draws.claimGeneration(pending.id, attemptId);
    expect((await createDrawGenerationService(createGameDrawRepository(db), { generate }).generate(pending.id, { attemptId, confirmed: true })).status).toBe("generating"); expect(generate).toHaveBeenCalledOnce();
    await draws.cancel(pending.id); expect((await draws.get(pending.id)).status).toBe("cancelled");
  });

  it("P12 invalid generation, manual repair, cancellation and late results never half-grant or deduct", async () => {
    const { session } = await setup(); const row = await prepare(session, "keyword"); const attemptId = crypto.randomUUID();
    const generate = vi.fn(async () => ({ content: JSON.stringify({ ...row.data.item!, quality: "higher" }), model: "synthetic" }));
    let failed = await createDrawGenerationService(draws, { generate }).generate(row.id, { attemptId, confirmed: true });
    expect(failed.status).toBe("failed"); expect(failed.data.sample).toEqual(row.data.sample); expect((await sessions.get(session.id))!.turns).toHaveLength(1);
    await createDrawGenerationService(draws, { generate }).generate(row.id, { attemptId, confirmed: true }); expect(generate).toHaveBeenCalledOnce();
    failed = await draws.edit(row.id, failed.version, { ...failed.data.item!, name: "手动修复材料" }); await draws.settle(row.id, failed.version);
    expect((await sessions.get(session.id))!.turns).toHaveLength(2);
    const fresh = await setup(); const cancelled = await prepare(fresh.session, "keyword"); const claim = await draws.claimGeneration(cancelled.id, crypto.randomUUID());
    await draws.cancel(cancelled.id); const late = await draws.finishGeneration(cancelled.id, claim.row.data.generationClaim!, cancelled.data.item, "synthetic");
    expect(late.status).toBe("cancelled"); expect((await sessions.get(fresh.session.id))!.turns).toHaveLength(1);
  });

  it("P12 only explicitly new paid attempts retry the same frozen sample, with a durable three-attempt limit", async () => {
    const { session } = await setup(); const row = await prepare(session, "keyword"); const generate = vi.fn(async () => ({ content: "invalid", model: "synthetic" }));
    const service = createDrawGenerationService(draws, { generate });
    for (let index = 0; index < 3; index++) { const attemptId = crypto.randomUUID(); const failed = await service.generate(row.id, { attemptId, confirmed: true });
      expect(failed.status).toBe("failed"); expect(failed.data.sample).toEqual(row.data.sample);
      await service.generate(row.id, { attemptId, confirmed: true }); expect(generate.mock.calls).toHaveLength(index + 1);
    }
    await expect(service.generate(row.id, { attemptId: crypto.randomUUID(), confirmed: true })).rejects.toThrow("最多三次");
    expect(generate).toHaveBeenCalledTimes(3); expect((await sessions.get(session.id))!.turns).toHaveLength(1);
  });

  it("P12 branch switch/checkpoint restore fences pending awards; restore removes branch-local definitions, costs and receipts", async () => {
    let { session } = await setup(); const root = session.activeLeafTurnId!;
    session = await sessions.createCheckpoint(session.id, { name: "抽前", note: "合成", expectedVersion: session.version, now: new Date() });
    const row = await prepare(session, "keyword"); const ready = await draws.edit(row.id, row.version, row.data.item); await draws.settle(row.id, ready.version);
    session = (await sessions.get(session.id))!; expect(session.turns.at(-1)!.stateSnapshot.exploration?.acquisitions?.items).toHaveLength(1);
    const pending = await prepare(session); const restored = await sessions.restoreCheckpoint(session.id, session.checkpoints[0].id, { expectedVersion: session.version, now: new Date() });
    expect(restored.activeLeafTurnId).toBe(root); await expect(draws.settle(pending.id, pending.version)).rejects.toThrow("存档已变化");
    expect((await draws.list(restored.id, root)).history).toEqual([]);
    const parent = restored.turns.find((turn) => turn.id === root)!; expect(parent.stateSnapshot.exploration?.acquisitions).toBeUndefined(); expect(parent.stateSnapshot.exploration?.instances).toEqual([]);
    expect((await draws.list(restored.id, root)).draws.every((entry) => entry.parentTurnId === root)).toBe(true);
    const branch = await prepare(restored); await draws.settle(branch.id, branch.version); const forked = (await sessions.get(session.id))!;
    expect(forked.turns.at(-1)!.parentTurnId).toBe(root); expect(forked.turns.at(-1)!.stateSnapshot.exploration?.instances[0].quantity).toBe(2);
    expect(forked.turns.at(-1)!.stateSnapshot.exploration?.acquisitions?.items).toEqual([]);
  });

  it("rejects owner/session confusion and unconfirmed API mutations; refuses lossy downgrade once draw configuration exists", async () => {
    const { session } = await setup(); const api = createGameDrawApi(draws);
    const call = (parts: string[], body: unknown) => api(new Request("http://local/api/v1/game-draws", { method: "POST", body: JSON.stringify(body) }), parts);
    const row = await prepare(session); expect((await call([row.id, "settle"], { expectedVersion: row.version })).status).toBe(400);
    expect((await api(new Request(`http://local/api/v1/game-draws?sessionId=${crypto.randomUUID()}&parentTurnId=${session.activeLeafTurnId}`))).status).toBe(404);
    const other = await setup(); await expect(draws.prepare(other.session.id, { requestId: crypto.randomUUID(), parentTurnId: session.activeLeafTurnId, expectedVersion: other.session.version, poolId: "fixed", keywords: "", confirmed: true })).rejects.toThrow("所选分支");
    await expect(rollbackDatabase(migrationDb, await loadMigrations())).resolves.toBe("0037_game_event_designs.sql");
    await expect(rollbackDatabase(migrationDb, await loadMigrations())).rejects.toThrow("draw data exists");
    expect((await draws.get(row.id)).data.sample.quantity).toBe(2);
  });
});
