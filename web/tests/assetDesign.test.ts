import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase } from "@/lib/db/migrations";
import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { createGameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createGameAssetDesignRepository } from "@/lib/repositories/gameAssetDesignRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import { createGameAssetDesignApi } from "@/lib/api/gameAssetDesignApi";
import { createAssetGenerationService, ASSET_DESIGN_PROMPT_VERSION } from "@/lib/game/worlds/assetGeneration";
import { blankWorldBlueprint } from "@/lib/game/worlds/blueprint";
import { blankAssetDesign } from "@/lib/game/worlds/assetBlueprint";
import { blankCharacterProfile, type ItemDesign, type CharacterDesign } from "@/lib/game/worlds/assetContracts";
import { compileWorld, worldDraftIssues } from "@/lib/game/worlds/compile";
import { assetDesignIssues } from "@/lib/game/worlds/assetValidation";
import { startWorld, applyExplorationAction } from "@/lib/game/exploration/engine";
import { createGameTurnSchema } from "@/lib/game/contracts";
import type { WorldBrief } from "@/lib/game/worlds/contracts";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";

const brief: WorldBrief = { brief: "无魔法的蒸汽港城，铜哨和药草来自当地工艺。", magic: "forbidden", numericPolicy: "qualitative", constraints: ["不强制战斗数值"] };
describe("R10.4 real SQL authoring and shared exploration engine", () => {
  const pg = new PGlite(); const db = drizzle(pg, { schema }); const worlds = createGameWorldRepository(db);
  const designs = createGameAssetDesignRepository(db); const sessions = createGameSessionRepository(db);
  beforeAll(async () => { await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); });
  afterAll(async () => { await pg.close(); });
  const world = async (input = brief) => { const row = await worlds.create(input); return worlds.update(row.id, { expectedVersion: row.version, input, content: blankWorldBlueprint(input), lockedSections: [] }); };
  const design = async (current: Awaited<ReturnType<typeof world>>, kind: "item" | "character", targetId?: string) => designs.create({ worldId: current.id, expectedWorldVersion: current.version, kind, targetId, brief: "合成半成品设计" });
  const save = async (row: Awaited<ReturnType<typeof designs.get>>, content = row.content, lockedFields: string[] = []) => designs.update(row.id, { expectedVersion: row.version, brief: row.brief, content, lockedFields });

  it("P09 produces genuinely different qualitative/light/specified item contracts and refuses undeclared attributes", () => {
    for (const numericPolicy of ["qualitative", "light", "specified"] as const) {
      const input = { ...brief, numericPolicy }; const content = blankWorldBlueprint(input);
      const item = blankAssetDesign("item", "copper-whistle", input, content) as ItemDesign;
      expect(item.level).toBe(numericPolicy === "light" ? 1 : undefined);
      if (numericPolicy === "specified") item.details.attributes = { durability: 4 };
      expect(assetDesignIssues(input, content, item)).toEqual([]);
      const bad = { ...item, details: { ...item.details, attributes: { health: 100, durability: 6 } } };
      expect(assetDesignIssues(input, content, bad).join(" ")).toContain("属性health");
      expect(assetDesignIssues(input, content, bad).join(" ")).toContain("属性durability");
      content.items.definitions = [item]; content.items.placements = [{ id: "whistle-one", definitionId: item.id, owner: "player", quantity: 1 }];
      const template = compileWorld(crypto.randomUUID(), 1, input, content); const state = startWorld(template.id, template.version, () => template);
      expect(state.view.items[0].details?.attributes).toEqual(item.details.attributes);
      expect(state.progress.level).toBe(numericPolicy === "light" ? 1 : undefined);
      expect(() => compileWorld(crypto.randomUUID(), 1, input, { ...content, items: { ...content.items, definitions: [bad] } })).toThrow("属性");
    }
  });

  it("P10 keeps locked fields, reports magic conflicts, applies definitions once and never grants inventory before explicit placement/publication", async () => {
    const current = await world(); await worlds.publish(current.id, current.version);
    const oldSave = await worlds.createSave(current.id, 1, crypto.randomUUID());
    let row = await design(current, "item"); const item = row.content as ItemDesign;
    row = await save(row, { ...item, name: "旧铜哨", unique: true }, ["name"]);
    expect((await worlds.get(current.id)).content?.items.definitions).toEqual([]);
    const generate = vi.fn(async () => ({ content: '{"description":"合成补充：能向附近同伴示意，不能读心。"}', model: "synthetic" }));
    const service = createAssetGenerationService(designs, { generate });
    row = await service.generate(row.id, { expectedVersion: row.version, requestId: crypto.randomUUID(), fields: ["description", "name"] });
    expect(row.content.name).toBe("旧铜哨"); expect(row.origins.description).toBe("ai");
    const untouched = await save(row); expect(untouched.origins.description).toBe("ai"); row = untouched;
    const magic = await save(row, { ...row.content, usesSupernatural: true } as ItemDesign);
    await expect(designs.confirm(row.id, magic.version, current.version)).rejects.toMatchObject({ code: "WORLD_INVALID" });
    row = await save(magic, { ...magic.content, usesSupernatural: false } as ItemDesign);
    const [confirmed, repeated] = await Promise.all([designs.confirm(row.id, row.version, current.version), designs.confirm(row.id, row.version, current.version)]);
    expect(confirmed).toEqual(repeated); expect(confirmed.appliedWorldVersion).toBe(current.version + 1);
    let changed = await worlds.get(current.id); expect(changed.content?.items.definitions).toHaveLength(1); expect(changed.content?.items.placements).toEqual([]);
    await expect(save(await designs.get(row.id))).rejects.toMatchObject({ code: "WORLD_INVALID" });
    await worlds.publish(changed.id, changed.version);
    const definitionOnly = await worlds.createSave(changed.id, 2, crypto.randomUUID());
    const only = await worlds.resolveSessionTemplate(definitionOnly.id, `world-${current.id}`, "1.0.2");
    expect(startWorld(only.id, only.version, () => only).instances).toEqual([]);
    const content = structuredClone(changed.content!); content.items.placements = [{ id: "copper-in-world", definitionId: item.id, owner: "arrival", quantity: 2 }];
    expect(worldDraftIssues(brief, content).join(" ")).toContain("数量或唯一性");
    content.items.placements[0].quantity = 1;
    changed = await worlds.update(changed.id, { expectedVersion: changed.version, input: brief, content, lockedSections: [] });
    await worlds.publish(changed.id, changed.version); const newSave = await worlds.createSave(changed.id, 3, crypto.randomUUID());
    const template = await worlds.resolveSessionTemplate(newSave.id, `world-${current.id}`, "1.0.3"); const resolve = () => template;
    let state = startWorld(template.id, template.version, resolve); expect(state.instances[0].owner).toBe("arrival");
    state = applyExplorationAction(state, { action: "take", instanceId: "copper-in-world", quantity: 1 }, "take", resolve);
    state = applyExplorationAction(state, { action: "move", targetId: "crossroads" }, "away", resolve);
    state = applyExplorationAction(state, { action: "move", targetId: "arrival" }, "back", resolve);
    expect(state.instances).toHaveLength(1); expect(state.instances[0]).toMatchObject({ owner: "player", quantity: 1, equippedSlot: null });
    const old = await worlds.resolveSessionTemplate(oldSave.id, `world-${current.id}`, "1.0.1"); expect(old.items).toEqual([]);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("keeps public character cards, own personas, shared rumors and host-only notes separate in actual Provider requests", async () => {
    let current = await world(); let row = await design(current, "character", "guide"); const person = row.content as CharacterDesign;
    row = await save(row, { ...person, category: "important", name: "铜湾记录员", profile: { ...person.profile, values: ["核对记录"], needs: ["修复钟表"],
      privateBackground: "SYNTH_OWN_PAST", longTermGoal: "SYNTH_OWN_GOAL", secrets: [{ text: "SYNTH_OWN_RUMOR", kind: "rumor", knownBy: [] }], authorNotes: ["SYNTH_HOST_ONLY"] } });
    await designs.confirm(row.id, row.version, current.version); current = await worlds.get(current.id);
    const other = blankAssetDesign("character", "neighbor", brief, current.content!) as CharacterDesign;
    other.profile.privateBackground = "SYNTH_OTHER_PAST"; other.profile.secrets = [{ text: "SYNTH_OTHER_SECRET", kind: "fact", knownBy: [] }];
    const content = { ...current.content!, characters: [...current.content!.characters, other] };
    current = await worlds.update(current.id, { expectedVersion: current.version, input: brief, content, lockedSections: [] });
    await worlds.publish(current.id, current.version); let session = await worlds.createSave(current.id, 1, crypto.randomUUID());
    session = await sessions.updateStatus(session.id, { status: "active", expectedVersion: session.version, now: new Date() });
    const requests: ModelStreamRequest[] = [];
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }),
      createProvider: () => ({ stream: async function* (request) { requests.push(structuredClone(request)); yield { type: "delta", text: '{"narrative":"合成回应","statePatch":{}}' }; } }) });
    const service = createGameTurnService(sessions, generator, undefined, undefined, worlds.resolveSessionTemplate);
    const run = async (extra: object) => { session = await service.create(session.id, createGameTurnSchema.parse({ content: "合成输入", parentTurnId: session.activeLeafTurnId,
      expectedVersion: session.version, requestId: crypto.randomUUID(), ...extra })); };
    await run({ explorationAction: { action: "start", templateId: `world-${current.id}`, templateVersion: "1.0.1" } });
    expect(JSON.stringify(session)).not.toMatch(/SYNTH_OWN_PAST|SYNTH_OWN_GOAL|SYNTH_OWN_RUMOR|SYNTH_HOST_ONLY|SYNTH_OTHER_SECRET/);
    for (const targetId of ["guide", "neighbor"]) await run({ semanticInput: [{ kind: "dialogue", text: "你好", targetId, channel: "direct" }] });
    const own = JSON.stringify(requests[0]); expect(own).toContain("SYNTH_OWN_PAST"); expect(own).toContain("SYNTH_OWN_GOAL"); expect(own).toContain("SYNTH_OWN_RUMOR"); expect(own).toContain('rumor');
    expect(own).not.toMatch(/SYNTH_HOST_ONLY|SYNTH_OTHER_PAST|SYNTH_OTHER_SECRET/);
    const neighbor = JSON.stringify(requests[1]); expect(neighbor).toContain("SYNTH_OTHER_PAST"); expect(neighbor).not.toMatch(/SYNTH_OWN_PAST|SYNTH_OWN_RUMOR|SYNTH_HOST_ONLY/);
    const saved = await sessions.get(session.id); expect(saved?.turns).toHaveLength(3);
    expect(saved?.turns.at(-1)?.stateSnapshot.exploration?.characters.guide.category).toBe("important");
  });

  it("uses the existing host equipment/consumable/material paths with checked placement, ownership and use preconditions", () => {
    const content = blankWorldBlueprint(brief); const item = blankAssetDesign("item", "herbs", brief, content) as ItemDesign;
    content.characters[0].goal = "G".repeat(600); content.characters[0].name = "N".repeat(120);
    content.region.locations[1].description = "D".repeat(600);
    item.details.category = "consumable"; item.consumable = true; item.stackable = true; item.abilities = ["增加清醒状态"];
    item.useEffect = { locationId: "crossroads", requiresCondition: null, addCondition: "清醒", removeCondition: null };
    const equipment = { ...blankAssetDesign("item", "whistle", brief, content) as ItemDesign, slot: "hand", details: { ...item.details, category: "equipment" as const } };
    content.items.definitions = [item, equipment]; content.items.placements = [{ id: "herbs-one", definitionId: "herbs", owner: "player", quantity: 3 }, { id: "whistle-one", definitionId: "whistle", owner: "player", quantity: 1 }];
    const world = compileWorld(crypto.randomUUID(), 1, brief, content); const resolve = () => world; let state = startWorld(world.id, world.version, resolve);
    state = applyExplorationAction(state, { action: "talk", targetId: "guide" }, "talk", resolve);
    expect(state.characters.guide.goals[0]).toHaveLength(600); expect(state.lastResult.length).toBeLessThanOrEqual(600);
    expect(() => applyExplorationAction(state, { action: "use", instanceId: "herbs-one" }, "bad", resolve)).toThrow("地点");
    expect(state.instances[0].quantity).toBe(3); expect(state.conditions).toEqual([]);
    state = applyExplorationAction(state, { action: "equip", instanceId: "whistle-one" }, "equip", resolve); expect(state.instances.find((entry) => entry.id === "whistle-one")?.equippedSlot).toBe("hand");
    state = applyExplorationAction(state, { action: "move", targetId: "crossroads" }, "move", resolve);
    expect(state.view.locations.find((place) => place.id === "crossroads")?.description).toHaveLength(600);
    state = applyExplorationAction(state, { action: "use", instanceId: "herbs-one" }, "use", resolve); expect(state.conditions).toContain("清醒"); expect(state.instances[0].quantity).toBe(2);
    const invalid = structuredClone(content); invalid.items.definitions[0].unique = true;
    expect(worldDraftIssues(brief, invalid).join(" ")).toContain("唯一物品不能");
  });

  it("fences simultaneous confirmations against the same world and explicitly rebinds stale designs without silently fixing them", async () => {
    let current = await world(); const first = await design(current, "item"); const second = await design(current, "item");
    const results = await Promise.allSettled([designs.confirm(first.id, first.version, current.version), designs.confirm(second.id, second.version, current.version)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results[0].status === "rejected" ? first : second;
    expect((await designs.get(loser.id)).appliedWorldVersion).toBeNull(); current = await worlds.get(current.id);
    const generate = vi.fn(async () => ({ content: '{"name":"不应付费"}', model: "synthetic" }));
    await expect(createAssetGenerationService(designs, { generate }).generate(loser.id, { expectedVersion: loser.version, requestId: crypto.randomUUID(), fields: ["name"] })).rejects.toMatchObject({ code: "WORLD_VERSION_CONFLICT" });
    expect(generate).not.toHaveBeenCalled(); const rebound = await designs.rebase(loser.id, loser.version, current.version);
    expect(rebound.content).toEqual(loser.content); expect(rebound.sourceWorldVersion).toBe(current.version);
    await designs.confirm(rebound.id, rebound.version, current.version);
    expect((await worlds.get(current.id)).content?.items.definitions).toHaveLength(2);
    await expect(save(rebound)).rejects.toThrow();
  });

  it("captures design purpose, suppresses duplicate paid requests and preserves old drafts after invalid / canceled output", async () => {
    const current = await world(); const row = await design(current, "item"); const requests: ModelStreamRequest[] = [];
    let output = '{"name":"合成旧铜哨"}'; const cancel = new AbortController(); let cancelOnReply = false;
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }),
      createProvider: () => ({ stream: async function* (request) { requests.push(request); yield { type: "delta", text: output }; if (cancelOnReply) cancel.abort(); } }) });
    const service = createAssetGenerationService(designs, generator); const input = { expectedVersion: row.version, requestId: crypto.randomUUID(), fields: ["name"] };
    const [first, duplicate] = await Promise.all([service.generate(row.id, input), service.generate(row.id, input)]);
    expect(first).toEqual(duplicate); expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ business: "game", promptVersion: ASSET_DESIGN_PROMPT_VERSION });
    expect((await createAssetGenerationService(designs, generator).generate(row.id, input)).version).toBe(first.version); expect(requests).toHaveLength(1);
    output = '{"name":"伪造","id":"illegal"}';
    await expect(service.generate(row.id, { ...input, expectedVersion: first.version, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "WORLD_GENERATION_FAILED" });
    expect(await designs.get(row.id)).toEqual(first);
    output = '{"name":"取消后不保存"}'; cancelOnReply = true;
    await expect(service.generate(row.id, { ...input, expectedVersion: first.version, requestId: crypto.randomUUID() }, cancel.signal)).rejects.toMatchObject({ code: "WORLD_GENERATION_FAILED" });
    expect(await designs.get(row.id)).toEqual(first); expect((await worlds.get(current.id)).content?.items.definitions).toEqual([]);
  });

  it("rejects forged confirmations and ownership, preserves applied data and blocks a lossy migration downgrade", async () => {
    const current = await world(); const row = await design(current, "character", "player"); const api = createGameAssetDesignApi(designs);
    const invalid = await api(new Request("http://local/api", { method: "POST", body: JSON.stringify({ expectedVersion: row.version, expectedWorldVersion: current.version }) }), [row.id, "confirm"]);
    expect(invalid.status).toBe(400); expect((await designs.get(row.id)).appliedWorldVersion).toBeNull();
    await designs.confirm(row.id, row.version, current.version); const changed = await worlds.get(current.id); const template = compileWorld(current.id, 1, brief, changed.content!);
    expect(startWorld(template.id, template.version, () => template).characters.player.controller).toBe("user");
    const foreign = crypto.randomUUID(); await pg.query("INSERT INTO users(id) VALUES ($1)", [foreign]);
    const foreignWorld = crypto.randomUUID(); await pg.query("INSERT INTO game_world_drafts(id,user_id,input,content) VALUES ($1,$2,$3,$4)", [foreignWorld, foreign, JSON.stringify(brief), JSON.stringify(blankWorldBlueprint(brief))]);
    await expect(designs.list(foreignWorld)).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
    await expect(designs.get(crypto.randomUUID())).rejects.toMatchObject({ code: "WORLD_NOT_FOUND" });
    const migrations = await loadMigrations();
    await expect(rollbackDatabase(createPgliteMigrationDatabase(pg), migrations)).resolves.toBe("0037_game_event_designs.sql");
    await expect(rollbackDatabase(createPgliteMigrationDatabase(pg), migrations)).resolves.toBe("0036_game_item_draws.sql");
    await expect(rollbackDatabase(createPgliteMigrationDatabase(pg), migrations)).rejects.toThrow("R10.4 authoring data exists");
    await migrateDatabase(createPgliteMigrationDatabase(pg), migrations);
    expect((await designs.get(row.id)).appliedWorldVersion).toBe(changed.version);
  });
});

it("upgrades only editable legacy drafts once and safely reverses an unused migration without rewriting published definitions", async () => {
  const pg = new PGlite(); const migrations = (await loadMigrations()).slice(0, 36); const adapter = createPgliteMigrationDatabase(pg);
  try {
    await migrateDatabase(adapter, migrations.slice(0, 35)); const id = crypto.randomUUID(); const owner = crypto.randomUUID();
    const modern = blankWorldBlueprint(brief); const { itemRules, items, ...old } = modern; void itemRules; void items;
    const content = { ...old, characters: old.characters.map(({ kind, category, profile, ...person }) => { void kind; void category; void profile; return person; }) };
    await pg.query("INSERT INTO users(id) VALUES ($1)", [owner]);
    await pg.query("INSERT INTO game_world_drafts(id,user_id,input,content) VALUES ($1,$2,$3,$4)", [id, owner, JSON.stringify(brief), JSON.stringify(content)]);
    await pg.query("INSERT INTO game_world_revisions(world_id,user_id,revision,draft_version,definition) VALUES ($1,$2,1,1,$3)", [id, owner, JSON.stringify({ synthetic: "SYNTH_UNCHANGED_REVISION" })]);
    await migrateDatabase(adapter, migrations);
    const upgraded = (await pg.query<{ content: typeof modern; version: number }>("SELECT content,version FROM game_world_drafts WHERE id=$1", [id])).rows[0];
    expect(upgraded.content.characters[0].profile).toEqual(blankCharacterProfile()); expect(upgraded.version).toBe(1); expect(upgraded.content.items.definitions).toEqual([]);
    expect((await pg.query<{ definition: unknown }>("SELECT definition FROM game_world_revisions WHERE world_id=$1", [id])).rows[0].definition).toEqual({ synthetic: "SYNTH_UNCHANGED_REVISION" });
    await expect(rollbackDatabase(adapter, migrations)).resolves.toBe(migrations[35].id);
    expect((await pg.query<{ content: unknown }>("SELECT content FROM game_world_drafts WHERE id=$1", [id])).rows[0].content).toEqual(content);
  } finally { await pg.close(); }
});
