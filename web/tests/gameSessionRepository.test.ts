import { count } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  loadMigrations,
  migrateDatabase,
  type MigrationDatabase,
  type MigrationRow,
  type MigrationSession,
} from "@/lib/db/migrations";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createGameTurnService } from "@/lib/game/gameTurnService";

function session(database: Pick<PGlite, "query">): MigrationSession {
  return {
    async execute(query, parameters = []) {
      return (await database.query<MigrationRow>(query, [...parameters])).rows;
    },
  };
}

function migrationDatabase(database: PGlite): MigrationDatabase {
  return {
    ...session(database),
    transaction(callback) {
      return database.transaction((transaction) => callback(session(transaction)));
    },
  };
}

const world = {
  name: "雾港",
  premise: "一座只在雨夜出现的港口。",
  tone: "悬疑、克制",
  rules: ["线索不会凭空消失"],
  boundaries: ["不把虚构当作现实"],
};

const character = {
  name: "林舟",
  role: "调查员",
  controller: "user" as const,
  description: "收到一封旧信。",
  personality: "谨慎但好奇",
  goals: ["查明寄信人"],
  boundaries: ["不出现血腥细节"],
  attributes: { 力量: 2, 意志: 3 },
  maxHealth: 12,
};

const state = {
  scene: "雾港：酒馆",
  sceneFacts: [] as string[],
  sceneExits: [] as string[],
  objectives: [] as string[],
  flags: {},
  resources: {},
  inventory: {},
  characters: {},
  items: {},
};

describe("GameSessionRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createGameSessionRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(migrationDatabase(pglite), await loadMigrations());
    repository = createGameSessionRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("persists branch-local decks, idempotent receipts and checkpoint restoration without model access", async () => {
    const now = new Date("2026-10-16T00:00:00Z");
    let current = await repository.create({ title: "工具局", kind: "tabletop", world, initialCharacter: null, now });
    current = await repository.updateStatus(current.id, { status: "active", expectedVersion: current.version, now });
    const service = createGameTurnService(repository, { generate: async () => { throw new Error("No model call allowed"); } });
    current = await service.create(current.id, { content: "创建牌堆", parentTurnId: null, expectedVersion: current.version, diceRequests: [], checkRequest: null, requestId: crypto.randomUUID(), toolOnly: true, toolRequest: { action: "deck-create", deckId: "牌", cards: ["A", "B", "C"] } });
    const root = current.activeLeafTurnId!;
    const checkpoint = await repository.createCheckpoint(current.id, { name: "抽牌前", note: "", expectedVersion: current.version, now });
    const request = { content: "抽一张", parentTurnId: root, expectedVersion: checkpoint.version, diceRequests: [], checkRequest: null, requestId: crypto.randomUUID(), toolOnly: true, toolRequest: { action: "deck-draw" as const, deckId: "牌", count: 1 } };
    const drawn = await service.create(current.id, request);
    const replayed = await service.create(current.id, request);
    expect(replayed.turns).toHaveLength(drawn.turns.length);
    expect(replayed.version).toBe(drawn.version);
    await expect(service.create(current.id, { ...request, content: "伪造重放" })).rejects.toMatchObject({ code: "GAME_STATE_INVALID" });
    const branched = await service.create(current.id, { ...request, requestId: crypto.randomUUID(), expectedVersion: drawn.version, content: "另一支抽两张", toolRequest: { action: "deck-draw", deckId: "牌", count: 2 } });
    const left = branched.turns.find((turn) => turn.id === drawn.activeLeafTurnId)!;
    const right = branched.turns.find((turn) => turn.id === branched.activeLeafTurnId)!;
    expect(left.stateSnapshot.toolkit?.decks.牌.hand).toHaveLength(1);
    expect(right.stateSnapshot.toolkit?.decks.牌.hand).toHaveLength(2);
    const restored = await repository.restoreCheckpoint(current.id, checkpoint.checkpoints[0].id, { expectedVersion: branched.version, now });
    expect(restored.activeLeafTurnId).toBe(root);
    expect(restored.turns.find((turn) => turn.id === root)?.stateSnapshot.toolkit?.decks.牌.drawPile).toHaveLength(3);
    const raceBase = { ...request, requestId: crypto.randomUUID(), expectedVersion: restored.version, parentTurnId: root };
    const results = await Promise.allSettled([service.create(current.id, raceBase), service.create(current.id, raceBase)]);
    expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    const persisted = await repository.get(current.id);
    expect(persisted?.turns.filter((turn) => turn.stateSnapshot.toolkit?.receipt?.requestId === raceBase.requestId)).toHaveLength(1);
  });

  it("persists world and character state outside conversations and memories", async () => {
    const now = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "雾港来信",
      kind: "roleplay",
      world,
      initialCharacter: character,
      now,
    });

    expect(created).toMatchObject({
      title: "雾港来信",
      worldName: "雾港",
      status: "setup",
      version: 1,
    });
    expect(created.characters).toHaveLength(1);
    expect(created.turns).toEqual([]);
    expect(created.characters[0]).toMatchObject({
      name: "林舟",
      attributes: { 力量: 2, 意志: 3 },
      maxHealth: 12,
      version: 1,
    });

    const [conversationCount] = await drizzle(pglite, { schema })
      .select({ value: count() })
      .from(schema.conversations);
    const [memoryCount] = await drizzle(pglite, { schema })
      .select({ value: count() })
      .from(schema.memoryItems);
    expect(conversationCount.value).toBe(0);
    expect(memoryCount.value).toBe(0);
  });

  it("versions session and character mutations and rejects stale writes", async () => {
    const first = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "雾港来信",
      kind: "roleplay",
      world,
      initialCharacter: character,
      now: first,
    });
    const updated = await repository.update(created.id, {
      title: "雾港第二夜",
      kind: "interactive-story",
      world: { ...world, tone: "更明亮" },
      expectedVersion: 1,
      now: new Date("2026-09-30T04:00:00.000Z"),
    });
    expect(updated).toMatchObject({ title: "雾港第二夜", version: 2 });

    const withCharacter = await repository.createCharacter(created.id, {
      ...character,
      name: "守灯人",
      controller: "ai",
      expectedSessionVersion: 2,
      now: new Date("2026-09-30T05:00:00.000Z"),
    });
    expect(withCharacter.version).toBe(3);
    expect(withCharacter.characters).toHaveLength(2);
    const keeper = withCharacter.characters.find((item) => item.name === "守灯人")!;

    const edited = await repository.updateCharacter(created.id, keeper.id, {
      ...character,
      name: "老守灯人",
      controller: "ai",
      expectedSessionVersion: 3,
      expectedCharacterVersion: 1,
      now: new Date("2026-09-30T06:00:00.000Z"),
    });
    expect(edited.version).toBe(4);
    expect(edited.characters.find((item) => item.id === keeper.id)).toMatchObject({
      name: "老守灯人",
      version: 2,
    });

    await expect(repository.update(created.id, {
      title: "过期写入",
      kind: "roleplay",
      world,
      expectedVersion: 1,
      now: first,
    })).rejects.toMatchObject({ code: "GAME_SESSION_VERSION_CONFLICT" });
    await expect(repository.deleteCharacter(created.id, keeper.id, {
      expectedSessionVersion: 4,
      expectedCharacterVersion: 1,
      now: first,
    })).rejects.toMatchObject({ code: "GAME_CHARACTER_VERSION_CONFLICT" });

    const afterDelete = await repository.deleteCharacter(created.id, keeper.id, {
      expectedSessionVersion: 4,
      expectedCharacterVersion: 2,
      now: new Date("2026-09-30T07:00:00.000Z"),
    });
    expect(afterDelete.version).toBe(5);
    expect(afterDelete.characters.map((item) => item.name)).toEqual(["林舟"]);
  });

  it("cascades character cards when a session is explicitly deleted", async () => {
    const now = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "短篇",
      kind: "interactive-story",
      world,
      initialCharacter: character,
      now,
    });
    await repository.delete(created.id, 1);
    expect(await repository.get(created.id)).toBeNull();
    const result = await pglite.query<{ value: number }>(
      "SELECT count(*)::int AS value FROM game_characters",
    );
    expect(result.rows[0].value).toBe(0);
  });

  it("persists active roleplay turns as a branchable tree and versions status", async () => {
    const now = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "雾港来信",
      kind: "roleplay",
      world,
      initialCharacter: character,
      now,
    });
    const active = await repository.updateStatus(created.id, {
      status: "active",
      expectedVersion: 1,
      now,
    });
    expect(active).toMatchObject({ status: "active", version: 2 });

    const first = await repository.appendTurn(created.id, {
      parentTurnId: null,
      playerContent: "推开酒馆的门。",
      assistantContent: "门铃在雾里轻响。",
      model: "test-model",
      statePatch: {},
      stateSnapshot: state,
      events: [],
      expectedVersion: 2,
      now,
    });
    expect(first.turns).toHaveLength(1);
    expect(first.activeLeafTurnId).toBe(first.turns[0].id);
    expect(first.version).toBe(3);

    const withCheckpoint = await repository.createCheckpoint(created.id, {
      name: "进入酒馆后",
      note: "保留初始线索",
      expectedVersion: 3,
      now,
    });
    expect(withCheckpoint).toMatchObject({ version: 4 });
    expect(withCheckpoint.checkpoints[0]).toMatchObject({
      name: "进入酒馆后",
      turnId: first.turns[0].id,
      stateSnapshot: expect.objectContaining({ scene: "雾港：酒馆" }),
    });
    const checkpointId = withCheckpoint.checkpoints[0].id;

    const branch = await repository.appendTurn(created.id, {
      parentTurnId: first.turns[0].id,
      playerContent: "先询问老板。",
      assistantContent: "老板擦着杯子抬起头。",
      model: "test-model",
      statePatch: {
        adjustInventory: { 旧信: 1 },
        upsertItems: {
          旧信: { name: "旧信", description: "来自雾港的信。", holderCharacterId: null, tags: ["线索"] },
        },
      },
      stateSnapshot: {
        ...state,
        inventory: { 旧信: 1 },
        items: {
          旧信: { name: "旧信", description: "来自雾港的信。", holderCharacterId: null, tags: ["线索"] },
        },
      },
      events: [{
        kind: "dice_roll",
        payload: {
          count: 1,
          sides: 20,
          modifier: 1,
          purpose: "调查检定",
          notation: "1d20+1",
          seed: "repository-test",
          algorithm: "fnv1a-mulberry32-v1",
          results: [12],
          total: 13,
        },
      }],
      expectedVersion: 4,
      now,
    });
    const branchTurn = branch.turns.find((turn) => turn.playerContent === "先询问老板。");
    expect(branchTurn?.parentTurnId).toBe(first.turns[0].id);
    expect(branch.activeLeafTurnId).toBe(branchTurn?.id);
    expect(branchTurn?.stateSnapshot.inventory).toEqual({ 旧信: 1 });
    expect(branch.events).toHaveLength(1);
    expect(branch.events[0]).toMatchObject({
      turnId: branchTurn?.id,
      kind: "dice_roll",
      payload: { seed: "repository-test", total: 13 },
    });

    const restored = await repository.restoreCheckpoint(created.id, checkpointId, {
      expectedVersion: 5,
      now,
    });
    expect(restored).toMatchObject({
      version: 6,
      activeLeafTurnId: first.turns[0].id,
    });
    expect(restored.turns).toHaveLength(2);
    expect(restored.turns.some((turn) => turn.id === branchTurn?.id)).toBe(true);

    const withoutCheckpoint = await repository.deleteCheckpoint(created.id, checkpointId, {
      expectedVersion: 6,
      now,
    });
    expect(withoutCheckpoint.version).toBe(7);
    expect(withoutCheckpoint.checkpoints).toEqual([]);

    const paused = await repository.updateStatus(created.id, {
      status: "paused",
      expectedVersion: 7,
      now,
    });
    expect(paused).toMatchObject({ status: "paused", version: 8 });
    await expect(repository.appendTurn(created.id, {
      parentTurnId: paused.activeLeafTurnId,
      playerContent: "继续。",
      assistantContent: "不应写入。",
      model: "test-model",
      statePatch: {},
      stateSnapshot: state,
      events: [],
      expectedVersion: 8,
      now,
    })).rejects.toMatchObject({ code: "GAME_SESSION_INVALID_STATUS" });
  });
});
