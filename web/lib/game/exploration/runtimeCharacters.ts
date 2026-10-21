import { ExplorationError, type ExplorationState } from "./contracts";
import type { WorldTemplate } from "./templateTypes";

/** Public branch-local encounters, not global preset cards or private author dossiers. */
export function withEncounterCharacters(template: WorldTemplate, state: ExplorationState): WorldTemplate {
  const additions: WorldTemplate["characters"] = [];
  for (const entry of state.encounters ?? []) {
    const person = state.characters[entry.actorId];
    if (!person || person.category === "player" || person.controller !== "ai" || entry.tick > state.tick) throw new ExplorationError("相遇人物来源或角色无效。");
    if (!template.characters.some((existing) => existing.card.id === person.id)) additions.push({ card: person, topics: [], knowledge: [], trader: false });
  }
  return additions.length ? { ...template, characters: [...template.characters, ...additions] } : template;
}
