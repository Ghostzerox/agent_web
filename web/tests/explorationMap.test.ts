import { describe, expect, it } from "vitest";
import { applyExplorationAction as act, startWorld } from "@/lib/game/exploration/engine";
import { applyGameStatePatch, initialGameState } from "@/lib/game/state";

describe("R7.2 exploration map", () => {
  it("discovers adjacent nodes without leaking hidden locations or lore", () => {
    const state = startWorld("fog-harbor", "1.0.0");
    expect(state.discovered).toEqual(["harbor", "market", "marsh"]);
    expect(JSON.stringify(state)).not.toContain("守望者盟约");
    expect(JSON.stringify(state)).not.toContain("潮石祭坛");
    expect(state.view.locations.find((item) => item.id === "market")?.description).toBe("尚未到访。");
    expect(() => act(state, { action: "move", targetId: "tower" }, "r1")).toThrow("相邻");
  });
  it("validates paths and reveals destinations through investigation", () => {
    let state = act(startWorld("fog-harbor", "1.0.0"), { action: "move", targetId: "marsh" }, "r1");
    expect(() => act(state, { action: "move", targetId: "shrine" }, "r2")).toThrow("海图");
    state = act(state, { action: "move", targetId: "harbor" }, "r3");
    state = act(state, { action: "move", targetId: "market" }, "r4");
    state = act(state, { action: "move", targetId: "archive" }, "r5");
    state = act(state, { action: "investigate", targetId: "chart" }, "r6");
    expect(state.discovered).toContain("shrine");
    expect(state.learned).toContain("light-record");
    expect(() => act(state, { action: "investigate", targetId: "chart" }, "r7")).toThrow("重复");
  });
  it("keeps sibling state and old snapshot extensions intact", () => {
    const root = startWorld("fog-harbor", "1.0.0");
    const left = act(root, { action: "move", targetId: "market" }, "left");
    const right = act(root, { action: "move", targetId: "marsh" }, "right");
    expect(left.visited).not.toContain("marsh");
    expect(right.visited).not.toContain("market");
    expect(root.visited).toEqual(["harbor"]);
    expect(applyGameStatePatch({ ...initialGameState("a", "b"), exploration: left }, {}).exploration).toEqual(left);
  });
});
