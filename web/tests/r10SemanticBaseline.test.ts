import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { createGameTurnSchema, type CreateGameTurnRequest } from "@/lib/game/contracts";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { applyExplorationAction, startWorld } from "@/lib/game/exploration/engine";
import { worldItemSchema } from "@/lib/game/exploration/contracts";
import { EXPLORATION_CONTEXT_BUDGET } from "@/lib/game/exploration/prompt";
import { initialGameState } from "@/lib/game/state";
import type { GameSessionDetail, GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";
import { R10_PENDING_SEMANTIC_CASES } from "./fixtures/r10SemanticCases";

const sessionId = "11111111-1111-4111-8111-111111111111";
const rootId = "22222222-2222-4222-8222-222222222222";
const savedId = "33333333-3333-4333-8333-333333333333";
const siblingId = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";
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
      saved = { ...saved, version: saved.version + 1, activeLeafTurnId: savedId,
        turns: [...saved.turns, { id: savedId, sessionId, parentTurnId: input.parentTurnId,
          playerContent: input.playerContent, assistantContent: input.assistantContent,
          model: input.model, statePatch: input.statePatch, stateSnapshot: input.stateSnapshot, createdAt: now }] };
      return structuredClone(saved);
    }),
  };
  return { repository, requests, stream, service: createGameTurnService(repository, generator, () => now) };
}

function dialogue(overrides: Partial<CreateGameTurnRequest> = {}): CreateGameTurnRequest {
  return createGameTurnSchema.parse({ content: "晚上好。", parentTurnId: rootId,
    expectedVersion: 1, requestId, explorationAction: { action: "talk", targetId: "keeper" },
    narrate: true, ...overrides });
}

const denyNetwork = vi.fn(() => { throw new Error("R10 baseline must not use the network"); });
beforeEach(() => { denyNetwork.mockClear(); vi.stubGlobal("fetch", denyNetwork); });
afterEach(() => { try { expect(denyNetwork).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); } });

describe("R10.1 current executable boundary baseline (not R10.2 acceptance)", () => {
  it("C01 captures only the selected character scope at the real provider port", async () => {
    const { service, requests } = harness();
    await service.create(sessionId, dialogue());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ business: "game", promptVersion: "r7/exploration-v1" });
    const serialized = JSON.stringify(requests[0].messages);
    expect(serialized).toContain(markers.own);
    expect(serialized).toContain("合成边界：不替玩家决定内心");
    for (const marker of Object.values(markers).filter((marker) => marker !== markers.own))
      expect(serialized).not.toContain(marker);
    expect(requests[0].messages.at(-1)).toMatchObject({ role: "user", content: "晚上好。" });
  });

  it("C02 keeps unrelated state excluded during context budget fallback", async () => {
    const detail = syntheticSession();
    const target = detail.turns[0].stateSnapshot.exploration!.characters.keeper;
    target.knownInformation = Array.from({ length: 20 }, () => "K".repeat(590));
    target.memories = Array.from({ length: 20 }, () => "M".repeat(590));
    const { service, requests } = harness(detail);
    await service.create(sessionId, dialogue());
    const context = requests[0].messages.at(-2)!.content as string;
    const parsed = JSON.parse(context.slice(context.indexOf("\n") + 1));
    expect(parsed.characters).toHaveLength(1); // The bounded fallback path actually ran.
    expect(parsed.characters[0].id).toBe("keeper");
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

  it("C11 records that current item contracts are not yet qualitative-world contracts", () => {
    const item = startWorld("fog-harbor", "1.0.0").view.items[0];
    expect(worldItemSchema.safeParse(item).success).toBe(true);
    const qualitative = { ...item, level: undefined };
    expect(worldItemSchema.safeParse(qualitative).success).toBe(false);
    // This is a current-format audit, NOT acceptance of the future P09 contract.
  });

  it.each(["semanticInput", "creationDraft", "numericPolicy"])("C12 does not silently accept unimplemented field %s", (field) => {
    expect(createGameTurnSchema.safeParse({ ...dialogue(), [field]: {} }).success).toBe(false);
  });
});

describe("R10 synthetic future acceptance corpus — explicitly pending, not passed", () => {
  for (const sample of R10_PENDING_SEMANTIC_CASES)
    it.todo(`${sample.id} ${sample.owner}: ${sample.title} | ${sample.input} → ${sample.expected}`);
});
