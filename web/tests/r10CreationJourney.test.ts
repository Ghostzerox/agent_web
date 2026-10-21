import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { createGameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createGameAssetDesignRepository } from "@/lib/repositories/gameAssetDesignRepository";
import { createGameEventDesignRepository } from "@/lib/repositories/gameEventDesignRepository";
import { createGameDrawRepository } from "@/lib/repositories/gameDrawRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { seededWorldBlueprint as blankWorldBlueprint } from "./helpers/worldBlueprint";
import { blankAssetDesign } from "@/lib/game/worlds/assetBlueprint";
import { createAssetGenerationService } from "@/lib/game/worlds/assetGeneration";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { createGameTurnSchema } from "@/lib/game/contracts";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import { actorContext, perceptionScope } from "@/lib/game/exploration/perception";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";

it("R10 creation → pinned save → draw → event → sourced actor → cold restart → branch restore stays coherent", async () => {
  let pg = new PGlite();
  const open = () => {
    const db = drizzle(pg, { schema });
    return { worlds: createGameWorldRepository(db), assets: createGameAssetDesignRepository(db),
      events: createGameEventDesignRepository(db), draws: createGameDrawRepository(db), sessions: createGameSessionRepository(db) };
  };
  const requests: ModelStreamRequest[] = [];
  const narrator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }),
    createProvider: () => ({ stream: async function* (request) {
      requests.push(structuredClone(request));
      yield { type: "delta", text: request.promptVersion === "r10/item-character-design-v1"
        ? '{"description":"港城工坊留下的铜片，可用于修补；没有魔法效果。"}'
        : '{"narrative":"我只听到一则未经证实的港口传闻，先核对记录吧。","statePatch":{}}' };
    } }) });
  try {
    const migrations = await loadMigrations(); await migrateDatabase(createPgliteMigrationDatabase(pg), migrations);
    let repos = open();
    const input = { brief: "无魔法港城的普通修补材料与港口委托", constraints: ["人物不全知"], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
    let world = await repos.worlds.create(input); const content = blankWorldBlueprint(input); content.authorNotes = ["SYNTH_HOST_ONLY"];
    const stranger = blankAssetDesign("character", "stranger", input, content);
    if (stranger.kind !== "character") throw new Error("fixture");
    stranger.locationId = "crossroads"; stranger.profile.secrets = [{ text: "SYNTH_OTHER_SECRET", kind: "fact", knownBy: [] }]; content.characters.push(stranger);
    world = await repos.worlds.update(world.id, { expectedVersion: world.version, input, content, lockedSections: [] });
    let asset = await repos.assets.create({ worldId: world.id, expectedWorldVersion: world.version, kind: "item", brief: "可堆叠的普通铜片" });
    if (asset.content.kind !== "item") throw new Error("fixture");
    asset = await repos.assets.update(asset.id, { expectedVersion: asset.version, brief: asset.brief, lockedFields: ["name"],
      content: { ...asset.content, name: "港城铜片", stackable: true, details: { ...asset.content.details, category: "material" } } });
    const generate = createAssetGenerationService(repos.assets, narrator); const generation = { expectedVersion: asset.version, requestId: crypto.randomUUID(), fields: ["description"] };
    asset = await generate.generate(asset.id, generation); await generate.generate(asset.id, generation); expect(requests).toHaveLength(1);
    expect((await repos.worlds.get(world.id)).content!.items.definitions).toHaveLength(0);
    const itemId = asset.content.id; await repos.assets.confirm(asset.id, asset.version, world.version); world = await repos.worlds.get(world.id);
    let person = await repos.assets.create({ worldId: world.id, expectedWorldVersion: world.version, kind: "character", targetId: "guide", brief: "谨慎的记录员" });
    if (person.content.kind !== "character") throw new Error("fixture");
    person = await repos.assets.update(person.id, { expectedVersion: person.version, brief: person.brief, lockedFields: [], content: { ...person.content, category: "important",
      profile: { ...person.content.profile, privateBackground: "SYNTH_SELF_PAST", values: ["核实后再记档"], needs: ["修补档案箱"], authorNotes: ["SYNTH_CHARACTER_HOST_ONLY"] } } });
    await repos.assets.confirm(person.id, person.version, world.version); world = await repos.worlds.get(world.id);
    let plan = await repos.events.create({ kind: "world", worldId: world.id, expectedVersion: world.version, brief: "有铜片后可参与或免费拒绝的修补委托" });
    const event = structuredClone(plan.content); event.name = "修补档案箱"; event.actorIds = ["guide"]; event.trigger = { item: itemId };
    event.details.cause = "SYNTH_PRIVATE_CAUSE";
    event.details.onTriggerKnowledge = [{ text: "SYNTH_PORT_RUMOR", evidence: "rumor", recipients: ["guide"], reason: "收到港口署名不明的纸条" }];
    event.stages[0].choices[0].effect = { coins: 3, rewards: [{ definitionId: itemId, quantity: 2 }] };
    plan = await repos.events.update(plan.id, { expectedVersion: plan.version, brief: plan.brief, content: event, lockedFields: [] });
    await repos.events.confirm(plan.id, plan.version, world.version); world = await repos.worlds.get(world.id);
    world = await repos.worlds.update(world.id, { expectedVersion: world.version, input, lockedSections: [], content: { ...world.content!, drawPools: [
      { id: "supplies", name: "修补材料", explanation: "合成验收免费材料", locationId: null, minTick: 0, coinCost: 0, maxDraws: 3, replacement: true,
        entries: [{ id: "copper", source: "fixed", definitionId: itemId, weight: 1, minQuantity: 1, maxQuantity: 1 }] },
    ] }, drawPoolsConfirmed: true, eventDesignsConfirmed: true });
    await repos.worlds.publish(world.id, world.version);
    let session = await repos.worlds.createSave(world.id, 1, crypto.randomUUID()); session = await repos.sessions.updateStatus(session.id, { status: "active", expectedVersion: session.version, now: new Date() });
    const step = async (body: object) => createGameTurnService(repos.sessions, narrator, undefined, undefined, repos.worlds.resolveSessionTemplate).create(session.id,
      createGameTurnSchema.parse({ content: "合成验收动作", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), ...body }));
    session = await step({ explorationAction: { action: "start", templateId: `world-${world.id}`, templateVersion: "1.0.1" } });
    session = await step({ semanticInput: [{ kind: "private_thought", text: "SYNTH_PRIVATE_THOUGHT" }, { kind: "ooc_instruction", text: "SYNTH_OOC" }] });
    session = await repos.sessions.createCheckpoint(session.id, { name: "获取前", note: "", expectedVersion: session.version, now: new Date() });
    const root = session.activeLeafTurnId!; const checkpoint = session.checkpoints[0].id;
    const speak = () => step({ semanticInput: [{ kind: "dialogue", targetId: "guide", channel: "direct", text: "港口有什么传闻？" }] });
    session = await speak(); expect(JSON.stringify(requests.at(-1))).not.toContain("SYNTH_PORT_RUMOR");
    const drawInput = { requestId: crypto.randomUUID(), parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, poolId: "supplies", keywords: "", confirmed: true };
    const draw = await repos.draws.prepare(session.id, drawInput, "r10-integration");
    expect((await repos.draws.prepare(session.id, drawInput, "different-seed")).id).toBe(draw.id);
    await repos.draws.settle(draw.id, draw.version); await repos.draws.settle(draw.id, draw.version); expect(requests).toHaveLength(2);
    session = (await repos.sessions.get(session.id))!; let state = session.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.events[event.id]).toEqual({ stage: "available", settled: false }); expect(state.instances[0].quantity).toBe(1);
    session = await speak(); const actor = JSON.stringify(requests.at(-1)); expect(actor).toContain("SYNTH_PORT_RUMOR"); expect(actor).toContain("rumor"); expect(actor).toContain("SYNTH_SELF_PAST");
    expect(actor).not.toMatch(/SYNTH_HOST_ONLY|SYNTH_CHARACTER_HOST_ONLY|SYNTH_OTHER_SECRET|SYNTH_PRIVATE_THOUGHT|SYNTH_OOC|SYNTH_PRIVATE_CAUSE/);
    session = await step({ explorationAction: { action: "choose", eventId: event.id, choiceId: "accept" } }); state = session.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.instances).toHaveLength(1); expect(state.instances[0]).toMatchObject({ quantity: 3, equippedSlot: null }); expect(state.coins).toBe(3);
    const template = await repos.worlds.resolveSessionTemplate(session.id, state.templateId, state.templateVersion, session.activeLeafTurnId);
    expect(() => actorContext(state, "stranger", perceptionScope(session, session.activeLeafTurnId), () => template)).toThrow("不在场");
    const snapshot = await pg.dumpDataDir(); await pg.close(); pg = new PGlite({ loadDataDir: snapshot }); repos = open();
    expect(await migrateDatabase(createPgliteMigrationDatabase(pg), migrations)).toEqual([]); expect(await repos.sessions.get(session.id)).toEqual(session);
    await repos.draws.settle(draw.id, draw.version); expect(await repos.sessions.get(session.id)).toEqual(session);
    world = await repos.worlds.get(world.id); world = await repos.worlds.update(world.id, { expectedVersion: world.version, input,
      content: { ...world.content!, overview: { ...world.content!.overview, name: "第二版世界" } }, lockedSections: [], drawPoolsConfirmed: true, eventDesignsConfirmed: true });
    await repos.worlds.publish(world.id, world.version);
    expect((await repos.worlds.resolveSessionTemplate(session.id, state.templateId, "1.0.1", session.activeLeafTurnId)).world).not.toBe("第二版世界");
    session = await repos.sessions.restoreCheckpoint(session.id, checkpoint, { expectedVersion: session.version, now: new Date() }); expect(session.activeLeafTurnId).toBe(root);
    session = await speak(); expect(JSON.stringify(requests.at(-1))).not.toContain("SYNTH_PORT_RUMOR");
    state = session.turns.at(-1)!.stateSnapshot.exploration!; expect(state.instances).toEqual([]); expect(state.coins).toBe(0); expect(state.events[event.id]).toBeUndefined();
  } finally { await pg.close(); }
}, 60000);
