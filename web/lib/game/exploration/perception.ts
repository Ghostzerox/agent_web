import type { GameSessionDetail } from "@/lib/repositories/gameSessionRepository";
import { gameTurnPath } from "../turnTree";
import { getWorldTemplate } from "./catalog";
import { ExplorationError, type ExplorationAction, type ExplorationState } from "./contracts";
import type { PerceptionRecord, SemanticInput } from "./semanticContracts";

export type PerceptionScope = {
  sessionId: string;
  sources: ReadonlyMap<string, { worldId: string; worldVersion: string; tick: number }>;
  currentRequestId?: string;
};

export function perceptionScope(session: GameSessionDetail, parentTurnId: string | null,
  current?: { requestId: string; state: ExplorationState }): PerceptionScope {
  const sources = new Map<string, { worldId: string; worldVersion: string; tick: number }>();
  for (const turn of gameTurnPath(session.turns, parentTurnId)) {
    const state = turn.stateSnapshot.exploration;
    if (turn.sessionId === session.id && state?.receipt) sources.set(state.receipt.requestId,
      { worldId: state.templateId, worldVersion: state.templateVersion, tick: state.tick });
  }
  if (current) sources.set(current.requestId, { worldId: current.state.templateId,
    worldVersion: current.state.templateVersion, tick: current.state.tick });
  return { sessionId: session.id, sources, ...(current ? { currentRequestId: current.requestId } : {}) };
}

export function visiblePerceptions(state: ExplorationState, scope: PerceptionScope, actorId: string): PerceptionRecord[] {
  const log = state.cognition;
  if (!log || log.sessionId !== scope.sessionId || log.worldId !== state.templateId || log.worldVersion !== state.templateVersion) return [];
  return log.records.filter((record) => {
    const source = scope.sources.get(record.sourceRequestId);
    return record.audience.includes(actorId) && source?.worldId === state.templateId && source.worldVersion === state.templateVersion
      && record.tick === source.tick && record.tick <= state.tick
      && !["private_thought", "ooc_instruction", "world_narration", "action"].includes(record.kind);
  });
}

export function actorContext(state: ExplorationState, targetId: string, scope: PerceptionScope) {
  const actor = state.characters[targetId];
  if (!actor || actor.locationId !== state.locationId || actor.controller === "user")
    throw new ExplorationError("人物不存在、不在场或不由AI控制；不能回退到主持上下文。");
  const template = getWorldTemplate(state.templateId, state.templateVersion);
  const definition = template.characters.find((person) => person.card.id === targetId);
  if (!definition) throw new ExplorationError("人物定义不存在。");
  const location = template.locations.find((place) => place.id === state.locationId)!;
  // Never read arbitrary legacy knownInformation/memories, global lastResult or raw history.
  const knowledge = template.lore.filter((entry) => definition.knowledge.includes(entry.id))
    .map((entry) => ({ text: entry.text, evidence: entry.kind, source: `${template.id}@${template.version}:${entry.id}`, method: "initial-knowledge" }));
  return {
    purpose: "actor" as const, actorId: targetId,
    location: { name: location.name, description: location.description },
    character: { name: actor.name, identity: actor.identity, personality: actor.personality, speech: actor.speech,
      goals: actor.goals, values: actor.values, abilities: actor.abilities, boundaries: actor.boundaries,
      relationship: actor.relationship, backstory: actor.backstory },
    knowledge, observations: visiblePerceptions(state, scope, targetId).slice(-20),
  };
}

export function recordPerceptions(state: ExplorationState, scope: PerceptionScope, requestId: string,
  input: SemanticInput | undefined, action?: ExplorationAction) {
  const previous = state.cognition;
  const records = previous && previous.sessionId === scope.sessionId && previous.worldId === state.templateId
    && previous.worldVersion === state.templateVersion ? previous.records.filter((entry) => {
      const source = scope.sources.get(entry.sourceRequestId);
      return source?.worldId === state.templateId && source.worldVersion === state.templateVersion
        && source.tick === entry.tick && entry.tick <= state.tick;
    }) : [];
  state.cognition = { sessionId: scope.sessionId, worldId: state.templateId, worldVersion: state.templateVersion,
    records, ...(input ? { lastInput: input } : {}) };
  const present = Object.values(state.characters).filter((actor) => actor.locationId === state.locationId && actor.controller !== "user").map((actor) => actor.id);
  for (const part of input ?? []) {
    if (part.kind === "dialogue" && !present.includes(part.targetId)) throw new ExplorationError("只能向当前地点的非玩家人物发言。");
    const audience = part.kind === "dialogue" ? ["player", ...(part.channel === "public" ? present : [part.targetId])] : ["player"];
    appendPerception(state, { sourceRequestId: requestId, tick: state.tick, locationId: state.locationId,
      kind: part.kind, speakerId: "player", audience, evidence: "statement", text: part.text });
  }
  // Only the participant of a validated interaction perceives its result. Not global narration.
  if (action && "targetId" in action && ["talk", "ask", "promise", "help", "negotiate", "give", "trade"].includes(action.action)
    && present.includes(action.targetId)) {
    appendPerception(state, { sourceRequestId: requestId, tick: state.tick, locationId: state.locationId,
      kind: "host_result", speakerId: "host", audience: ["player", action.targetId], evidence: "statement", text: state.lastResult });
    if (action.action === "ask") {
      const template = getWorldTemplate(state.templateId, state.templateVersion);
      const topic = template.characters.find((person) => person.card.id === action.targetId)?.topics.find((entry) => entry.id === action.topicId);
      for (const id of topic?.effect?.reveal ?? []) {
        const lore = template.lore.find((entry) => entry.id === id);
        if (lore) appendPerception(state, { sourceRequestId: requestId, tick: state.tick, locationId: state.locationId,
          kind: "host_result", speakerId: action.targetId, audience: ["player", action.targetId], evidence: lore.kind, text: lore.text });
      }
    }
  }
}

export function appendPerception(state: ExplorationState, record: PerceptionRecord) {
  if (!state.cognition) throw new ExplorationError("尚未建立本局的感知记录。");
  state.cognition.records = [...state.cognition.records, record].slice(-200);
}
