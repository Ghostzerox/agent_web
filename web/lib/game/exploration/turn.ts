import type { CreateGameTurnRequest } from "../contracts";
import type { GameNarrativeGeneratorPort } from "../gameNarrativeGenerator";
import { parseGameModelTurn, GameStateValidationError, type GameState } from "../state";
import type { GameSessionDetail } from "@/lib/repositories/gameSessionRepository";
import { applyExplorationAction } from "./engine";
import { ExplorationError, explorationStateSchema } from "./contracts";
import { sessionExplorationTemplate } from "./templateReference";
import { explorationMessages } from "./prompt";
import { appendPerception, perceptionScope, recordPerceptions } from "./perception";
import { formatSemanticInput } from "./semanticContracts";

export async function resolveExplorationTurn(session: GameSessionDetail, input: CreateGameTurnRequest,
  parent: GameState, fingerprint: string, generator: GameNarrativeGeneratorPort, signal?: AbortSignal) {
  let action = input.explorationAction;
  const dialogues = input.semanticInput?.filter((part) => part.kind === "dialogue") ?? [];
  if (!action && dialogues.length) action = { action: "talk", targetId: dialogues[0].targetId };
  if (action?.action === "start") {
    if (session.turns.some((turn) => !turn.stateSnapshot.exploration)) throw new ExplorationError("旧故事不自动转换规则，请新建一局探索。");
    const selected = sessionExplorationTemplate(session.worldRules);
    if (selected && (action.templateId !== selected.templateId || action.templateVersion !== selected.templateVersion))
      throw new ExplorationError("启动的模板与创建时选择的模板版本不一致。");
  }
  if (!parent.exploration && action?.action !== "start") throw new ExplorationError("请先开启探索世界。");
  const state = action ? applyExplorationAction(parent.exploration, action, input.requestId!) : structuredClone(parent.exploration!);
  if (action?.action === "start") {
    const player = session.characters.find((character) => character.controller === "user");
    if (player) Object.assign(state.characters.player, { name: player.name, identity: player.role,
      backstory: player.description.slice(0, 600), personality: player.personality.slice(0, 600) || "由玩家决定",
      goals: player.goals, boundaries: player.boundaries });
  }
  state.receipt = { requestId: input.requestId!, fingerprint };
  const scope = perceptionScope(session, input.parentTurnId, { requestId: input.requestId!, state });
  recordPerceptions(state, scope, input.requestId!, input.semanticInput, action);
  const targetId = dialogues[0]?.targetId;
  const shouldGenerate = Boolean(input.narrate || (input.semanticInput &&
    input.semanticInput.some((part) => !["private_thought", "ooc_instruction"].includes(part.kind))));
  let assistantContent = action ? state.lastResult : "已保存私人想法 / 场外创作意图；未向人物发言、未改变世界。创作发布将在后续工作台提供。";
  let model = "host-exploration/v1";
  if (shouldGenerate) {
    const content = input.semanticInput ? formatSemanticInput(input.semanticInput) : input.content;
    const generated = await generator.generate(explorationMessages(state, content, targetId, [], session.safetyBoundaries, scope), signal);
    const output = parseGameModelTurn(generated.content);
    if (Object.keys(output.statePatch).length) throw new GameStateValidationError("GAME_OUTPUT_INVALID", "AI不能改写探索动作的确定性结算；本回合未保存。");
    assistantContent = `${action ? `${state.lastResult}\n\n---\n\n` : "主持建议（不替人物发言，不自动成为世界事实）\n\n"}${output.narrative}`;
    if (targetId) {
      const present = Object.values(state.characters).filter((person) => person.locationId === state.locationId && person.controller !== "user").map((person) => person.id);
      appendPerception(state, { sourceRequestId: input.requestId!, tick: state.tick, locationId: state.locationId,
        kind: "reply", speakerId: targetId, audience: ["player", ...(dialogues.some((part) => part.channel === "public") ? present : [targetId])],
        evidence: "statement", text: output.narrative.slice(0, 2000) });
    }
    model = generated.model;
  }
  return { state: { ...parent, exploration: explorationStateSchema.parse(state),
    scene: state.view.locations.find((place) => place.id === state.locationId)!.name }, assistantContent, model,
    playerContent: input.semanticInput ? formatSemanticInput(input.semanticInput) : input.content };
}
