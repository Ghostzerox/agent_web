import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { createGameTurnSchema, type CreateGameTurnRequest } from "@/lib/game/contracts";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { applyExplorationAction, startWorld } from "@/lib/game/exploration/engine";
import { explorationStateSchema, worldItemSchema } from "@/lib/game/exploration/contracts";
import { EXPLORATION_CONTEXT_BUDGET } from "@/lib/game/exploration/prompt";
import { explorationMessages } from "@/lib/game/exploration/prompt";
import { actorContext, perceptionScope } from "@/lib/game/exploration/perception";
import { initialGameState } from "@/lib/game/state";
import type { GameSessionDetail, GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";
import { R10_SEMANTIC_CASES } from "./fixtures/r10SemanticCases";

const sessionId = "11111111-1111-4111-8111-111111111111";
const rootId = "22222222-2222-4222-8222-222222222222";
const savedId = "33333333-3333-4333-8333-333333333333";
const siblingId = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";
const previousRequestId = "66666666-6666-4666-8666-666666666666";
const now = new Date("2026-10-19T08:00:00Z");
const markers = {
  own: "SYNTH_ACTOR_KNOWLEDGE", player: "SYNTH_PLAYER_SECRET",
  other: "SYNTH_OTHER_CHARACTER", history: "SYNTH_REMOTE_HISTORY",
  inventory: "SYNTH_PRIVATE_INVENTORY", flag: "synth-private-flag", condition: "SYNTH_PRIVATE_CONDITION",
};

function syntheticSession(): GameSessionDetail {
  let exploration = startWorld("fog-harbor", "1.0.0");
  exploration = applyExplorationAction(exploration, { action: "move", targetId: "market" }, "baseline-market");
  exploration = applyExplorationAction(exploration, { action: "move", targetId: "tower" }, "baseline-tower");
  exploration.characters.keeper.knownInformation = [markers.own];
  exploration.characters.player.backstory = markers.player;
  exploration.characters.merchant.knownInformation = [markers.other];
  exploration.history.push({ id: "private-history", tick: 1, kind: "fact", origin: "play",
    text: markers.history, locationId: "archive", actorIds: ["player"], eventId: null, source: "synthetic" });
  exploration.instances[0].source = markers.inventory;
  exploration.flags[markers.flag] = true;
  exploration.conditions = [markers.condition];
  exploration.receipt = { requestId: previousRequestId, fingerprint: "a".repeat(64) };
  return {
    id: sessionId, userId: "00000000-0000-4000-8000-000000000001", title: "合成认知基线",
    kind: "interactive-story", status: "active", worldName: "合成探索",
    worldPremise: "只用于离线边界测试", worldTone: "克制", worldRules: [],
    safetyBoundaries: ["合成边界：不替玩家决定内心"], activeLeafTurnId: rootId,
    version: 1, createdAt: now, updatedAt: now, characters: [], events: [], checkpoints: [],
    turns: [{ id: rootId, sessionId, parentTurnId: null, playerContent: "到达旧灯塔",
      assistantContent: "守灯人在这里", model: "synthetic-host", statePatch: {},
      stateSnapshot: { ...initialGameState("合成探索", "合成起点"), exploration }, createdAt: now }],
  };
}

function harness(detail = syntheticSession(), output = { narrative: "合成回应：晚上好。", statePatch: {} }) {
  let saved = structuredClone(detail);
  const requests: ModelStreamRequest[] = [];
  const stream = vi.fn(async function* (request: ModelStreamRequest) {
    requests.push(structuredClone(request));
    yield { type: "delta" as const, text: JSON.stringify(output) };
  });
  const generator = createGameNarrativeGenerator({
    getConfig: () => ({ apiKey: "synthetic-not-a-real-key", baseUrl: "https://provider.invalid", model: "synthetic" }),
    createProvider: () => ({ stream }),
  });
  // Only the repository boundary is mocked: input parsing, engine, prompt construction
  // and generator/provider request assembly use the real current implementations.
  const repository: GameSessionRepositoryPort = {
    list: vi.fn(), create: vi.fn(), get: vi.fn(async () => structuredClone(saved)),
    update: vi.fn(), delete: vi.fn(), createCharacter: vi.fn(), updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(), updateStatus: vi.fn(), createCheckpoint: vi.fn(),
    restoreCheckpoint: vi.fn(), deleteCheckpoint: vi.fn(),
    appendTurn: vi.fn(async (_id, input) => {
      const id = saved.turns.some((turn) => turn.id === savedId) ? crypto.randomUUID() : savedId;
      saved = { ...saved, version: saved.version + 1, activeLeafTurnId: id,
        turns: [...saved.turns, { id, sessionId, parentTurnId: input.parentTurnId,
          playerContent: input.playerContent, assistantContent: input.assistantContent,
          model: input.model, statePatch: input.statePatch, stateSnapshot: input.stateSnapshot, createdAt: now }] };
      return structuredClone(saved);
    }),
  };
  return { repository, requests, stream, service: createGameTurnService(repository, generator, () => now) };
}

function dialogue(overrides: Partial<CreateGameTurnRequest> = {}): CreateGameTurnRequest {
  const targetId = overrides.explorationAction && "targetId" in overrides.explorationAction ? overrides.explorationAction.targetId : "keeper";
  return createGameTurnSchema.parse({ content: "晚上好。", parentTurnId: rootId,
    expectedVersion: 1, requestId, explorationAction: { action: "talk", targetId: "keeper" },
    narrate: true, semanticInput: overrides.narrate === false ? undefined : [{ kind: "dialogue", text: "晚上好。", targetId, channel: "direct" }], ...overrides });
}

const denyNetwork = vi.fn(() => { throw new Error("R10 baseline must not use the network"); });
beforeEach(() => { denyNetwork.mockClear(); vi.stubGlobal("fetch", denyNetwork); });
afterEach(() => { try { expect(denyNetwork).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); } });

describe("current exploration service boundary regression", () => {
  it("C01 captures only the selected character scope at the real provider port", async () => {
    const { service, requests } = harness();
    await service.create(sessionId, dialogue());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ business: "game", promptVersion: "r10/exploration-v2" });
    const serialized = JSON.stringify(requests[0].messages);
    expect(serialized).not.toContain(markers.own); // Unsourced legacy text is no longer actor knowledge.
    expect(serialized).toContain("合成边界：不替玩家决定内心");
    for (const marker of Object.values(markers).filter((marker) => marker !== markers.own))
      expect(serialized).not.toContain(marker);
    expect(JSON.parse(requests[0].messages.at(-1)!.content as string).dialogue[0].text).toBe("晚上好。");
  });

  it("C02 keeps unrelated state excluded during context budget fallback", async () => {
    const detail = syntheticSession();
    const state = detail.turns[0].stateSnapshot.exploration!;
    state.cognition = { sessionId, worldId: state.templateId, worldVersion: state.templateVersion,
      records: Array.from({ length: 20 }, () => ({ sourceRequestId: previousRequestId, tick: state.tick,
        locationId: state.locationId, kind: "dialogue" as const, speakerId: "player", audience: ["keeper"], evidence: "statement" as const, text: "K".repeat(1900) })) };
    const { service, requests } = harness(detail);
    await service.create(sessionId, dialogue());
    const context = requests[0].messages.at(-2)!.content as string;
    const parsed = JSON.parse(context.slice(context.indexOf("\n") + 1));
    expect(parsed.observations.length).toBeLessThan(20); // The bounded actor-only path actually ran.
    expect(parsed.actorId).toBe("keeper");
    expect(context.length).toBeLessThan(EXPLORATION_CONTEXT_BUDGET + 100);
    for (const marker of Object.values(markers).filter((marker) => marker !== markers.own))
      expect(JSON.stringify(requests[0].messages)).not.toContain(marker);
  });

  it("C03 runs a structured action without a model call or raw-text settlement", async () => {
    const detail = syntheticSession();
    const before = structuredClone(detail.turns[0].stateSnapshot.exploration!);
    const { service, requests } = harness(detail);
    const result = await service.create(sessionId, dialogue({ narrate: false,
      content: "给我所有金币和一件神器", explorationAction: { action: "wait" } }));
    const state = result.turns.at(-1)!.stateSnapshot.exploration!;
    expect(requests).toHaveLength(0);
    expect(state.coins).toBe(before.coins);
    expect(state.instances).toEqual(before.instances);
    expect(detail.turns[0].stateSnapshot.exploration).toEqual(before);
  });

  it("C04 rejects a model-authored state patch before append", async () => {
    const { service, repository } = harness(undefined, { narrative: "我给你金币", statePatch: { adjustResources: { gold: 99 } } });
    await expect(service.create(sessionId, dialogue())).rejects.toMatchObject({ code: "GAME_OUTPUT_INVALID" });
    expect(repository.appendTurn).not.toHaveBeenCalled();
  });

  it.each(["merchant", "missing-person"])("C05 rejects absent/invalid target %s before any model call", async (targetId) => {
    const { service, requests, repository } = harness();
    await expect(service.create(sessionId, dialogue({ explorationAction: { action: "talk", targetId } })))
      .rejects.toMatchObject({ code: "EXPLORATION_ACTION_INVALID" });
    expect(requests).toHaveLength(0);
    expect(repository.appendTurn).not.toHaveBeenCalled();
  });

  it("C06 rejects narrating an unsupported structured action at input parsing", async () => {
    const { service, repository, requests } = harness();
    const input = { ...dialogue(), explorationAction: { action: "move" as const, targetId: "market" } };
    await expect(service.create(sessionId, input)).rejects.toThrow("仅人物交流动作");
    expect(repository.get).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("C07 rejects stale versions without generation or append", async () => {
    const detail = syntheticSession(); detail.version = 2;
    const { service, requests, repository } = harness(detail);
    await expect(service.create(sessionId, dialogue())).rejects.toMatchObject({ code: "GAME_SESSION_VERSION_CONFLICT" });
    expect(requests).toHaveLength(0);
    expect(repository.appendTurn).not.toHaveBeenCalled();
  });

  it("C08 sends only selected ancestors in the free director narrative path", async () => {
    const detail = syntheticSession();
    detail.turns.push({ ...structuredClone(detail.turns[0]), id: siblingId, parentTurnId: rootId,
      playerContent: "SYNTH_SIBLING_BRANCH", assistantContent: "SYNTH_SIBLING_REPLY" });
    detail.activeLeafTurnId = siblingId;
    const { service, requests } = harness(detail);
    await service.create(sessionId, createGameTurnSchema.parse({ content: "先观察", parentTurnId: rootId, expectedVersion: 1 }));
    const serialized = JSON.stringify(requests[0].messages);
    expect(serialized).toContain("到达旧灯塔");
    expect(serialized).not.toContain("SYNTH_SIBLING_BRANCH");
    expect(serialized).not.toContain("SYNTH_SIBLING_REPLY");
  });

  it("C09 replays a committed exploration receipt without a second model call", async () => {
    const { service, requests, repository } = harness();
    const first = await service.create(sessionId, dialogue());
    const replayed = await service.create(sessionId, dialogue());
    expect(replayed).toEqual(first);
    expect(requests).toHaveLength(1);
    expect(repository.appendTurn).toHaveBeenCalledOnce();
  });

  it("C10 does not append or mutate the parent when generation fails", async () => {
    const detail = syntheticSession(); const before = structuredClone(detail);
    const { service, stream, repository } = harness(detail);
    stream.mockImplementationOnce(() => { throw new Error("synthetic generation failure"); });
    await expect(service.create(sessionId, dialogue())).rejects.toThrow("synthetic generation failure");
    expect(repository.appendTurn).not.toHaveBeenCalled();
    expect(await repository.get(sessionId)).toEqual(before);
    expect(detail).toEqual(before);
  });

  it("C11 enforces numeric policy at the world boundary instead of globally requiring item levels", () => {
    const state = startWorld("fog-harbor", "1.0.0"); const item = state.view.items[0];
    expect(worldItemSchema.safeParse(item).success).toBe(true);
    const qualitative = { ...item, level: undefined };
    expect(worldItemSchema.safeParse(qualitative).success).toBe(true);
    state.view.items[0] = qualitative;
    expect(explorationStateSchema.safeParse(state).success).toBe(false); // The existing light world still requires a level.
    // P09/P10 are executed in assetDesign.test.ts; this still checks the built-in light-world contract.
  });

  it.each(["perceptionScope", "creationDraft", "numericPolicy"])("C12 does not silently accept unimplemented/client-authoritative field %s", (field) => {
    expect(createGameTurnSchema.safeParse({ ...dialogue(), [field]: {} }).success).toBe(false);
  });
});

describe("R10 synthetic future acceptance corpus — explicitly pending, not passed", () => {
  for (const sample of R10_SEMANTIC_CASES.filter((sample) => sample.owner === "R10.5"))
    it.todo(`${sample.id} ${sample.owner}: ${sample.title} | ${sample.input} → ${sample.expected}`);
});

describe("R10.2 executable semantic acceptance", () => {
  it("P01 filters private thoughts out of actual actor requests and typed dialogue memory", async () => {
    const { service, requests } = harness();
    const result = await service.create(sessionId, dialogue({ content: "蓝色钥匙也藏在旧的content里",
      semanticInput: [{ kind: "private_thought", text: "我藏起了蓝色钥匙" }, { kind: "dialogue", text: "晚上好", targetId: "keeper", channel: "direct" }] }));
    expect(JSON.stringify(requests)).not.toContain("蓝色钥匙");
    expect(JSON.stringify(requests)).toContain("晚上好");
    const saved = result.turns.at(-1)!;
    expect(saved.playerContent).toContain("[私人想法]");
    expect(saved.playerContent).not.toContain("旧的content");
    const thoughts = saved.stateSnapshot.exploration!.cognition!.records.filter((entry) => entry.kind === "private_thought");
    expect(thoughts[0].audience).toEqual(["player"]);
    expect(JSON.stringify(saved.stateSnapshot.exploration!.characters.keeper.memories)).not.toContain("蓝色钥匙");
  });

  it("P02 preserves narration/action semantics without converting them to speech or world facts", async () => {
    const { service, requests } = harness();
    const result = await service.create(sessionId, createGameTurnSchema.parse({ content: "语义输入", parentTurnId: rootId,
      expectedVersion: 1, requestId, semanticInput: [{ kind: "world_narration", text: "港外下雨" }, { kind: "action", text: "收起伞" }] }));
    const turn = result.turns.at(-1)!;
    expect(turn.playerContent).toContain("[旁白建议]"); expect(turn.playerContent).toContain("[行动意图]");
    expect(JSON.stringify(turn.stateSnapshot.exploration!.cognition)).not.toContain("玩家说");
    expect(requests[0].messages[0].content).toContain("中文主持人");
    expect(turn.stateSnapshot.exploration!.flags).toEqual(syntheticSession().turns[0].stateSnapshot.exploration!.flags);
  });

  it("P03 saves OOC intentions and private thoughts without model calls or world mutations", async () => {
    const before = syntheticSession(); const { service, requests } = harness(before);
    const result = await service.create(sessionId, createGameTurnSchema.parse({ content: "记录", parentTurnId: rootId, expectedVersion: 1, requestId,
      semanticInput: [{ kind: "ooc_instruction", text: "先设计一座雪城草稿" }, { kind: "private_thought", text: "暂不说出口" }] }));
    expect(requests).toHaveLength(0);
    const state = result.turns.at(-1)!.stateSnapshot.exploration!;
    expect(state.locationId).toBe(before.turns[0].stateSnapshot.exploration!.locationId);
    expect(state.tick).toBe(before.turns[0].stateSnapshot.exploration!.tick);
    expect(state.cognition!.lastInput?.[0].kind).toBe("ooc_instruction");
    expect(state.cognition!.records.every((entry) => entry.audience.length === 1 && entry.audience[0] === "player")).toBe(true);
  });

  it("P04 distributes direct/public dialogue only to actual recipients at that location", async () => {
    for (const channel of ["direct", "public"] as const) {
      const detail = syntheticSession();
      detail.turns[0].stateSnapshot.exploration!.characters.merchant.locationId = "tower";
      const { service } = harness(detail);
      const result = await service.create(sessionId, dialogue({ semanticInput: [{ kind: "dialogue", text: "SYNTH_WHISPER", targetId: "keeper", channel }] }));
      const state = result.turns.at(-1)!.stateSnapshot.exploration!;
      const context = actorContext(state, "merchant", perceptionScope(result, result.activeLeafTurnId));
      expect(JSON.stringify(context).includes("SYNTH_WHISPER")).toBe(channel === "public");
      expect(state.cognition!.records.find((entry) => entry.kind === "dialogue")!.audience).not.toContain("archivist");
    }
  });

  it("P05 keeps rumor provenance in initial knowledge and bounded sourced memory", async () => {
    const detail = syntheticSession(); detail.turns[0].stateSnapshot.exploration!.characters.merchant.locationId = "tower";
    const { service } = harness(detail);
    const result = await service.create(sessionId, dialogue({ explorationAction: { action: "talk", targetId: "merchant" } }));
    const context = actorContext(result.turns.at(-1)!.stateSnapshot.exploration!, "merchant", perceptionScope(result, result.activeLeafTurnId));
    expect(context.knowledge.find((entry) => entry.source.endsWith(":lens-rumor"))).toMatchObject({ evidence: "rumor", method: "initial-knowledge" });
    expect(context.observations.filter((entry) => entry.kind === "dialogue" || entry.kind === "reply").every((entry) => entry.evidence === "statement")).toBe(true);
  });

  it("P06 never lets lastResult, raw history, content or legacy memories bypass actor scope", () => {
    const detail = syntheticSession(); const state = detail.turns[0].stateSnapshot.exploration!;
    state.lastResult = "SYNTH_HOST_SECRET";
    state.characters.keeper.memories = ["SYNTH_HOST_SECRET"];
    state.characters.keeper.knownInformation = ["SYNTH_HOST_SECRET"];
    const messages = explorationMessages(state, "SYNTH_HOST_SECRET", "keeper", [{ playerContent: "SYNTH_HOST_SECRET", assistantContent: "SYNTH_HOST_SECRET" }], [], perceptionScope(detail, rootId));
    expect(JSON.stringify(messages)).not.toContain("SYNTH_HOST_SECRET");
  });

  it("P07 rejects invalid actor scopes at the builder itself rather than falling back", () => {
    const detail = syntheticSession(); const state = detail.turns[0].stateSnapshot.exploration!;
    for (const target of ["missing", "merchant", "player"])
      expect(() => explorationMessages(state, "hello", target, [], [], perceptionScope(detail, rootId))).toThrow("不能回退");
    expect(() => explorationMessages(state, "hello", "keeper")).toThrow("来源范围");
  });

  it("P08 filters wrong-session/world/revision, sibling and future sources before requests", async () => {
    for (const mutation of ["none", "session", "world", "revision"] as const) {
      const detail = syntheticSession(); const state = detail.turns[0].stateSnapshot.exploration!;
      state.cognition = { sessionId: mutation === "session" ? siblingId : sessionId,
        worldId: mutation === "world" ? "other-world" : state.templateId,
        worldVersion: mutation === "revision" ? "99.0.0" : state.templateVersion,
        records: [
          { sourceRequestId: previousRequestId, tick: state.tick, locationId: "tower", kind: "dialogue", speakerId: "player", audience: ["keeper"], evidence: "statement", text: "SYNTH_VALID_SOURCE" },
          { sourceRequestId: siblingId, tick: state.tick, locationId: "tower", kind: "dialogue", speakerId: "player", audience: ["keeper"], evidence: "statement", text: "SYNTH_OTHER_SCOPE" },
          { sourceRequestId: previousRequestId, tick: state.tick + 1, locationId: "tower", kind: "dialogue", speakerId: "player", audience: ["keeper"], evidence: "statement", text: "SYNTH_FUTURE_SCOPE" },
        ] };
      const sibling = structuredClone(detail.turns[0]);
      sibling.id = siblingId; sibling.parentTurnId = rootId;
      sibling.stateSnapshot.exploration!.receipt = { requestId: siblingId, fingerprint: "b".repeat(64) };
      detail.turns.push(sibling); detail.activeLeafTurnId = siblingId;
      const { service, requests } = harness(detail);
      await service.create(sessionId, dialogue());
      const serialized = JSON.stringify(requests);
      expect(serialized).not.toMatch(/SYNTH_OTHER_SCOPE|SYNTH_FUTURE_SCOPE/u);
      expect(serialized.includes("SYNTH_VALID_SOURCE")).toBe(mutation === "none");
    }
  });

  it("rejects impersonated speakers and mixed public/private dialogue channels", () => {
    expect(createGameTurnSchema.safeParse({ ...dialogue(), semanticInput: [{ kind: "dialogue", text: "hi", targetId: "keeper", channel: "direct", speakerId: "merchant" }] }).success).toBe(false);
    expect(createGameTurnSchema.safeParse({ ...dialogue(), semanticInput: [
      { kind: "dialogue", text: "secret", targetId: "keeper", channel: "direct" },
      { kind: "dialogue", text: "hello everyone", targetId: "keeper", channel: "public" },
    ] }).success).toBe(false);
  });
});
