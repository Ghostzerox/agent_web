import { describe, expect, it } from "vitest";
import { rollGameRuleCheck } from "@/lib/game/checks";
import { rollGameDice } from "@/lib/game/dice";
import {
  applyGameStatePatch,
  parseGameState,
  parseGameModelTurn,
  type GameState,
} from "@/lib/game/state";

const state: GameState = {
  scene: "雾港酒馆",
  sceneFacts: ["雨一直在下"],
  sceneExits: ["通往钟楼的石阶"],
  objectives: ["找到寄信人"],
  flags: { metKeeper: true },
  resources: { 体力: 3 },
  inventory: { 旧信: 1 },
  characters: {
    "11111111-1111-4111-8111-111111111111": {
      name: "林舟",
      health: 10,
      maxHealth: 10,
      attributes: { 意志: 3 },
      conditions: [],
    },
  },
  items: {
    旧信: {
      name: "旧信",
      description: "被雨水打湿的信。",
      holderCharacterId: null,
      tags: ["线索"],
    },
  },
};

describe("Phase 6.3 dice and structured state", () => {
  it("reproduces every die result from the same algorithm, seed and request", () => {
    const request = { count: 3, sides: 6 as const, modifier: 2, purpose: "潜行检定" };
    const first = rollGameDice(request, "session-1:turn-2:roll-0");
    const replay = rollGameDice(request, "session-1:turn-2:roll-0");
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      notation: "3d6+2",
      algorithm: "fnv1a-mulberry32-v1",
      seed: "session-1:turn-2:roll-0",
    });
    expect(first.results).toHaveLength(3);
    expect(first.results.every((result) => result >= 1 && result <= 6)).toBe(true);
    expect(first.total).toBe(first.results.reduce((sum, result) => sum + result, 2));
  });

  it("applies an allowed patch without mutating the parent snapshot", () => {
    const next = applyGameStatePatch(state, {
      scene: "雾港钟楼",
      setFlags: { doorUnlocked: true },
      removeFlags: ["metKeeper"],
      adjustResources: { 体力: -1 },
      adjustInventory: { 旧信: -1, 铜钥匙: 1 },
      upsertItems: {
        铜钥匙: {
          name: "铜钥匙",
          description: "钟楼侧门钥匙。",
          holderCharacterId: null,
          tags: ["钥匙"],
        },
      },
    });
    expect(next).toEqual({
      scene: "雾港钟楼",
      sceneFacts: ["雨一直在下"],
      sceneExits: ["通往钟楼的石阶"],
      objectives: ["找到寄信人"],
      flags: { doorUnlocked: true },
      resources: { 体力: 2 },
      inventory: { 铜钥匙: 1 },
      characters: state.characters,
      items: {
        旧信: state.items.旧信,
        铜钥匙: {
          name: "铜钥匙",
          description: "钟楼侧门钥匙。",
          holderCharacterId: null,
          tags: ["钥匙"],
        },
      },
    });
    expect(state.inventory).toEqual({ 旧信: 1 });
  });

  it("rejects negative inventory and unauthorized model fields", () => {
    expect(() => applyGameStatePatch(state, {
      adjustInventory: { 不存在的物品: -1 },
    })).toThrow(/cannot become negative/);

    expect(() => parseGameModelTurn(JSON.stringify({
      narrative: "模型试图直接调用系统工具。",
      statePatch: {},
      toolCalls: [{ name: "delete_database" }],
    }))).toThrow(/invalid or unauthorized/);
  });

  it("accepts a fenced JSON response but still validates its strict schema", () => {
    expect(parseGameModelTurn(`\`\`\`json
{"narrative":"雨声停了一瞬。","statePatch":{"adjustResources":{"体力":-1}}}
\`\`\``)).toEqual({
      narrative: "雨声停了一瞬。",
      statePatch: { adjustResources: { 体力: -1 } },
    });
  });

  it("derives a deterministic rule check from the branch character attribute", () => {
    const request = {
      characterId: "11111111-1111-4111-8111-111111111111",
      attribute: "意志",
      difficulty: 12,
      count: 1,
      sides: 20 as const,
      purpose: "抵抗低语",
    };
    const first = rollGameRuleCheck(request, state.characters[request.characterId], "check-seed");
    const replay = rollGameRuleCheck(request, state.characters[request.characterId], "check-seed");
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      characterName: "林舟",
      modifier: 3,
      difficulty: 12,
      total: first.dice.results[0] + 3,
    });
    expect(["critical-success", "success", "failure", "critical-failure"]).toContain(first.outcome);
  });

  it("rejects incomplete old snapshots instead of silently upgrading them", () => {
    expect(() => parseGameState({ scene: "旧码头", objectives: [], flags: {}, resources: {}, inventory: {} })).toThrow("current schema");
    expect(() => parseGameState({ ...state, items: undefined })).toThrow("current schema");
  });

  it("does not inject a later character into an existing Phase 6.4 branch", () => {
    const laterCharacter = {
      id: "33333333-3333-4333-8333-333333333333",
      name: "后来者",
      maxHealth: 10,
      attributes: { 力量: 1 },
    };
    const normalized = parseGameState(state);
    expect(normalized.characters[laterCharacter.id]).toBeUndefined();
    expect(normalized.characters["11111111-1111-4111-8111-111111111111"]?.name).toBe("林舟");
  });
});
