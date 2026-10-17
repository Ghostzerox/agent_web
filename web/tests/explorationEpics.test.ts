import { describe, expect, it } from "vitest";
import { applyExplorationAction as act, startWorld } from "@/lib/game/exploration/engine";
import { searchWorldHistory } from "@/lib/game/exploration/history";
import { atWorldDecision } from "./helpers/explorationJourney";

describe("R7.6 epics and bounded history retrieval", () => {
  it("supports distinct endings and non-participation instead of forcing one outcome", () => {
    expect(startWorld("fog-harbor").view.epics).toEqual([]);
    const root = atWorldDecision();
    const publicEnd = act(root, { action: "choose", eventId: "lantern-accord", choiceId: "public" }, "p");
    const guildEnd = act(root, { action: "choose", eventId: "lantern-accord", choiceId: "guild" }, "g");
    const leaveEnd = act(root, { action: "choose", eventId: "lantern-accord", choiceId: "leave" }, "l");
    expect(publicEnd.view.epics[0].ending).toBe("开放的灯火");
    expect(guildEnd.view.epics[0].ending).toBe("有价的航道");
    expect(leaveEnd.view.epics[0].ending).toBe("未承担的守望");
    expect(publicEnd.progress.tier).toBe("keeper"); expect(guildEnd.progress.tier).toBe("mortal");
    expect(guildEnd.characters.keeper.relationship).toBe("wary");
    expect(leaveEnd.instances.some((item) => item.definitionId === "lens")).toBe(true);
    expect(root.view.epics[0].ending).toBeNull();
  });
  it("retrieves older branch history after working chronology is compacted, with provenance and limits", () => {
    const state = atWorldDecision();
    const early = structuredClone(state);
    for (let index = 0; index < 210; index++) {
      state.history.push({ id: `extra-${index}`, tick: index + 40, text: `合成历史 ${index}`, kind: "fact", origin: "play", source: `receipt-${index}`, actorIds: ["keeper"], eventId: null, locationId: "tower" });
    }
    state.history = state.history.slice(-200);
    const path = [{ id: "early-turn", stateSnapshot: { exploration: early } }, { id: "late-turn", stateSnapshot: { exploration: state } }];
    const old = searchWorldHistory(path, { parentTurnId: null, q: "盟约" });
    expect(old.entries.some((entry) => entry.sourceTurnId === "early-turn")).toBe(true);
    const latest = searchWorldHistory(path, { parentTurnId: null, actorId: "keeper", kind: "fact", limit: 20 });
    expect(latest.entries.length).toBeLessThanOrEqual(20); expect(latest.omitted).toBeGreaterThan(0);
    expect(JSON.stringify(latest.entries).length).toBeLessThan(6100);
    expect(searchWorldHistory([], { parentTurnId: null, q: "盟约" }).entries).toEqual([]);
  });
});
