// One bounded synthetic journey. Reuses production prompt assembly and validators;
// never reads user conversations or writes to the running application's database.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../lib/db/schema";
import { loadMigrations, migrateDatabase } from "../../lib/db/migrations";
import { createPgliteMigrationDatabase } from "../../tests/helpers/pglite";
import { createGameWorldRepository } from "../../lib/repositories/gameWorldRepository";
import { createGameAssetDesignRepository } from "../../lib/repositories/gameAssetDesignRepository";
import { createGameEventDesignRepository } from "../../lib/repositories/gameEventDesignRepository";
import { createGameSessionRepository } from "../../lib/repositories/gameSessionRepository";
import { createGameDrawRepository } from "../../lib/repositories/gameDrawRepository";
import { blankWorldBlueprint } from "../../lib/game/worlds/blueprint";
import { worldDraftIssues } from "../../lib/game/worlds/compile";
import { WORLD_SECTIONS, type WorldBrief } from "../../lib/game/worlds/contracts";
import { createWorldGenerationService } from "../../lib/game/worlds/generation";
import { createAssetGenerationService } from "../../lib/game/worlds/assetGeneration";
import { createEventGenerationService } from "../../lib/game/events/generation";
import { createDrawGenerationService } from "../../lib/game/draws/generation";
import { createGameNarrativeGenerator } from "../../lib/game/gameNarrativeGenerator";
import { createGameTurnService } from "../../lib/game/gameTurnService";
import { createGameTurnSchema } from "../../lib/game/contracts";
import type { ModelStreamRequest } from "../../lib/ai/server/modelProvider";

export function syntheticQualityReply(request: ModelStreamRequest): string {
  if (request.promptVersion === "r10/exploration-v3") return JSON.stringify({ narrative: "我还没核对港口告示，不如一起看看？", statePatch: {} });
  const payload = JSON.parse(request.messages.findLast((message) => message.role === "user")!.content as string);
  switch (request.promptVersion) {
    case "r10/world-authoring-v3": {
      const current = payload.current ?? blankWorldBlueprint(payload.input);
      return JSON.stringify(Object.fromEntries(payload.requestedSections.map((key: string) => [key, key === "overview"
        ? { ...current.overview, name: "铜湾港", era: "蒸汽时代", technology: "铜铆与蒸汽工艺" } : current[key]])));
    }
    case "r10/item-character-design-v1": return JSON.stringify(Object.fromEntries(payload.requestedFields.map((field: string) => [field, field === "details"
      ? { ...payload.current.details, source: "港口工坊", background: "修船边料再制", usage: "手工修补档案箱", restrictions: "不能修复大型船体" }
      : { ...payload.current.profile, values: ["先核实再归档"], needs: ["修补档案箱"], longTermGoal: "修复港口文书记录" }])));
    case "r10/event-design-v2": return JSON.stringify({ stages: payload.current.stages });
    case "r10/draw-item-design-v2": return JSON.stringify({ ...payload.current, name: "铜制铆钉", description: "本地铜片加工的普通紧固材料。" });
    default: return JSON.stringify({ narrative: "我还没核对港口告示，不如一起看看？", statePatch: {} });
  }
}

/** Two scoped synthetic calls: full creation plus one replacement, never a user's draft. */
export async function runWorldFullQuality(call: (id: string, request: ModelStreamRequest) => Promise<string>) {
  const pg = new PGlite(); let caseId = "world-full"; let calls = 0;
  const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic-bridge-only", baseUrl: "https://provider.invalid", model: "evaluation-bridge" }),
    createProvider: () => ({ stream: async function* (request) { calls++; yield { type: "delta", text: await call(caseId, request) }; } }) });
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations());
    const worlds = createGameWorldRepository(drizzle(pg, { schema }));
    const input: WorldBrief = { brief: "合成测试：无魔法蒸汽小港，仅抵达处和档案室两个互通地点、一名普通档案员；没有道具、秘密或额外事件，描述简洁但字段齐全。玩家可拒绝听一段旧港故事。", constraints: ["不替玩家决定思想", "人物不能读心"], magic: "forbidden", numericPolicy: "qualitative" };
    const service = createWorldGenerationService(worlds, generator);
    let world = await worlds.create(input);
    world = await service.generate(world.id, { expectedVersion: world.version, requestId: crypto.randomUUID(), sections: [...WORLD_SECTIONS] });
    assert.deepEqual(worldDraftIssues(input, world.content), []);
    const original = structuredClone(world.content); caseId = "world-opening";
    world = await service.generate(world.id, { expectedVersion: world.version, requestId: crypto.randomUUID(), sections: ["opening"] });
    assert.deepEqual(world.content!.region, original!.region); assert.deepEqual(world.content!.characters, original!.characters);
    assert.deepEqual(worldDraftIssues(input, world.content), []);
    const revision = await worlds.publish(world.id, world.version);
    return { scope: "synthetic-full-world-and-opening", calls, publishedRevision: revision.revision, locations: world.content!.region.locations.length, characters: world.content!.characters.length };
  } finally { await pg.close(); }
}

export async function runCreationQuality(call: (id: string, request: ModelStreamRequest) => Promise<string>) {
  const pg = new PGlite(); let caseId = "world-overview"; let calls = 0;
  const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic-bridge-only", baseUrl: "https://provider.invalid", model: "evaluation-bridge" }),
    createProvider: () => ({ stream: async function* (request) { calls++; yield { type: "delta", text: await call(caseId, request) }; } }) });
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); const db = drizzle(pg, { schema });
    const worlds = createGameWorldRepository(db); const assets = createGameAssetDesignRepository(db); const events = createGameEventDesignRepository(db);
    const sessions = createGameSessionRepository(db); const draws = createGameDrawRepository(db);
    const input = { brief: "蒸汽时代铜湾港，没有超自然力量；围绕工坊与档案修补展开克制的探索。", magic: "forbidden" as const, numericPolicy: "qualitative" as const, constraints: ["不得凭空添加战斗数值或让人物全知"] };
    let world = await worlds.create(input); const content = blankWorldBlueprint(input); content.authorNotes = ["SYNTH_HOST_ONLY：港口停航的幕后原因尚未揭晓。"];
    world = await worlds.update(world.id, { expectedVersion: world.version, input, content, lockedSections: [] });
    world = await createWorldGenerationService(worlds, generator).generate(world.id, { expectedVersion: world.version, requestId: crypto.randomUUID(), sections: ["overview"] });
    assert.equal(world.content!.overview.usesSupernatural, false);
    caseId = "item-local-craft";
    let item = await assets.create({ worldId: world.id, expectedWorldVersion: world.version, kind: "item", brief: "补全本地工坊铜片的来源、用途、限制与历史，不添加超自然效果或属性。" });
    assert.equal(item.content.kind, "item"); if (item.content.kind !== "item") throw new Error("fixture");
    item = await assets.update(item.id, { expectedVersion: item.version, brief: item.brief, lockedFields: ["name"], content: { ...item.content, name: "修补铜片", stackable: true, details: { ...item.content.details, category: "material" } } });
    item = await createAssetGenerationService(assets, generator).generate(item.id, { expectedVersion: item.version, requestId: crypto.randomUUID(), fields: ["details"] });
    await assets.confirm(item.id, item.version, world.version); world = await worlds.get(world.id);
    caseId = "character-motivation";
    let person = await assets.create({ worldId: world.id, expectedWorldVersion: world.version, kind: "character", targetId: "guide", brief: "港口记录员。坚持核实来源，想修补档案箱。保留privateBackground与主持备注原文，补全动机、需求和长期目标。" });
    if (person.content.kind !== "character") throw new Error("fixture");
    person = await assets.update(person.id, { expectedVersion: person.version, brief: person.brief, lockedFields: [], content: { ...person.content, category: "important", name: "记录员阿岚",
      profile: { ...person.content.profile, privateBackground: "SYNTH_SELF_PAST：少年时替工坊誊写过修船单据。", authorNotes: ["SYNTH_CHARACTER_HOST_ONLY：档案箱的来历还有别人的秘密。"] } } });
    person = await createAssetGenerationService(assets, generator).generate(person.id, { expectedVersion: person.version, requestId: crypto.randomUUID(), fields: ["profile"] });
    await assets.confirm(person.id, person.version, world.version); world = await worlds.get(world.id);
    caseId = "event-finite-refusable";
    let event = await events.create({ kind: "world", worldId: world.id, expectedVersion: world.version, brief: "设计修补档案箱的小委托。只润色已有stages的description、label、cost、result，保持所有阶段ID、next、拒绝选项、knowledge和effect不变；不要声称玩家已接受。" });
    const plan = structuredClone(event.content); plan.name = "修补档案箱"; plan.trigger = { item: item.content.id }; plan.actorIds = ["guide"];
    plan.details.onTriggerKnowledge = [{ text: "SYNTH_PORT_RUMOR：听说西堤旧仓库将临时停用，但未经核实。", evidence: "rumor", recipients: ["guide"], reason: "收到未署名的工坊便条" }];
    plan.stages[0].choices[0].effect = { coins: 3, rewards: [{ definitionId: item.content.id, quantity: 2 }] };
    event = await events.update(event.id, { expectedVersion: event.version, brief: event.brief, content: plan, lockedFields: ["details", "trigger"] });
    event = await createEventGenerationService(events, generator).generate(event.id, { expectedVersion: event.version, requestId: crypto.randomUUID(), fields: ["stages"] });
    assert.equal(event.generation.error, null, "event generation must be accepted, not silently retained");
    await events.confirm(event.id, event.version, world.version); world = await worlds.get(world.id);
    const base = { explanation: "合成测试的免费材料池", locationId: null, minTick: 0, coinCost: 0, maxDraws: 2, replacement: true };
    world = await worlds.update(world.id, { expectedVersion: world.version, input, lockedSections: [], drawPoolsConfirmed: true, eventDesignsConfirmed: true, content: { ...world.content!, drawPools: [
      { ...base, id: "fixed", name: "固定铜片", entries: [{ id: "copper", source: "fixed", definitionId: item.content.id, weight: 1, minQuantity: 1, maxQuantity: 1 }] },
      { ...base, id: "generated", name: "关键词材料", entries: [{ id: "rivets", source: "generated", theme: "港城工艺", category: "material", quality: "ordinary", tier: "ordinary", rating: "ordinary", unique: false, weight: 1, minQuantity: 2, maxQuantity: 2 }] },
    ] } }); await worlds.publish(world.id, world.version);
    let session = await worlds.createSave(world.id, 1, crypto.randomUUID()); session = await sessions.updateStatus(session.id, { status: "active", expectedVersion: session.version, now: new Date() });
    const step = (body: object) => createGameTurnService(sessions, generator, undefined, undefined, worlds.resolveSessionTemplate).create(session.id,
      createGameTurnSchema.parse({ content: "合成验收", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), ...body }));
    session = await step({ explorationAction: { action: "start", templateId: `world-${world.id}`, templateVersion: "1.0.1" } });
    session = await step({ semanticInput: [{ kind: "private_thought", text: "SYNTH_PRIVATE_THOUGHT：我藏了一把钥匙。" }, { kind: "ooc_instruction", text: "SYNTH_OOC：我想重写结局，还没确认。" }] });
    const speak = () => step({ semanticInput: [{ kind: "dialogue", targetId: "guide", channel: "direct", text: "西堤旧仓库有没有停用的可靠消息？" }] });
    caseId = "actor-before-knowledge"; session = await speak();
    const beforeFixed = calls; let draw = await draws.prepare(session.id, { requestId: crypto.randomUUID(), parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, poolId: "fixed", keywords: "", confirmed: true }, "r10-fixed");
    await draws.settle(draw.id, draw.version); const fixedDrawModelCalls = calls - beforeFixed; assert.equal(fixedDrawModelCalls, 0); session = (await sessions.get(session.id))!;
    caseId = "actor-after-sourced-rumor"; session = await speak();
    caseId = "generated-draw-material"; draw = await draws.prepare(session.id, { requestId: crypto.randomUUID(), parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, poolId: "generated", keywords: "铜铆钉，普通修补材料，港口工坊边料加工", confirmed: true }, "r10-generated");
    draw = await createDrawGenerationService(draws, generator).generate(draw.id, { attemptId: crypto.randomUUID(), confirmed: true });
    assert.equal(draw.data.error, null, "generated item must pass fixed sample/constraint checks"); await draws.settle(draw.id, draw.version); session = (await sessions.get(session.id))!;
    session = await step({ explorationAction: { action: "choose", eventId: event.content.id, choiceId: "accept" } });
    const state = session.turns.at(-1)!.stateSnapshot.exploration!;
    assert.equal(state.coins, 3); assert.equal(state.instances.find((entry) => entry.definitionId === item.content.id)?.quantity, 3);
    assert.equal(state.instances.find((entry) => entry.definitionId !== item.content.id)?.quantity, 2);
    caseId = "host-narration-not-npc-dialogue"; session = await step({ semanticInput: [{ kind: "world_narration", text: "请描写眼前修补后的环境，不替人物说话，不决定我接下来做什么。" }] });
    return { calls, fixedDrawModelCalls, finalCoins: state.coins, finalInventoryQuantities: state.instances.map((entry) => entry.quantity), turns: session.turns.length };
  } finally { await pg.close(); }
}
