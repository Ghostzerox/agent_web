import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase } from "@/lib/db/migrations";
import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { createGameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createGameEventDesignRepository } from "@/lib/repositories/gameEventDesignRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createGameDrawRepository } from "@/lib/repositories/gameDrawRepository";
import { createGameEventDesignApi } from "@/lib/api/gameEventDesignApi";
import { createEventGenerationService, EVENT_DESIGN_PROMPT_VERSION } from "@/lib/game/events/generation";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { createGameTurnSchema } from "@/lib/game/contracts";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import { seededWorldBlueprint as blankWorldBlueprint } from "./helpers/worldBlueprint";
import { blankAssetDesign } from "@/lib/game/worlds/assetBlueprint";
import type { ItemDesign, CharacterDesign } from "@/lib/game/worlds/assetContracts";
import { compileWorld } from "@/lib/game/worlds/compile";
import { eventDefinitionSchema } from "@/lib/game/events/contracts";
import { blankEventDesign, eventDesignIssues } from "@/lib/game/events/validation";
import { actorContext, perceptionScope } from "@/lib/game/exploration/perception";
import { explorationMessages } from "@/lib/game/exploration/prompt";
import { exportGameSessionArtifact } from "@/lib/game/gameSessionExport";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { R10_SEMANTIC_CASES } from "./fixtures/r10SemanticCases";

const brief = { brief: "无魔法的合成港城", magic: "forbidden" as const, numericPolicy: "qualitative" as const, constraints: ["NPC不会自动全知"] };
describe("R10.5 event contracts and real SQL branch execution", () => {
  const pg = new PGlite(); const adapter = createPgliteMigrationDatabase(pg); const db = drizzle(pg, { schema });
  const worlds = createGameWorldRepository(db); const plans = createGameEventDesignRepository(db); const sessions = createGameSessionRepository(db);
  const requests: ModelStreamRequest[] = [];
  const narrator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }),
    createProvider: () => ({ stream: async function* (request) { requests.push(structuredClone(request)); yield { type: "delta", text: '{"narrative":"合成角色回应","statePatch":{}}' }; } }) });
  const turns = createGameTurnService(sessions, narrator, undefined, undefined, worlds.resolveSessionTemplate);
  beforeAll(async () => { await migrateDatabase(adapter, await loadMigrations()); }); afterAll(async () => { await pg.close(); });
  const setup = async (coins = 0, unique = false) => {
    const created = await worlds.create(brief); const content = blankWorldBlueprint(brief); content.authorNotes = ["SYNTH_HOST_ONLY"];
    const material = blankAssetDesign("item", "copper", brief, content) as ItemDesign; material.name = "合成铜片"; material.stackable = !unique; material.unique = unique;
    material.details.category = unique ? "consumable" : "material"; material.consumable = unique; material.useEffect = unique ? { locationId: null, requiresCondition: null, addCondition: "合成效果", removeCondition: null } : null;
    content.items.definitions = [material];
    const neighbor = blankAssetDesign("character", "neighbor", brief, content) as CharacterDesign; neighbor.profile.secrets = [{ text: "SYNTH_OTHER_SECRET", kind: "fact", knownBy: [] }];
    content.characters.push(neighbor);
    content.drawPools = [{ id: "supplies", name: "合成物资", explanation: "场外奖励", locationId: null, minTick: 0, coinCost: 0, maxDraws: 3, replacement: true,
      entries: [{ id: "copper", source: "fixed", definitionId: "copper", weight: 1, minQuantity: 1, maxQuantity: 1 }] }];
    const world = await worlds.update(created.id, { expectedVersion: created.version, input: brief, content, lockedSections: [], drawPoolsConfirmed: true });
    await worlds.publish(world.id, world.version);
    if (coins) await pg.query("UPDATE game_world_revisions SET definition=jsonb_set(definition,'{initial,coins}',$1::jsonb) WHERE world_id=$2", [JSON.stringify(coins), world.id]);
    let session = await worlds.createSave(world.id, 1, crypto.randomUUID()); session = await sessions.updateStatus(session.id, { status: "active", expectedVersion: session.version, now: new Date() });
    session = await turns.create(session.id, createGameTurnSchema.parse({ content: "开启", parentTurnId: null, expectedVersion: session.version, requestId: crypto.randomUUID(), explorationAction: { action: "start", templateId: `world-${world.id}`, templateVersion: "1.0.1" } }));
    return { world, session };
  };
  const runtime = (session: Awaited<ReturnType<typeof setup>>["session"]) => plans.create({ kind: "session", sessionId: session.id, parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, brief: R10_SEMANTIC_CASES.find((entry) => entry.id === "P13")!.input });
  const save = (row: Awaited<ReturnType<typeof plans.get>>, content = row.content, lockedFields: string[] = []) => plans.update(row.id, { expectedVersion: row.version, content, brief: row.brief, lockedFields });
  const step = (session: Awaited<ReturnType<typeof setup>>["session"], explorationAction: object) => turns.create(session.id, createGameTurnSchema.parse({ content: "合成宿主动作", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), explorationAction }));

  it("validates finite causal graphs, no-cost refusals, reference/unique/magic rules and explicit epic thresholds", () => {
    const content = blankWorldBlueprint(brief); const template = compileWorld(crypto.randomUUID(), 1, brief, content); const event = blankEventDesign(template, "test-event", "合成事件");
    expect(eventDesignIssues(event, template)).toEqual([]);
    const cycle = structuredClone(event); cycle.stages[0].choices[0].next = "available"; expect(eventDesignIssues(cycle, template).join(" ")).toContain("无环");
    const refuse = structuredClone(event); refuse.stages[0].choices[1].coinCost = 1; expect(eventDesignIssues(refuse, template).join(" ")).toContain("拒绝");
    expect(eventDesignIssues({ ...event, details: { ...event.details, usesSupernatural: true } }, template).join(" ")).toContain("超自然");
    expect(eventDesignIssues({ ...event, details: { ...event.details, category: "epic" } }, template).join(" ")).toContain("门槛");
    expect(eventDesignIssues({ ...event, actorIds: ["missing"] }, template).join(" ")).toContain("参与者");
    expect(eventDefinitionSchema.safeParse({ ...event, unsafeCode: "run" }).success).toBe(false);
  });

  it("world confirmation writes only a draft definition; publication creates a new pinned revision and old saves stay unchanged", async () => {
    const { world, session } = await setup(); let row = await plans.create({ kind: "world", worldId: world.id, expectedVersion: world.version, brief: "合成世界事件" });
    const content = structuredClone(row.content); content.name = "港口委托"; content.stages[0].choices[0].effect = { coins: 5, rewards: [{ definitionId: "copper", quantity: 2 }] };
    row = await save(row, content); const [one, two] = await Promise.all([plans.confirm(row.id, row.version, world.version), plans.confirm(row.id, row.version, world.version)]);
    expect(one.appliedWorldVersion).toBe(two.appliedWorldVersion); expect((await sessions.get(session.id))!.turns).toHaveLength(1);
    await expect(save(one)).rejects.toThrow("已确认");
    const updated = await worlds.get(world.id); await worlds.publish(world.id, updated.version); const fresh = await worlds.createSave(world.id, 2, crypto.randomUUID());
    const oldTemplate = await worlds.resolveSessionTemplate(session.id, `world-${world.id}`, "1.0.1"); const newTemplate = await worlds.resolveSessionTemplate(fresh.id, `world-${world.id}`, "1.0.2");
    expect(oldTemplate.events.some((event) => event.id === content.id)).toBe(false); expect(newTemplate.events.some((event) => event.id === content.id)).toBe(true);
  });

  it("P13 proposals are not facts; only confirmation plus conditions triggers, and explicitly sourced recipients alone know", async () => {
    let { session } = await setup(); let row = await runtime(session); const content = structuredClone(row.content);
    content.name = "合成停航"; content.actorIds = ["guide"]; content.trigger = { minTick: 2 }; content.details.cause = "SYNTH_PRIVATE_CAUSE"; content.details.authorNotes = ["SYNTH_EVENT_HOST_ONLY"];
    content.details.onTriggerKnowledge = [{ text: "SYNTH_GUIDE_RUMOR", evidence: "rumor", recipients: ["guide"], reason: "收到署名不明的港口纸条" }];
    content.stages[0].choices[0].effect = { coins: 5, rewards: [{ definitionId: "copper", quantity: 2 }] };
    row = await save(row, content); const untouched = (await sessions.get(session.id))!; expect(untouched.turns).toHaveLength(1); expect(JSON.stringify(untouched)).not.toMatch(/合成停航|SYNTH_PRIVATE_CAUSE/);
    const [confirmed, duplicate] = await Promise.all([plans.confirm(row.id, row.version, session.version), createGameEventDesignRepository(db).confirm(row.id, row.version, session.version)]);
    expect(confirmed.appliedTurnId).toBe(duplicate.appliedTurnId); session = (await sessions.get(session.id))!;
    let state = session.turns.at(-1)!.stateSnapshot.exploration!; expect(state.eventPlanIds).toEqual([row.id]); expect(state.events[content.id]).toBeUndefined(); expect(state.history.some((entry) => entry.eventId === content.id)).toBe(false);
    expect(JSON.stringify(session)).not.toMatch(/SYNTH_PRIVATE_CAUSE|SYNTH_EVENT_HOST_ONLY/);
    session = await step(session, { action: "wait" }); session = await step(session, { action: "wait" }); state = session.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.events[content.id].settled).toBe(false); expect(state.view.events.some((event) => event.name === "合成停航")).toBe(true);
    const template = await worlds.resolveSessionTemplate(session.id, state.templateId, state.templateVersion, session.activeLeafTurnId);
    const scope = perceptionScope(session, session.activeLeafTurnId); const known = actorContext(state, "guide", scope, () => template); const stranger = actorContext(state, "neighbor", scope, () => template);
    const host = explorationMessages(state, "描述当前环境", undefined, [], [], scope, () => template); expect(JSON.stringify(host)).toContain("SYNTH_PRIVATE_CAUSE"); expect(JSON.stringify(host)).toContain("SYNTH_EVENT_HOST_ONLY");
    expect(JSON.stringify(known)).toContain("SYNTH_GUIDE_RUMOR"); expect(known.observations.find((entry) => entry.text.includes("SYNTH_GUIDE_RUMOR"))!.evidence).toBe("rumor"); expect(JSON.stringify(stranger)).not.toContain("SYNTH_GUIDE_RUMOR");
    const before = requests.length; session = await turns.create(session.id, createGameTurnSchema.parse({ content: "你好", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), semanticInput: [{ kind: "dialogue", text: "你好", targetId: "guide", channel: "direct" }] }));
    expect(requests).toHaveLength(before + 1); expect(JSON.stringify(requests.at(-1))).toContain("SYNTH_GUIDE_RUMOR"); expect(JSON.stringify(requests.at(-1))).not.toMatch(/SYNTH_PRIVATE_CAUSE|SYNTH_EVENT_HOST_ONLY|SYNTH_OTHER_SECRET/);
    const request = createGameTurnSchema.parse({ content: "参与", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), explorationAction: { action: "choose", eventId: content.id, choiceId: "accept" } });
    session = await turns.create(session.id, request); const replay = await turns.create(session.id, request); expect(replay.turns).toHaveLength(session.turns.length);
    state = session.turns.at(-1)!.stateSnapshot.exploration!; expect(state.coins).toBe(5); expect(state.instances[0]).toMatchObject({ definitionId: "copper", quantity: 2, equippedSlot: null }); expect(state.events[content.id].settled).toBe(true);
    await expect(step(session, { action: "choose", eventId: content.id, choiceId: "accept" })).rejects.toThrow("已经结束");
    expect(JSON.stringify(exportGameSessionArtifact(session, "json", new Date()))).not.toContain("SYNTH_PRIVATE_CAUSE");
  });

  it("a remote event does not leak into player view/history; refusal has no costs or rewards", async () => {
    let { session } = await setup(); let row = await runtime(session); row = await save(row, { ...row.content, name: "远处的秘密聚会", locationId: "crossroads", actorIds: ["guide"], trigger: {} });
    await plans.confirm(row.id, row.version, session.version); session = (await sessions.get(session.id))!; let state = session.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.events[row.content.id]).toBeDefined(); expect(JSON.stringify(state.view)).not.toContain("远处的秘密聚会"); expect(state.history.some((entry) => entry.eventId === row.content.id)).toBe(false);
    await expect(step(session, { action: "choose", eventId: row.content.id, choiceId: "accept" })).rejects.toThrow("发生地点");
    session = await step(session, { action: "move", targetId: "crossroads" }); state = session.turns.at(-1)!.stateSnapshot.exploration!; expect(state.view.events.some((event) => event.id === row.content.id)).toBe(true);
    session = await step(session, { action: "choose", eventId: row.content.id, choiceId: "decline" }); state = session.turns.at(-1)!.stateSnapshot.exploration!; expect(state.coins).toBe(0); expect(state.instances).toEqual([]); expect(state.events[row.content.id]).toEqual({ stage: "declined", settled: true });
  });

  it("atomically rolls costs/rewards/history back when SQL append fails, then retries the unchanged receipt once", async () => {
    let { session } = await setup(7); let row = await runtime(session); const content = structuredClone(row.content); content.stages[0].choices[0].coinCost = 3; content.stages[0].choices[0].effect = { rewards: [{ definitionId: "copper", quantity: 2 }] };
    row = await save(row, content); await plans.confirm(row.id, row.version, session.version); session = (await sessions.get(session.id))!; const count = session.turns.length;
    const request = createGameTurnSchema.parse({ content: "参与", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), explorationAction: { action: "choose", eventId: content.id, choiceId: "accept" } });
    await pg.exec("ALTER TABLE game_turns ADD CONSTRAINT synthetic_event_fail CHECK(model <> 'host-exploration/v1') NOT VALID");
    try { await expect(turns.create(session.id, request)).rejects.toThrow(); } finally { await pg.exec("ALTER TABLE game_turns DROP CONSTRAINT synthetic_event_fail"); }
    const unchanged = (await sessions.get(session.id))!; expect(unchanged.turns).toHaveLength(count); expect(unchanged.turns.at(-1)!.stateSnapshot.exploration!.coins).toBe(7); expect(unchanged.turns.at(-1)!.stateSnapshot.exploration!.instances).toEqual([]);
    session = await turns.create(session.id, request); expect(session.turns.at(-1)!.stateSnapshot.exploration!.coins).toBe(4); expect(session.turns.at(-1)!.stateSnapshot.exploration!.instances[0].quantity).toBe(2);
  });

  it("event and draw rewards share permanent branch-local unique issuance, including after consumption", async () => {
    let { session } = await setup(0, true); let row = await runtime(session); const content = structuredClone(row.content); content.stages[0].choices[0].effect = { rewards: [{ definitionId: "copper", quantity: 1 }] };
    row = await save(row, content); await plans.confirm(row.id, row.version, session.version); session = (await sessions.get(session.id))!;
    session = await step(session, { action: "choose", eventId: content.id, choiceId: "accept" }); const id = session.turns.at(-1)!.stateSnapshot.exploration!.instances[0].id;
    session = await step(session, { action: "use", instanceId: id }); expect(session.turns.at(-1)!.stateSnapshot.exploration!.instances).toEqual([]);
    const context = await createGameDrawRepository(db).list(session.id, session.activeLeafTurnId!); expect(context.pools[0].probabilities).toEqual([]);
    let another = await runtime(session); another = await save(another, { ...content, id: another.content.id }); await plans.confirm(another.id, another.version, session.version); session = (await sessions.get(session.id))!;
    await expect(step(session, { action: "choose", eventId: another.content.id, choiceId: "accept" })).rejects.toThrow("唯一物品");
  });

  it("checkpoints remove future plans/knowledge/rewards, and stale drafts need explicit branch rebase", async () => {
    let { session } = await setup(); session = await sessions.createCheckpoint(session.id, { name: "计划前", note: "合成", expectedVersion: session.version, now: new Date() }); const root = session.activeLeafTurnId!;
    const old = await runtime(session); session = await step(session, { action: "wait" }); await expect(plans.confirm(old.id, old.version, old.sourceVersion)).rejects.toThrow("存档已变化");
    let adapted = await plans.rebase(old.id, old.version, session.version, session.activeLeafTurnId!); adapted = await save(adapted, { ...adapted.content, details: { ...adapted.content.details, onTriggerKnowledge: [{ text: "SYNTH_FUTURE_KNOWLEDGE", evidence: "fact", recipients: ["guide"], reason: "现场告知" }] } });
    await plans.confirm(adapted.id, adapted.version, session.version); session = (await sessions.get(session.id))!; expect(session.turns.at(-1)!.stateSnapshot.exploration!.eventPlanIds).toEqual([old.id]);
    session = await sessions.restoreCheckpoint(session.id, session.checkpoints[0].id, { expectedVersion: session.version, now: new Date() }); expect(session.activeLeafTurnId).toBe(root);
    const state = session.turns.find((turn) => turn.id === root)!.stateSnapshot.exploration!; const template = await worlds.resolveSessionTemplate(session.id, state.templateId, state.templateVersion, root);
    expect(template.events.some((event) => event.id === old.content.id)).toBe(false); expect(state.eventPlanIds).toBeUndefined(); expect(JSON.stringify(actorContext(state, "guide", perceptionScope(session, root), () => template))).not.toContain("SYNTH_FUTURE_KNOWLEDGE");
  });

  it("captures real bounded event Provider requests, locked fields and filters private input/sibling history/other NPC secrets", async () => {
    let { session } = await setup(); session = await turns.create(session.id, createGameTurnSchema.parse({ content: "SYNTH_PRIVATE_THOUGHT", parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, requestId: crypto.randomUUID(), semanticInput: [{ kind: "private_thought", text: "SYNTH_PRIVATE_THOUGHT" }] }));
    const selectedParent = session.activeLeafTurnId!;
    session = await turns.create(session.id, createGameTurnSchema.parse({ content: "SYNTH_SIBLING", parentTurnId: selectedParent, expectedVersion: session.version, requestId: crypto.randomUUID(), semanticInput: [{ kind: "world_narration", text: "SYNTH_SIBLING" }] }));
    let row = await plans.create({ kind: "session", sessionId: session.id, parentTurnId: selectedParent, expectedVersion: session.version, brief: "所选旧分支的事件" }); row = await save(row, { ...row.content, actorIds: ["guide"] }, ["details"]); const captured: ModelStreamRequest[] = [];
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }), createProvider: () => ({ stream: async function* (request) { captured.push(request); yield { type: "delta", text: '{"name":"合成停航建议"}' }; } }) });
    const request = { expectedVersion: row.version, requestId: crypto.randomUUID(), fields: ["name", "details"] }; const generated = await createEventGenerationService(plans, generator).generate(row.id, request);
    expect(generated.content.name).toBe("合成停航建议"); expect(generated.content.details).toEqual(row.content.details); expect(generated.origins.name).toBe("ai"); expect(captured[0].promptVersion).toBe(EVENT_DESIGN_PROMPT_VERSION);
    expect(JSON.stringify(captured)).not.toMatch(/SYNTH_PRIVATE_THOUGHT|SYNTH_OTHER_SECRET|SYNTH_SIBLING/); expect(JSON.stringify(captured)).toContain("SYNTH_HOST_ONLY");
    const payload = JSON.parse(captured[0].messages[1].content as string); expect(payload.current.stages).toBeUndefined(); expect((captured[0].messages[1].content as string).length).toBeLessThan(30000);
    await createEventGenerationService(createGameEventDesignRepository(db), generator).generate(row.id, request); expect(captured).toHaveLength(1);
    const api = createGameEventDesignApi(plans); const response = await api(new Request("http://local/api/v1/game-events"), [row.id]); const publicData = JSON.stringify(await response.json()); expect(publicData).not.toMatch(/sourceSnapshot|SYNTH_OTHER_SECRET|SYNTH_HOST_ONLY/);
  });

  it("durably claims in-flight requests, fences late output after stop, and preserves original draft on invalid JSON/field patches", async () => {
    const { session } = await setup(); const row = await runtime(session); let release!: () => void; const pause = new Promise<void>((resolve) => { release = resolve; });
    const generate = vi.fn(async () => { await pause; return { content: '{"name":"late"}', model: "synthetic" }; }); const input = { expectedVersion: row.version, requestId: crypto.randomUUID(), fields: ["name"] };
    const waiting = createEventGenerationService(plans, { generate }).generate(row.id, input); await vi.waitFor(async () => expect((await plans.get(row.id)).generation.active).toBe(input.requestId));
    const duplicate = await createEventGenerationService(createGameEventDesignRepository(db), { generate }).generate(row.id, input); expect(duplicate.generation.active).toBe(input.requestId); expect(generate).toHaveBeenCalledOnce();
    await plans.stopGeneration(row.id); release(); const stopped = await waiting; expect(stopped.content.name).toBe(row.content.name); expect(stopped.generation.active).toBeNull();
    const invalid = await createEventGenerationService(plans, { generate: async () => ({ content: '{"id":"hacked"}', model: "synthetic" }) }).generate(row.id, { expectedVersion: stopped.version, requestId: crypto.randomUUID(), fields: ["name"] });
    expect(invalid.content).toEqual(row.content); expect(invalid.generation.error).toBeTruthy();
  });

  it("requires complete nested field replacements and rejects the real-model partial-stage failure without erasing costs/refusal", async () => {
    const { session } = await setup(); const row = await runtime(session);
    let checked = false;
    const incomplete = { stages: row.content.stages.map(({ id, description, choices }) => ({ id, description,
      choices: choices.map(({ id, label, cost, next, result }) => ({ id, label, cost, next, result })) })) };
    const result = await createEventGenerationService(plans, { generate: async (messages) => {
      const system = messages[0].content as string;
      expect(system).toContain("每个请求字段会整体替换，不是递归合并补丁");
      expect(system).toContain("terminal、choices"); expect(system).toContain("effect、result、refusal、knowledge"); checked = true;
      return { content: JSON.stringify(incomplete), model: "synthetic-recorded-failure" };
    } }).generate(row.id, { expectedVersion: row.version, requestId: crypto.randomUUID(), fields: ["stages"] });
    expect(checked).toBe(true); expect(result.content).toEqual(row.content); expect(result.generation.error).toBeTruthy();
    expect(result.generation.active).toBeNull(); expect(result.generation.attempts).toHaveLength(1);
  });

  it("requires confirmation and owner/source authorization; used plans fence lossy migration rollback", async () => {
    const { session } = await setup(); const row = await runtime(session); const api = createGameEventDesignApi(plans);
    expect((await api(new Request("http://local/api", { method: "POST", body: JSON.stringify({ expectedVersion: row.version, expectedSourceVersion: session.version }) }), [row.id, "confirm"])).status).toBe(400);
    expect((await api(new Request("http://local/api"), [crypto.randomUUID()])).status).toBe(404);
    const other = await setup(); await expect(plans.create({ kind: "session", sessionId: other.session.id, parentTurnId: session.activeLeafTurnId, expectedVersion: other.session.version, brief: "跨存档" })).rejects.toThrow("本存档");
    await expect(rollbackDatabase(adapter, await loadMigrations())).rejects.toThrow("event data exists"); expect((await plans.get(row.id)).appliedTurnId).toBeNull();
  });

  it("explicitly rebases stale world plans without changing their manual content or field locks", async () => {
    const { world } = await setup(); let row = await plans.create({ kind: "world", worldId: world.id, expectedVersion: world.version, brief: "港口临时委托" });
    row = await save(row, { ...row.content, name: "手写委托" }, ["name"]);
    const changed = await worlds.update(world.id, { expectedVersion: world.version, input: brief, content: world.content!, lockedSections: [] });
    await expect(plans.confirm(row.id, row.version, row.sourceVersion)).rejects.toThrow("世界版本已变化");
    row = await plans.rebase(row.id, row.version, changed.version); expect(row.content.name).toBe("手写委托"); expect(row.lockedFields).toEqual(["name"]);
    expect((await plans.confirm(row.id, row.version, changed.version)).appliedWorldVersion).toBe(changed.version + 1);
  });

  it("an actual draw can meet an item gate and propagate only the explicitly authored rumor", async () => {
    let { session } = await setup(); let row = await runtime(session);
    row = await save(row, { ...row.content, trigger: { item: "copper" }, details: { ...row.content.details, onTriggerKnowledge: [{ text: "SYNTH_ITEM_RUMOR", evidence: "rumor", recipients: ["guide"], reason: "收到了工坊的明确口信" }] } });
    await plans.confirm(row.id, row.version, session.version); session = (await sessions.get(session.id))!; expect(session.turns.at(-1)!.stateSnapshot.exploration!.events[row.content.id]).toBeUndefined();
    const draws = createGameDrawRepository(db); const draw = await draws.prepare(session.id, { requestId: crypto.randomUUID(), parentTurnId: session.activeLeafTurnId, expectedVersion: session.version, poolId: "supplies", keywords: "", confirmed: true }, "event-item-gate");
    await draws.settle(draw.id, draw.version); session = (await sessions.get(session.id))!; const state = session.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.events[row.content.id]).toEqual({ stage: "available", settled: false }); const template = await worlds.resolveSessionTemplate(session.id, state.templateId, state.templateVersion, session.activeLeafTurnId);
    expect(JSON.stringify(actorContext(state, "guide", perceptionScope(session, session.activeLeafTurnId), () => template))).toContain("SYNTH_ITEM_RUMOR");
    expect(JSON.stringify(actorContext(state, "neighbor", perceptionScope(session, session.activeLeafTurnId), () => template))).not.toContain("SYNTH_ITEM_RUMOR");
  });
});

it("can apply/rollback an unused event migration without changing old game data", async () => {
  const pg = new PGlite(); const adapter = createPgliteMigrationDatabase(pg); const migrations = await loadMigrations();
  try { await migrateDatabase(adapter, migrations.slice(0, 37)); await migrateDatabase(adapter, migrations); expect(await rollbackDatabase(adapter, migrations)).toBe("0037_game_event_designs.sql"); }
  finally { await pg.close(); }
});
