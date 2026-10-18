// Client-safe catalog only; hidden world definitions are registered separately on the server.
import { FOG_HARBOR_PRESET } from "./templates/fog-harbor/public";
import type { ExplorationTemplatePresentation } from "./templatePresentation";
import type { ExplorationTemplateReference } from "./templateReference";
import type { CreateGameSessionRequest } from "../contracts";

export const EXPLORATION_TEMPLATES: readonly ExplorationTemplatePresentation[] = [FOG_HARBOR_PRESET];
export const templateKey = (template: ExplorationTemplateReference) => `${template.templateId}@${template.templateVersion}`;
export function findExplorationTemplate(reference: ExplorationTemplateReference) {
  return EXPLORATION_TEMPLATES.find((template) => templateKey(template) === templateKey(reference));
}
export function explorationSessionInput(template: ExplorationTemplatePresentation): CreateGameSessionRequest {
  return { title: template.title, kind: template.kind, world: structuredClone(template.world), initialCharacter: structuredClone(template.initialCharacter) };
}
