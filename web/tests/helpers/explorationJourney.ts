import { applyExplorationAction, startWorld } from "@/lib/game/exploration/engine";
import type { ExplorationAction } from "@/lib/game/exploration/contracts";

export const PUBLIC_JOURNEY: ExplorationAction[] = [
  { action: "move", targetId: "market" }, { action: "move", targetId: "tower" },
  { action: "investigate", targetId: "beacon" }, { action: "ask", targetId: "keeper", topicId: "repair" },
  { action: "promise", targetId: "keeper" }, { action: "move", targetId: "market" },
  { action: "move", targetId: "archive" }, { action: "investigate", targetId: "chart" },
  { action: "move", targetId: "market" }, { action: "move", targetId: "harbor" },
  { action: "move", targetId: "marsh" }, { action: "investigate", targetId: "wreck" },
  { action: "move", targetId: "shrine" }, { action: "investigate", targetId: "inscription" },
  { action: "move", targetId: "marsh" }, { action: "move", targetId: "harbor" },
  { action: "move", targetId: "market" }, { action: "move", targetId: "tower" },
  { action: "ask", targetId: "keeper", topicId: "oath" }, { action: "help", targetId: "keeper" },
  { action: "negotiate", targetId: "keeper" }, { action: "choose", eventId: "keeper-letter", choiceId: "listen" },
  { action: "choose", eventId: "lantern-accord", choiceId: "prepare" },
];
export function atWorldDecision() {
  return PUBLIC_JOURNEY.reduce((state, action, index) => applyExplorationAction(state, action, `journey-${index}`), startWorld("fog-harbor"));
}
