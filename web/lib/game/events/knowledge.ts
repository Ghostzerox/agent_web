import type { ExplorationAction, ExplorationState } from "../exploration/contracts";
import { appendPerception } from "../exploration/perception";
import type { WorldTemplate } from "../exploration/templateTypes";

/** Explicitly authored messages only, never an event's cause, private notes, full graph or global result. */
export function recordEventKnowledge(before: ExplorationState | undefined, state: ExplorationState, template: WorldTemplate, source: string, action?: ExplorationAction) {
  for (const event of template.events) {
    const current = state.events[event.id]; if (!event.details || !current) continue;
    const entries = !before?.events[event.id] ? [...event.details.onTriggerKnowledge] : [];
    if (action?.action === "choose" && action.eventId === event.id && before?.events[event.id]?.stage !== current.stage) {
      const previous = event.stages.find((stage) => stage.id === before?.events[event.id]?.stage);
      entries.push(...(previous?.choices.find((choice) => choice.id === action.choiceId)?.knowledge ?? []));
    }
    for (const entry of entries) appendPerception(state, { sourceRequestId: source, tick: state.tick, locationId: event.locationId,
      kind: "host_result", speakerId: "host", audience: [...entry.recipients], evidence: entry.evidence, text: `${entry.text}\n获知方式：${entry.reason}`.slice(0, 2000) });
  }
}
