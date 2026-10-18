import { ExplorationError } from "./contracts";
import type { WorldTemplate } from "./templateTypes";
import { validateWorldTemplate } from "./validateTemplate";

export type WorldTemplateResolver = (id: string, version?: string) => WorldTemplate;
export function createWorldTemplateRegistry(definitions: readonly WorldTemplate[]) {
  const entries = new Map<string, WorldTemplate>();
  for (const definition of definitions) {
    validateWorldTemplate(definition);
    const key = `${definition.id}@${definition.version}`;
    if (entries.has(key)) throw new ExplorationError(`模板版本重复：${key}`);
    entries.set(key, structuredClone(definition));
  }
  const resolve: WorldTemplateResolver = (id, version) => {
    const candidates = [...entries.values()].filter((entry) => entry.id === id && (!version || entry.version === version));
    candidates.sort((a, b) => {
      const left = a.version.split(".").map(Number), right = b.version.split(".").map(Number);
      return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
    });
    const template = candidates[0];
    if (!template) throw new ExplorationError("世界模板版本不可用；存档已保留，请恢复对应模板版本。");
    return structuredClone(template); // Callers cannot mutate registered definitions.
  };
  return { resolve };
}
