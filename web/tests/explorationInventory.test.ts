import { describe, expect, it } from "vitest";
import { applyExplorationAction as act, startWorld, projectWorld, validateWorldInventory } from "@/lib/game/exploration/engine";
import { fogHarbor } from "@/lib/game/exploration/catalog";

describe("R7.3 inventory and ownership", () => {
  it("equips only valid owned items and consumes without resurrection", () => {
    let state = act(startWorld("fog-harbor"), { action: "equip", instanceId: "traveler-lantern" }, "r1");
    expect(() => act(state, { action: "equip", instanceId: "traveler-lantern" }, "r2")).toThrow("占用");
    expect(() => act(state, { action: "use", instanceId: "traveler-lantern" }, "r2")).toThrow("消耗品");
    state = act(state, { action: "use", instanceId: "traveler-tea" }, "r3");
    state = act(state, { action: "use", instanceId: "traveler-tea" }, "r4");
    expect(projectWorld(state).instances.some((item) => item.id === "traveler-tea")).toBe(false);
    expect(() => act(state, { action: "use", instanceId: "traveler-tea" }, "r5")).toThrow("没有");
  });
  it("transfers quantities and money once, rejects unaffordable or foreign transactions", () => {
    let state = act(startWorld("fog-harbor"), { action: "move", targetId: "market" }, "r1");
    const totalCoins = state.coins + state.wallets.merchant;
    state = act(state, { action: "trade", targetId: "merchant", instanceId: "merchant-tea", direction: "buy", quantity: 3 }, "r2");
    expect(state.coins).toBe(6); expect(state.coins + state.wallets.merchant).toBe(totalCoins);
    expect(state.instances.filter((item) => item.definitionId === "tea").reduce((sum, item) => sum + item.quantity, 0)).toBe(7);
    expect(() => act(state, { action: "trade", targetId: "merchant", instanceId: "merchant-compass", direction: "buy", quantity: 1 }, "r3")).toThrow("不足");
    expect(() => act(state, { action: "equip", instanceId: "merchant-compass" }, "r4")).toThrow("自己");
    state = act(state, { action: "give", targetId: "merchant", instanceId: "traveler-tea", quantity: 1 }, "r5");
    expect(state.instances.find((item) => item.id === "traveler-tea")?.quantity).toBe(1);
  });
  it("grants unique quest items once and rejects forged duplicate instances", () => {
    let state = act(startWorld("fog-harbor"), { action: "move", targetId: "marsh" }, "r1");
    state = act(state, { action: "investigate", targetId: "wreck" }, "r2");
    expect(state.instances.filter((item) => item.definitionId === "lens")).toHaveLength(1);
    expect(() => act(state, { action: "investigate", targetId: "wreck" }, "r3")).toThrow("重复");
    state.instances.push({ ...state.instances.find((item) => item.definitionId === "lens")!, id: "fake-lens" });
    expect(() => validateWorldInventory(state, fogHarbor)).toThrow("唯一");
  });
});
