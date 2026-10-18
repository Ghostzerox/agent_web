import { describe, expect, it } from "vitest";
import { applyExplorationAction as act, startWorld } from "@/lib/game/exploration/engine";
import { explorationMessages, EXPLORATION_CONTEXT_BUDGET } from "@/lib/game/exploration/prompt";

function atTower() {
  let state = act(startWorld("fog-harbor", "1.0.0"), { action: "move", targetId: "market" }, "a");
  state = act(state, { action: "move", targetId: "tower" }, "b"); return state;
}
describe("R7.4 characters, agency and knowledge", () => {
  it("allows refusal and distinguishes importance from controller", () => {
    let state = atTower();
    expect(state.characters.keeper.category).toBe("npc");
    state = act(state, { action: "help", targetId: "keeper" }, "c");
    expect(state.lastResult).toContain("暂不接受"); expect(state.characters.keeper.relationship).toBe("neutral");
    expect(() => act(state, { action: "ask", targetId: "keeper", topicId: "oath" }, "d")).toThrow("尚未解锁");
    state = act(state, { action: "ask", targetId: "keeper", topicId: "repair" }, "e");
    state = act(state, { action: "promise", targetId: "keeper" }, "f");
    expect(() => act(state, { action: "promise", targetId: "keeper" }, "g")).toThrow("已记录");
    expect(state.characters.keeper.promises).toHaveLength(1);
    state = act(state, { action: "move", targetId: "market" }, "h");
    state = act(state, { action: "move", targetId: "harbor" }, "i");
    state = act(state, { action: "move", targetId: "marsh" }, "j");
    state = act(state, { action: "investigate", targetId: "wreck" }, "k");
    state = act(state, { action: "move", targetId: "harbor" }, "l");
    state = act(state, { action: "move", targetId: "market" }, "m");
    state = act(state, { action: "move", targetId: "tower" }, "n");
    state = act(state, { action: "help", targetId: "keeper" }, "o");
    expect(state.characters.keeper.id).toBe("keeper"); expect(state.characters.keeper.category).toBe("important");
    expect(state.characters.keeper.controller).toBe("ai"); expect(state.characters.keeper.relationship).toBe("trusted");
    expect(state.characters.keeper.backstory).toContain("母亲"); expect(state.flags["promise-kept"]).toBe(true);
  });
  it("does not pass player-only secrets or unrelated characters to NPC dialogue", () => {
    const state = atTower();
    state.history.push({ id: "private", tick: 1, text: "玩家私下调查的密码XYZ", kind: "fact", origin: "play", source: "private", locationId: "archive", actorIds: [], eventId: null });
    state.characters.merchant.knownInformation = ["商人私下获悉的信息ABC"];
    const text = JSON.stringify(explorationMessages(state, "你好", "keeper"));
    expect(text).not.toContain("密码XYZ"); expect(text).not.toContain("信息ABC");
    expect(text).not.toContain("守望者盟约："); expect(text).toContain("林汐"); expect(text).toContain('statePatch');
    expect(explorationMessages(state, "你好")[1].content.length).toBeLessThanOrEqual(EXPLORATION_CONTEXT_BUDGET + 100);
  });
  it("keeps important character and promises branch-local", () => {
    const root = atTower();
    const left = act(act(root, { action: "ask", targetId: "keeper", topicId: "repair" }, "a"), { action: "promise", targetId: "keeper" }, "b");
    const right = act(root, { action: "talk", targetId: "keeper" }, "c");
    expect(left.characters.keeper.promises).toHaveLength(1); expect(right.characters.keeper.promises).toHaveLength(0);
    expect(root.characters.keeper.memories).toEqual([]);
  });
});
