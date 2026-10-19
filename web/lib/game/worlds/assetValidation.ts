import type { WorldBlueprint, WorldBrief } from "./contracts";
import type { AssetDesignContent } from "./assetContracts";

export type AssetRuleContext = Pick<WorldBlueprint, "ranks" | "itemRules"> & {
  region: { startId: string; locations: { id: string }[] }; characters: { id: string }[];
};
export function assetDesignIssues(input: Pick<WorldBrief, "magic" | "numericPolicy">, world: AssetRuleContext, design: AssetDesignContent): string[] {
  const issues: string[] = [];
  if (design.kind === "item") {
    for (const field of ["quality", "rating", "tier"] as const) if (!world.ranks[field].some((rank) => rank.id === design[field])) issues.push(`物品${field}不属于当前世界字典。`);
    if (input.numericPolicy === "light" ? design.level === undefined || design.level > (world.ranks.levelsPerTier ?? 0) : design.level !== undefined) issues.push("物品等级不符合世界数值策略。");
    if (design.slot && !world.itemRules.slots.includes(design.slot)) issues.push("装备槽未在世界声明。");
    if (design.details.category === "equipment" ? !design.slot : Boolean(design.slot)) issues.push("只有装备类别需要且允许装备槽。");
    if (design.consumable !== (design.details.category === "consumable") || Boolean(design.useEffect) !== design.consumable) issues.push("消耗品必须明确使用规则，其他类别不能暗含消耗效果。");
    if (design.unique && design.stackable) issues.push("唯一物品不能同时允许堆叠。");
    if (design.useEffect?.locationId && !world.region.locations.some((place) => place.id === design.useEffect!.locationId)) issues.push("使用前置地点不存在。");
    for (const [id, value] of Object.entries(design.details.attributes)) {
      const rule = world.itemRules.attributes.find((entry) => entry.id === id);
      if (input.numericPolicy === "qualitative" || !rule || value < rule.min || value > rule.max) issues.push(`属性${id}未声明或超出世界范围。`);
    }
    if (input.magic === "forbidden" && design.usesSupernatural) issues.push("硬约束冲突：无超自然世界不能加入超自然道具。");
  } else {
    const people = new Set(["player", ...world.characters.map((person) => person.id), design.id]);
    if ((design.category === "player") !== (design.id === "player")) issues.push("玩家设计固定使用player，NPC与重要角色使用各自ID。");
    if (!world.region.locations.some((place) => place.id === design.locationId)) issues.push("人物地点不存在。");
    if (design.category === "player" && design.locationId !== world.region.startId) issues.push("玩家初始位置必须为世界起点。");
    if (input.magic === "forbidden" && design.profile.usesSupernatural) issues.push("硬约束冲突：无超自然世界不能加入超自然人物能力。");
    if (design.profile.relationships.some((relation) => !people.has(relation.targetId) || relation.targetId === design.id)) issues.push("人物关系引用不存在或指向自己。");
    if (design.profile.secrets.some((secret) => secret.knownBy.some((id) => !people.has(id) || id === "player"))) issues.push("秘密的知情者必须为当前世界的非玩家人物。");
    if (design.category === "important" && (!design.profile.values.length || !design.profile.needs.length)) issues.push("重要角色需要明确价值观与当前需求。");
  }
  return [...new Set(issues)];
}

export function worldAssetIssues(input: WorldBrief, world: WorldBlueprint): string[] {
  const issues = [...world.items.definitions, ...world.characters].flatMap((design) => assetDesignIssues(input, world, design));
  const rules = world.itemRules;
  if (new Set(rules.slots).size !== rules.slots.length || new Set(rules.attributes.map((entry) => entry.id)).size !== rules.attributes.length) issues.push("装备槽或属性ID重复。");
  if (input.numericPolicy === "qualitative" && rules.attributes.length) issues.push("定性世界不能声明数值属性。");
  if (input.numericPolicy === "specified" && !rules.attributes.length) issues.push("指定数值世界必须声明至少一个有界属性。");
  if (new Set(world.items.definitions.map((entry) => entry.id)).size !== world.items.definitions.length) issues.push("道具定义ID重复。");
  if (new Set(world.items.placements.map((entry) => entry.id)).size !== world.items.placements.length) issues.push("初始实例ID重复。");
  const owners = new Set(["player", ...world.characters.map((entry) => entry.id), ...world.region.locations.map((entry) => entry.id)]);
  for (const placement of world.items.placements) {
    const item = world.items.definitions.find((entry) => entry.id === placement.definitionId);
    if (!item || !owners.has(placement.owner)) issues.push(`放置${placement.id}引用的道具或所有者不存在。`);
    else if ((!item.stackable && placement.quantity !== 1) || (item.unique && world.items.placements.filter((entry) => entry.definitionId === item.id).length !== 1)) issues.push(`道具${item.name}的数量或唯一性冲突。`);
  }
  return [...new Set(issues)];
}
