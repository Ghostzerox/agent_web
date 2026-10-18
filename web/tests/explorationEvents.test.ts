import { describe, expect, it } from "vitest";
import { applyExplorationAction as act, startWorld } from "@/lib/game/exploration/engine";
import { atWorldDecision } from "./helpers/explorationJourney";

describe("R7.5 events and provenance", () => {
  it("runs local/character/world events and settles costs and rewards exactly once", () => {
    const before = atWorldDecision();
    expect(before.events["keeper-letter"].settled).toBe(true);
    expect(before.events["turning-tide"].stage).toBe("rising");
    const state = act(before, { action: "choose", eventId: "lantern-accord", choiceId: "public" }, "final-choice");
    expect(state.coins).toBe(before.coins + 2);
    expect(state.instances.some((item) => item.definitionId === "lens")).toBe(false);
    expect(state.events["lantern-accord"]).toEqual({ stage: "public", settled: true });
    expect(() => act(state, { action: "choose", eventId: "lantern-accord", choiceId: "public" }, "replay")).toThrow("已经结束");
    const entry = state.history.find((item) => item.source === "final-choice")!;
    expect(entry).toMatchObject({ kind: "fact", origin: "play", eventId: "lantern-accord", actorIds: ["keeper", "merchant"] });
    expect(state.characters.keeper.locationId).toBe("harbor");
    expect(state.history.find((item) => item.id === "keeper-family")?.origin).toBe("setting");
  });
  it("does not spend items on invalid stages, conditions or unavailable choices", () => {
    const state = startWorld("fog-harbor", "1.0.0");
    expect(() => act(state, { action: "choose", eventId: "lantern-accord", choiceId: "public" }, "x")).toThrow("尚未触发");
    const decision = atWorldDecision(); decision.coins = 0;
    expect(() => act(decision, { action: "choose", eventId: "lantern-accord", choiceId: "public" }, "y")).toThrow("不足");
    expect(decision.instances.some((item) => item.definitionId === "lens")).toBe(true);
    expect(decision.events["lantern-accord"].settled).toBe(false);
  });
  it("distinguishes rumors, legends, opinions and facts with original sources", () => {
    let state = act(startWorld("fog-harbor", "1.0.0"), { action: "move", targetId: "market" }, "a");
    state = act(state, { action: "investigate", targetId: "well" }, "b");
    state = act(state, { action: "ask", targetId: "merchant", topicId: "old-light" }, "c");
    expect(state.history.find((item) => item.id === "well-legend")?.kind).toBe("legend");
    expect(state.history.find((item) => item.id === "lens-rumor")?.kind).toBe("rumor");
    for (let index = 0; index < 5; index++) state = act(state, { action: "wait" }, `wait-${index}`);
    state = act(state, { action: "move", targetId: "harbor" }, "d");
    state = act(state, { action: "choose", eventId: "turning-tide", choiceId: "observe" }, "e");
    expect(state.history.find((item) => item.id === "harbor-opinion")?.kind).toBe("opinion");
    expect(state.history.every((item) => item.source.length > 0)).toBe(true);
  });
});
