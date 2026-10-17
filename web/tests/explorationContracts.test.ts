import { describe, expect, it } from "vitest";
import { explorationActionSchema, worldRanksSchema, worldItemInstanceSchema } from "@/lib/game/exploration/contracts";
import { initialGameState, normalizeGameState, gameStatePatchSchema } from "@/lib/game/state";

describe("R7.1 versioned exploration contracts", () => {
  it("preserves legacy snapshots without silently opting into new rules", () => {
    const old = initialGameState("旧跑团", "仍使用 d20");
    expect(normalizeGameState(old)).toEqual(old);
    expect(old.exploration).toBeUndefined();
    expect(gameStatePatchSchema.safeParse({ exploration: {} }).success).toBe(false);
  });
  it("keeps rating/quality/tier independent and level bounded", () => {
    const ranks = { rating: [{ id: "ordinary", name: "普通", meaning: "危险档位" }],
      quality: [{ id: "fine", name: "精良", meaning: "制作质量" }],
      tier: [{ id: "mortal", name: "凡人", meaning: "大位阶" }], levelsPerTier: 3 };
    expect(worldRanksSchema.parse(ranks)).toEqual(ranks);
    expect(worldRanksSchema.safeParse({ ...ranks, rating: [...ranks.rating, ...ranks.rating] }).success).toBe(false);
    expect(worldRanksSchema.safeParse({ ...ranks, levelsPerTier: 99 }).success).toBe(false);
  });
  it("rejects arbitrary tools, illegal counts and unversioned extension fields", () => {
    expect(explorationActionSchema.safeParse({ action: "move", targetId: "harbor", teleport: true }).success).toBe(false);
    expect(explorationActionSchema.safeParse({ action: "trade", instanceId: "lamp", targetId: "merchant", direction: "buy", quantity: -1 }).success).toBe(false);
    expect(worldItemInstanceSchema.safeParse({ id: "lamp", definitionId: "lamp", owner: "player", quantity: 0, equippedSlot: null, source: "test" }).success).toBe(false);
  });
});
