import { describe, expect, it } from "vitest";
import { applyGameTool, gameToolRequestSchema, gameToolkitSchema } from "@/lib/game/toolkit";
import { applyGameStatePatch, initialGameState } from "@/lib/game/state";
import { createGameTurnSchema } from "@/lib/game/contracts";

describe("R4 game tools", () => {
  const create = { action: "deck-create" as const, deckId: "牌", cards: ["A", "A", "B", "C"] };
  it("keeps physical card identities, draw/hand/discard partition and reproducible shuffle", () => {
    const state = applyGameTool(undefined, create, "seed1");
    expect(applyGameTool(undefined, create, "seed1")).toEqual(state);
    const drawn = applyGameTool(state, { action: "deck-draw", deckId: "牌", count: 2 }, "seed2");
    expect(drawn.decks.牌.drawPile).toHaveLength(2);
    expect(drawn.decks.牌.hand).toHaveLength(2);
    expect(state.decks.牌.hand).toEqual([]);
    const dropped = applyGameTool(drawn, { action: "deck-discard", deckId: "牌", cardIds: [drawn.decks.牌.hand[0]] }, "seed3");
    expect(dropped.decks.牌.discard).toHaveLength(1);
    const reset = applyGameTool(dropped, { action: "deck-reset", deckId: "牌" }, "seed4");
    expect(reset.decks.牌.drawPile).toHaveLength(4);
    expect(reset.decks.牌.hand).toEqual([]);
    expect(reset.decks.牌.discard).toEqual([]);
  });
  it("rejects empty/exhausted/foreign/duplicate/invalid requests without mutating state", () => {
    const state = applyGameTool(undefined, create, "seed");
    expect(() => applyGameTool(state, create, "seed")).toThrow();
    expect(() => applyGameTool(state, { action: "deck-draw", deckId: "牌", count: 5 }, "seed")).toThrow();
    expect(() => applyGameTool(state, { action: "deck-discard", deckId: "牌", cardIds: ["牌:1"] }, "seed")).toThrow();
    expect(() => applyGameTool(undefined, { action: "deck-reset", deckId: "牌" }, "seed")).toThrow();
    expect(gameToolRequestSchema.safeParse({ ...create, deckId: "__proto__" }).success).toBe(false);
    expect(gameToolRequestSchema.safeParse({ ...create, cards: [] }).success).toBe(false);
    expect(gameToolkitSchema.safeParse({ decks: { 牌: { ...state.decks.牌, hand: [state.decks.牌.drawPile[0]] } } }).success).toBe(false);
    expect(state.decks.牌.drawPile).toHaveLength(4);
  });
  it("runs a deterministic bounded random table and preserves host-only state through model patches", () => {
    const request = { action: "random-table" as const, purpose: "事件", entries: ["雨", "晴", "风"] };
    const toolkit = applyGameTool(undefined, request, "seed");
    expect(applyGameTool(undefined, request, "seed")).toEqual(toolkit);
    expect(request.entries).toContain(toolkit.lastResult?.labels[0]);
    const state = { ...initialGameState("世界", "背景"), toolkit };
    expect(applyGameStatePatch(state, { scene: "新场景" }).toolkit).toEqual(toolkit);
    expect(() => applyGameStatePatch(state, { toolkit: {} } as never)).toThrow();
    expect(createGameTurnSchema.safeParse({ content: "工具", parentTurnId: null, expectedVersion: 1, toolRequest: request, toolOnly: true }).success).toBe(false);
  });
});
