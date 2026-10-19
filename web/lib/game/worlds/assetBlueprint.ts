import { blankCharacterProfile, type AssetDesignContent, type AssetField } from "./assetContracts";
import type { WorldBlueprint, WorldBrief } from "./contracts";

export const ASSET_FIELD_LABELS: Record<AssetField, string> = { name: "名称", description: "描述", quality: "品质", tier: "等阶", rating: "评级", level: "等级",
  stackable: "允许堆叠", unique: "唯一物品", slot: "装备槽", abilities: "效果与能力", consumable: "可消耗", price: "价格", details: "外观、来源与用途", usesSupernatural: "使用超自然能力", useEffect: "可执行消耗规则",
  category: "人物类别", identity: "身份", locationId: "初始地点", goal: "近期目标", personality: "性格", speech: "表达方式", profile: "经历、动机与认知边界" };
export function blankAssetDesign(kind: "item" | "character", id: string, input: WorldBrief, world: WorldBlueprint): AssetDesignContent {
  return kind === "item" ? { kind, id, name: "待命名道具", description: "待补全的道具描述", quality: world.ranks.quality[0].id,
    tier: world.ranks.tier[0].id, rating: world.ranks.rating[0].id, ...(input.numericPolicy === "light" ? { level: 1 } : {}),
    stackable: false, unique: false, slot: null, abilities: [], consumable: false, price: 0, usesSupernatural: false, useEffect: null,
    details: { category: "tool", appearance: "待设计外观", source: "待设计符合世界的来源", background: "待设计制作与历史背景", faction: "尚无明确所属",
      usage: "叙事用途待设计", restrictions: "不自动完成宿主未支持的动作", cost: "无额外自动扣费", targets: "待设计交互对象", tags: [], attributes: {} } }
    : { kind, id, category: id === "player" ? "player" : "npc", name: id === "player" ? "行旅者" : "待命名人物", identity: "待设计身份",
      locationId: world.region.startId, goal: "了解当前处境", personality: "有自己的生活与判断", speech: "仅依据自己知道的事情回应", profile: blankCharacterProfile() };
}
