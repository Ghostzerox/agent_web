import { describe, expect, it, vi } from "vitest";
import {
  createGameTurnService,
  gamePromptMessages,
  gameTurnPath,
} from "@/lib/game/gameTurnService";
import type { GameSessionDetail, GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";

const sessionId = "11111111-1111-4111-8111-111111111111";
const rootId = "22222222-2222-4222-8222-222222222222";
const leftId = "33333333-3333-4333-8333-333333333333";
const rightId = "44444444-4444-4444-8444-444444444444";
const characterId = "55555555-5555-4555-8555-555555555555";
const createdAt = new Date("2026-09-30T03:00:00.000Z");
const baseState = {
  scene: "雾港：雨夜",
  sceneFacts: [] as string[],
  sceneExits: [] as string[],
  objectives: [] as string[],
  flags: {},
  resources: {},
  inventory: {},
  characters: {
    [characterId]: {
      name: "林舟",
      health: 12,
      maxHealth: 12,
      attributes: { 意志: 3 },
      conditions: [] as string[],
    },
  },
  items: {
    旧信: { name: "旧信", description: "来自雾港的信。", holderCharacterId: null, tags: ["线索"] },
  },
};

const detail: GameSessionDetail = {
  id: sessionId,
  userId: "00000000-0000-4000-8000-000000000001",
  title: "雾港来信",
  kind: "roleplay",
  status: "active",
  worldName: "雾港",
  worldPremise: "一座只在雨夜出现的港口。",
  worldTone: "悬疑、克制",
  worldRules: ["线索不会凭空消失"],
  safetyBoundaries: ["不出现血腥细节"],
  activeLeafTurnId: rightId,
  version: 5,
  createdAt,
  updatedAt: createdAt,
  characters: [{
    id: characterId,
    sessionId,
    name: "林舟",
    role: "调查员",
    controller: "user",
    description: "收到一封旧信。",
    personality: "谨慎",
    goals: ["查明寄信人"],
    boundaries: [],
    attributes: { 意志: 3 },
    maxHealth: 12,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  }],
  events: [],
  checkpoints: [],
  turns: [
    { id: rootId, sessionId, parentTurnId: null, playerContent: "进城", assistantContent: "雾门开启", model: "m", statePatch: {}, stateSnapshot: baseState, createdAt },
    { id: leftId, sessionId, parentTurnId: rootId, playerContent: "去码头", assistantContent: "船笛响起", model: "m", statePatch: { scene: "码头" }, stateSnapshot: { ...baseState, scene: "码头" }, createdAt },
    { id: rightId, sessionId, parentTurnId: rootId, playerContent: "去酒馆", assistantContent: "门铃轻响", model: "m", statePatch: { scene: "酒馆" }, stateSnapshot: { ...baseState, scene: "酒馆", inventory: { 旧信: 1 } }, createdAt },
  ],
};

function repository(overrides: Partial<GameSessionRepositoryPort> = {}): GameSessionRepositoryPort {
  return {
    list: vi.fn(), create: vi.fn(), get: vi.fn().mockResolvedValue(detail),
    update: vi.fn(), delete: vi.fn(), createCharacter: vi.fn(),
    updateCharacter: vi.fn(), deleteCharacter: vi.fn(), updateStatus: vi.fn(),
    appendTurn: vi.fn().mockResolvedValue({ ...detail, version: 6 }),
    createCheckpoint: vi.fn(), restoreCheckpoint: vi.fn(), deleteCheckpoint: vi.fn(),
    ...overrides,
  };
}

describe("GameTurnService", () => {
  it("describes only existing tools, unresolved checks and consistent state changes", () => {
    const messages = gamePromptMessages(detail, rightId, "检定并抽卡");
    expect(messages[0].content).toContain("普通骰子点数不等于已完成检定");
    expect(messages[0].content).toContain("当前没有抽卡工具");
    expect(messages[0].content).toContain("narrative 与 statePatch");
    expect(messages[0].content).toContain("roleplay");
    expect(messages.at(-2)?.content).toContain("No rule check was resolved");
  });
  it("keeps the reusable branch prefix before changing snapshots and trusted dice", () => {
    const left = gamePromptMessages(detail, rightId, "问题一", { ...baseState, scene: "甲" });
    const right = gamePromptMessages(detail, rightId, "问题二", { ...baseState, scene: "乙" });
    expect(left.slice(0, -2)).toEqual(right.slice(0, -2));
    expect(left.at(-2)?.role).toBe("system");
    expect(left.at(-2)?.content).toContain("Game state snapshot");
    expect(left.at(-1)).toEqual({ role: "user", content: "问题一" });
    expect(left.at(-2)?.content).not.toEqual(right.at(-2)?.content);
  });
  it("selects only the ancestors of the chosen branch", () => {
    expect(gameTurnPath(detail.turns, rightId).map((turn) => turn.id)).toEqual([
      rootId,
      rightId,
    ]);
    const messages = gamePromptMessages(detail, rightId, "询问老板");
    const content = messages.map((item) => item.content).join("\n");
    expect(content).toContain("进城");
    expect(content).toContain("去酒馆");
    expect(content).not.toContain("去码头");
    expect(content).toContain("不出现血腥细节");
  });

  it("generates and appends a turn with an optimistic version", async () => {
    const appendTurn = vi.fn().mockResolvedValue({ ...detail, version: 6 });
    const generate = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        narrative: "老板停下擦杯子的动作。",
        statePatch: {
          adjustInventory: { 线索纸条: 1 },
          upsertItems: {
            线索纸条: { name: "线索纸条", description: "老板递来的纸条。", holderCharacterId: null, tags: ["线索"] },
          },
        },
      }),
      model: "deepseek-test",
    });
    const service = createGameTurnService(
      repository({ appendTurn }),
      { generate },
      () => createdAt,
      () => "fixed-seed",
    );
    await service.create(sessionId, {
      content: "询问老板",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [{ count: 1, sides: 20, modifier: 2, purpose: "说服检定" }],
      checkRequest: null,
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(appendTurn).toHaveBeenCalledWith(sessionId, {
      parentTurnId: rightId,
      playerContent: "询问老板",
      assistantContent: "老板停下擦杯子的动作。",
      model: "deepseek-test",
      statePatch: {
        adjustInventory: { 线索纸条: 1 },
        upsertItems: {
          线索纸条: { name: "线索纸条", description: "老板递来的纸条。", holderCharacterId: null, tags: ["线索"] },
        },
      },
      stateSnapshot: {
        ...baseState,
        scene: "酒馆",
        inventory: { 旧信: 1, 线索纸条: 1 },
        items: {
          ...baseState.items,
          线索纸条: { name: "线索纸条", description: "老板递来的纸条。", holderCharacterId: null, tags: ["线索"] },
        },
      },
      events: [{
        kind: "dice_roll",
        payload: expect.objectContaining({
          notation: "1d20+2",
          seed: "fixed-seed",
          purpose: "说服检定",
        }),
      }],
      expectedVersion: 5,
      now: createdAt,
    });
  });

  it("resolves a character attribute check on the server before model generation", async () => {
    const appendTurn = vi.fn().mockResolvedValue({ ...detail, version: 6 });
    const generate = vi.fn().mockResolvedValue({
      content: JSON.stringify({ narrative: "低语从雨幕中退去。", statePatch: {} }),
      model: "deepseek-test",
    });
    const service = createGameTurnService(
      repository({ appendTurn }),
      { generate },
      () => createdAt,
      () => "rule-check-seed",
    );

    await service.create(sessionId, {
      content: "集中意志抵抗低语",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [],
      checkRequest: {
        characterId,
        attribute: "意志",
        difficulty: 12,
        count: 1,
        sides: 20,
        purpose: "抵抗低语",
      },
    });

    expect(generate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("rule-check-seed"),
      }),
    ]), undefined);
    expect(appendTurn).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      events: [expect.objectContaining({
        kind: "rule_check",
        payload: expect.objectContaining({
          characterName: "林舟",
          attribute: "意志",
          modifier: 3,
          difficulty: 12,
        }),
      })],
    }));
  });

  it("rejects paused or stale sessions before spending a model request", async () => {
    const generate = vi.fn();
    const paused = { ...detail, status: "paused" as const };
    const service = createGameTurnService(repository({
      get: vi.fn().mockResolvedValue(paused),
    }), { generate });
    await expect(service.create(sessionId, {
      content: "继续",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [],
      checkRequest: null,
    })).rejects.toMatchObject({ code: "GAME_SESSION_INVALID_STATUS" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an invalid model patch without persisting a partial turn", async () => {
    const appendTurn = vi.fn();
    const service = createGameTurnService(repository({ appendTurn }), {
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          narrative: "你失去了并不存在的钥匙。",
          statePatch: { adjustInventory: { 钥匙: -1 } },
        }),
        model: "deepseek-test",
      }),
    });
    await expect(service.create(sessionId, {
      content: "使用钥匙",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [],
      checkRequest: null,
    })).rejects.toMatchObject({ code: "GAME_STATE_INVALID" });
    expect(appendTurn).not.toHaveBeenCalled();
  });

  it("keeps recent branch context when old turns exceed the prompt budget", () => {
    const longTurns = Array.from({ length: 4 }, (_, index) => ({
      id: `${index + 6}6666666-6666-4666-8666-666666666666`,
      sessionId,
      parentTurnId: index === 0
        ? null
        : `${index + 5}6666666-6666-4666-8666-666666666666`,
      playerContent: `玩家${index}-${"甲".repeat(8_000)}`,
      assistantContent: `叙事${index}-${"乙".repeat(8_000)}`,
      model: "m",
      statePatch: {},
      stateSnapshot: baseState,
      createdAt,
    }));
    const messages = gamePromptMessages(
      { ...detail, turns: longTurns, activeLeafTurnId: longTurns[3].id },
      longTurns[3].id,
      "继续",
    );
    const joined = messages.map((item) => item.content).join("\n");
    expect(joined).toContain("玩家3-");
    expect(joined).not.toContain("玩家0-");
  });
});
