import { ExplorationError, type ExplorationState, type WorldItem } from "./contracts";
import type { WorldTemplate } from "./templateTypes";

/** One reward/stacking implementation for item draws and structured event effects. */
export function grantInventoryItem(state: ExplorationState, template: WorldTemplate, definition: WorldItem, quantity: number, id: string, source: string) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 || (!definition.stackable || definition.unique) && quantity !== 1) throw new ExplorationError("奖励数量与堆叠规则冲突。");
  if (definition.unique && (template.instances.some((item) => item.definitionId === definition.id) || state.instances.some((item) => item.definitionId === definition.id)
    || state.issuedUniqueItems?.includes(definition.id) || state.acquisitions?.receipts.some((receipt) => receipt.definitionId === definition.id))) throw new ExplorationError("唯一物品已存在或已发放，不重复奖励。");
  const stack = definition.stackable && !definition.unique ? state.instances.find((item) => item.owner === "player" && item.definitionId === definition.id && !item.equippedSlot && item.quantity + quantity <= 999) : undefined;
  if (stack) { stack.quantity += quantity; stack.source = source; }
  else { if (state.instances.length >= 150 || state.instances.some((item) => item.id === id)) throw new ExplorationError("背包容量已满或奖励实例ID重复。");
    state.instances.push({ id, definitionId: definition.id, owner: "player", quantity, equippedSlot: null, source }); }
  if (definition.unique) (state.issuedUniqueItems ??= []).push(definition.id);
}
