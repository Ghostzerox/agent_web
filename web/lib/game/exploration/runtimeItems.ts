import { ExplorationError, type ExplorationState } from "./contracts";
import type { WorldTemplate } from "./templateTypes";

/** Branch-local, already confirmed public definitions. Never mutates a published template. */
export function withAcquiredItems(template: WorldTemplate, state: ExplorationState): WorldTemplate {
  const entries = state.acquisitions?.items ?? []; if (!entries.length) return template;
  if (entries.some((entry) => template.items.some((item) => item.id === entry.definition.id))) throw new ExplorationError("获取目录与世界定义ID冲突。");
  return { ...template, items: [...template.items, ...entries.map((entry) => entry.definition)],
    consumableEffects: { ...template.consumableEffects, ...Object.fromEntries(entries.filter((entry) => entry.useEffect).map((entry) => [entry.definition.id,
      { ...(entry.useEffect!.addCondition ? { condition: entry.useEffect!.addCondition } : {}), ...(entry.useEffect!.removeCondition ? { removeCondition: entry.useEffect!.removeCondition } : {}) }])) },
    itemUseRequirements: { ...template.itemUseRequirements, ...Object.fromEntries(entries.filter((entry) => entry.useEffect).map((entry) => [entry.definition.id,
      { locationId: entry.useEffect!.locationId, condition: entry.useEffect!.requiresCondition }])) } };
}
