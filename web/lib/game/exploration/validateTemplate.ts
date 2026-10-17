import { publicWorldCharacterSchema, worldItemInstanceSchema, worldItemSchema, worldKey, worldRanksSchema, ExplorationError } from "./contracts";
import type { WorldEffect, WorldTemplate } from "./catalog";

/** Host templates are code-owned today. Validate every cross-reference before opening a save. */
export function validateWorldTemplate(template: WorldTemplate): void {
  const fail = (message: string): never => { throw new ExplorationError(`世界模板无效：${message}`); };
  const ids = <T extends { id: string }>(items: T[], label: string, limit: number) => {
    if (items.length > limit || new Set(items.map((item) => item.id)).size !== items.length) fail(`${label}超量或 ID 重复`);
    for (const item of items) worldKey.parse(item.id);
    return new Set(items.map((item) => item.id));
  };
  worldKey.parse(template.id); worldRanksSchema.parse(template.ranks);
  if (template.hostContract !== "exploration.v1") fail("宿主契约不兼容");
  if (!/^\d+\.\d+\.\d+$/u.test(template.version)) fail("版本格式无效");
  if (new Set(template.slots).size !== template.slots.length) fail("装备槽重复");
  const locations = ids(template.locations, "地点", 100);
  const items = ids(template.items, "物品定义", 100);
  const instances = ids(template.instances, "物品实例", 150);
  const actors = ids(template.characters.map((item) => item.card), "人物", 49);
  if (actors.has("player") || locations.has("player") || [...actors].some((id) => locations.has(id))) fail("所有者 ID 命名空间冲突");
  const lore = ids(template.lore, "史料", 100);
  const events = ids(template.events, "事件", 50);
  if (!locations.has(template.start)) fail("起始地点不存在");
  const condition = (value?: { learned?: string; item?: string }) => {
    if (value?.learned && !lore.has(value.learned)) fail("条件引用未知史料");
    if (value?.item && !items.has(value.item)) fail("条件引用未知物品");
  };
  const effect = (value: WorldEffect) => {
    for (const id of value.discover ?? []) if (!locations.has(id)) fail("发现未知地点");
    for (const id of value.reveal ?? []) if (!lore.has(id)) fail("揭示未知史料");
    for (const id of value.grant ?? []) if (!instances.has(id)) fail("发放未知物品实例");
    if (value.character && (!actors.has(value.character.id) || (value.character.locationId && !locations.has(value.character.locationId)))) fail("人物变更目标不存在");
    if (value.progress && (!template.ranks.rating.some((rank) => rank.id === value.progress!.rating)
      || !template.ranks.tier.some((rank) => rank.id === value.progress!.tier) || value.progress.level < 1 || value.progress.level > template.ranks.levelsPerTier)) fail("进度档位无效");
  };
  for (const item of template.items) {
    worldItemSchema.parse(item);
    if (!template.ranks.quality.some((rank) => rank.id === item.quality) || !template.ranks.tier.some((rank) => rank.id === item.tier)
      || !template.ranks.rating.some((rank) => rank.id === item.rating) || item.level > template.ranks.levelsPerTier || (item.slot && !template.slots.includes(item.slot))) fail("物品档位或装备槽无效");
  }
  for (const item of template.instances) {
    worldItemInstanceSchema.parse(item);
    const definition = template.items.find((entry) => entry.id === item.definitionId);
    if (!definition || (!definition.stackable && item.quantity !== 1)) fail("实例定义或数量无效");
    if (item.owner !== "player" && item.owner !== "unclaimed" && !actors.has(item.owner) && !locations.has(item.owner)) fail("实例所有者不存在");
    if (definition!.unique && template.instances.filter((entry) => entry.definitionId === item.definitionId).length !== 1) fail("唯一物品出现多份");
  }
  for (const location of template.locations) {
    ids(location.points, "兴趣点", 20);
    for (const exit of location.exits) { if (!locations.has(exit.to)) fail("路径通向未知地点"); condition(exit.requires); }
    for (const point of location.points) { condition(point.requires); effect(point.effect); }
  }
  const allPoints = template.locations.flatMap((location) => location.points);
  ids(allPoints, "兴趣点全局", 100);
  const revealSchema = publicWorldCharacterSchema.pick({ appearance: true, backstory: true, values: true, boundaries: true, abilities: true, unresolved: true, arc: true }).partial();
  for (const person of template.characters) {
    publicWorldCharacterSchema.parse(person.card);
    if (person.revealedCard) revealSchema.parse(person.revealedCard);
    if (!locations.has(person.card.locationId) || person.card.controller === "user") fail("NPC 地点或控制者无效");
    ids(person.topics, "话题", 20);
    for (const topic of person.topics) { condition(topic.requires); if (topic.effect) effect(topic.effect); }
    for (const id of person.knowledge) if (!lore.has(id)) fail("NPC 知识引用不存在");
    if (person.promise) { condition(person.promise.requires); condition(person.promise.completion); effect(person.promise.effect); }
    if (person.help) { condition(person.help.requires); effect(person.help.effect); }
    if (person.negotiate) { condition(person.negotiate.requires); effect(person.negotiate.effect); }
  }
  for (const entry of template.lore) {
    if (!locations.has(entry.locationId) || entry.actorIds.some((id) => !actors.has(id)) || (entry.eventId && !events.has(entry.eventId))) fail("史料关联不存在");
  }
  for (const event of template.events) {
    condition(event.trigger); const stages = ids(event.stages, "事件阶段", 20);
    if (!locations.has(event.locationId) || event.actorIds.some((id) => !actors.has(id)) || !event.stages.length || event.stages[0].terminal) fail("事件起始配置无效");
    for (const stage of event.stages) {
      ids(stage.choices, "事件选项", 10);
      if (stage.terminal && stage.choices.length) fail("结束阶段不能再次结算");
      for (const choice of stage.choices) {
        if (!stages.has(choice.next) || (choice.consume && !items.has(choice.consume))) fail("事件后续阶段或消耗物品不存在");
        if (choice.coinCost !== undefined && (!Number.isInteger(choice.coinCost) || choice.coinCost < 0)) fail("事件费用无效");
        condition(choice.requires); effect(choice.effect);
      }
    }
  }
  ids(template.epics, "史诗", 20);
}
