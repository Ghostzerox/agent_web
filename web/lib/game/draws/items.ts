import { assetDesignIssues } from "../worlds/assetValidation";
import { itemDesignSchema, type ItemDesign } from "../worlds/assetContracts";
import { projectWorld } from "../exploration/engine";
import type { ExplorationState } from "../exploration/contracts";
import type { WorldTemplate } from "../exploration/templateTypes";
import { DrawError, type DrawData } from "./contracts";

export const generatedDrawItemId = (id: string) => `loot-${id.replaceAll("-", "").slice(0, 18)}`;
export function blankDrawItem(id: string, data: DrawData, template: WorldTemplate): ItemDesign {
  const entry = data.sample.entry; if (entry.source !== "generated") throw new DrawError("DRAW_INVALID", "固定池不生成新定义。");
  return itemDesignSchema.parse({ kind: "item", id: generatedDrawItemId(id), name: "待设计的获取物品", description: "待补全的物品描述",
    quality: entry.quality, tier: entry.tier, rating: entry.rating, ...(entry.level !== undefined ? { level: entry.level } : {}),
    stackable: entry.category === "material" && !entry.unique, unique: entry.unique, slot: entry.category === "equipment" ? template.slots[0] ?? null : null,
    abilities: [], consumable: entry.category === "consumable", price: 0, usesSupernatural: false,
    useEffect: entry.category === "consumable" ? { locationId: null, requiresCondition: null, addCondition: null, removeCondition: null } : null,
    details: { category: entry.category, appearance: "待描述的外观", source: "待核对的当地来源", background: "待核对的历史工艺",
      faction: "尚无明确势力归属", usage: "待描述使用方式", restrictions: "待描述限制", cost: "待描述使用代价", targets: "待描述交互对象", tags: [], attributes: {} } });
}
export function validateDrawItem(id: string, data: DrawData, raw: unknown, template: WorldTemplate): ItemDesign {
  const item = itemDesignSchema.parse(raw); const entry = data.sample.entry;
  if (entry.source !== "generated" || !template.acquisitionRules || !template.numericPolicy) throw new DrawError("DRAW_INVALID", "当前修订不支持生成物品，请在工作台配置卡池并发布新局。");
  if (item.id !== generatedDrawItemId(id) || item.quality !== entry.quality || item.tier !== entry.tier || item.rating !== entry.rating || item.level !== entry.level
    || item.unique !== entry.unique || item.stackable !== (entry.category === "material" && !entry.unique) || item.details.category !== entry.category)
    throw new DrawError("DRAW_INVALID", "不能修改已抽定的ID、品质、等阶、评级、等级、类别、唯一性或堆叠规则。");
  const issues = assetDesignIssues({ magic: template.acquisitionRules.magic, numericPolicy: template.numericPolicy }, {
    ranks: template.ranks, itemRules: { slots: template.slots, attributes: template.attributeRules ?? [] },
    region: { startId: template.start, locations: template.locations }, characters: template.characters.map((person) => ({ id: person.card.id })),
  }, item);
  if (issues.length) throw new DrawError("DRAW_INVALID", issues.join("；"));
  return item;
}

/** Same inventory and projection as movement/equipment/trade. No NPC perception or hidden keyword is appended. */
export function settleDrawInventory(raw: ExplorationState, data: DrawData, requestId: string, sourceTurnId: string, template: WorldTemplate): ExplorationState {
  const state = structuredClone(raw); const acquisitions = state.acquisitions ??= { items: [], receipts: [] };
  if (acquisitions.receipts.some((receipt) => receipt.requestId === requestId)) throw new DrawError("DRAW_CONFLICT", "此请求已在当前分支入库。");
  if (acquisitions.receipts.length >= 200 || state.coins < data.pool.coinCost) throw new DrawError("DRAW_INVALID", "获取记录已满或虚构资源不足，未发放 / 扣除。");
  const entry = data.sample.entry;
  let definition;
  if (entry.source === "generated") {
    const item = validateDrawItem(requestId, data, data.item, template);
    if (acquisitions.items.length >= 50 || template.items.some((other) => other.id === item.id) || acquisitions.items.some((other) => other.definition.id === item.id)) throw new DrawError("DRAW_INVALID", "本分支生成目录已满或ID冲突。");
    const { kind: _kind, usesSupernatural: _magic, useEffect, ...publicItem } = item; void _kind; void _magic;
    definition = publicItem; acquisitions.items.push({ definition, useEffect });
  } else definition = template.items.find((item) => item.id === entry.definitionId);
  if (!definition) throw new DrawError("DRAW_INVALID", "获取定义不存在。");
  const quantity = data.sample.quantity;
  if (definition.unique && (state.instances.some((item) => item.definitionId === definition.id) || template.instances.some((item) => item.definitionId === definition.id)
    || acquisitions.receipts.some((receipt) => receipt.definitionId === definition.id))) throw new DrawError("DRAW_INVALID", "唯一物品已存在，不会生成副本。");
  const stack = definition.stackable && !definition.unique ? state.instances.find((item) => item.owner === "player" && item.definitionId === definition.id && !item.equippedSlot && item.quantity + quantity <= 999) : undefined;
  const source = `draw:${requestId}:${sourceTurnId}:${data.pool.id}/${entry.id}`;
  if (stack) { stack.quantity += quantity; stack.source = source; }
  else state.instances.push({ id: `draw-${requestId}`, definitionId: definition.id, owner: "player", quantity, equippedSlot: null, source });
  state.coins -= data.pool.coinCost;
  acquisitions.receipts.push({ requestId, poolId: data.pool.id, entryId: entry.id, definitionId: definition.id, quantity, sourceTurnId });
  state.lastResult = `获得${definition.name.slice(0, 120)} × ${quantity}；消耗${data.pool.coinCost}枚虚构钱币。${data.pool.explanation.slice(0, 200)}`;
  return projectWorld(state, template);
}
