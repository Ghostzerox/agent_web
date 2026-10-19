import type { WorldTemplate } from "../exploration/templateTypes";
import { eventDefinitionSchema, type EventDefinition } from "./contracts";

type EventWorld = Pick<WorldTemplate, "items" | "acquisitionRules"> & { instances: { definitionId: string }[]; locations: { id: string }[]; characters: { card: { id: string } }[]; lore: { id: string }[] };
export function eventDesignIssues(raw: unknown, world: EventWorld): string[] {
  const parsed = eventDefinitionSchema.safeParse(raw); if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
  const event = parsed.data; const issues: string[] = []; const actors = new Set(["player", ...world.characters.map((person) => person.card.id)]);
  const locations = new Set(world.locations.map((place) => place.id)); const stages = new Map(event.stages.map((stage) => [stage.id, stage]));
  if (stages.size !== event.stages.length || event.stages[0].terminal) issues.push("事件阶段ID重复或起始阶段已经结束。");
  if (!locations.has(event.locationId) || event.actorIds.some((id) => !actors.has(id))) issues.push("事件地点或参与者不存在。");
  if (event.scope === "character" && (!event.actorIds.length || event.actorIds[0] === "player")) issues.push("人物事件需要首位参与者为可跟随的NPC。");
  if (event.details.usesSupernatural && world.acquisitionRules?.magic !== "allowed") issues.push("无超自然政策或未声明政策的世界不能新增超自然事件。");
  if (event.details.visibility === "participants" && !event.actorIds.includes("player")) issues.push("仅参与者可见的可玩事件必须明确包含player。");
  if (event.details.category === "epic" && Object.keys(event.trigger).length === 0) issues.push("史诗事件必须有明确门槛，不能无条件触发。");
  const condition = (value: EventDefinition["trigger"]) => {
    if (value.item && !world.items.some((item) => item.id === value.item) || value.learned && !world.lore.some((entry) => entry.id === value.learned)
      || value.relationship && (!actors.has(value.relationship.actorId) || value.relationship.actorId === "player")) issues.push("事件前置引用不存在。");
  };
  const knowledge = (entries: typeof event.details.onTriggerKnowledge) => { for (const entry of entries) if (entry.recipients.some((id) => !actors.has(id))) issues.push("知情范围引用不存在的人物。"); };
  condition(event.trigger); knowledge(event.details.onTriggerKnowledge);
  for (const stage of event.stages) {
    if (new Set(stage.choices.map((choice) => choice.id)).size !== stage.choices.length || stage.terminal && stage.choices.length || !stage.terminal && stage.choices.length < 2) issues.push("阶段选项重复、结束阶段仍有选项或没有可选行动。");
    if (!stage.terminal && !stage.choices.some((choice) => choice.refusal && !Object.keys(choice.requires ?? {}).length && !(choice.coinCost ?? 0) && !choice.consume && !Object.keys(choice.effect).length)) issues.push("每个未结束阶段必须有不收费、不强制后果的拒绝 / 替代选项。");
    for (const choice of stage.choices) {
      if (!stages.has(choice.next)) issues.push("选项后续阶段不存在。");
      condition(choice.requires ?? {}); knowledge(choice.knowledge);
      if (choice.consume && !world.items.some((item) => item.id === choice.consume)) issues.push("选项消耗的物品不存在。");
      for (const id of choice.effect.discover ?? []) if (!locations.has(id)) issues.push("后果发现的地点不存在。");
      for (const id of choice.effect.reveal ?? []) if (!world.lore.some((entry) => entry.id === id)) issues.push("后果揭示的史料不存在。");
      const change = choice.effect.character;
      if (change && (!world.characters.some((person) => person.card.id === change.id) || change.locationId && !locations.has(change.locationId))) issues.push("后果变更的人物或地点不存在。");
      const rewards = choice.effect.rewards ?? [];
      if (new Set(rewards.map((reward) => reward.definitionId)).size !== rewards.length) issues.push("同一选项的奖励定义不得重复。");
      for (const reward of rewards) { const item = world.items.find((entry) => entry.id === reward.definitionId);
        if (!item || (!item.stackable || item.unique) && reward.quantity !== 1) issues.push("奖励定义不存在或数量违反堆叠 / 唯一性。");
        if (item?.unique && world.instances.some((entry) => entry.definitionId === item.id)) issues.push("唯一奖励已在世界放置，不能再创建副本。"); }
    }
  }
  const visiting = new Set<string>(); const reached = new Set<string>(); let cycle = false;
  const visit = (id: string) => { if (visiting.has(id)) { cycle = true; return; } if (reached.has(id)) return; reached.add(id); visiting.add(id);
    for (const choice of stages.get(id)?.choices ?? []) visit(choice.next); visiting.delete(id); };
  visit(event.stages[0].id);
  if (cycle) issues.push("首期事件必须是有限无环流程，不能循环领奖。");
  if (reached.size !== stages.size) issues.push("事件存在无法到达的阶段。");
  return [...new Set(issues)];
}

export function blankEventDesign(world: WorldTemplate, id: string, brief: string, locationId = world.start): EventDefinition {
  return { id, name: "待设计事件", scope: "local", locationId, actorIds: world.characters.filter((person) => person.card.locationId === locationId).slice(0, 4).map((person) => person.card.id), trigger: {},
    details: { category: "exploration", cause: brief.slice(0, 600), visibility: "local", usesSupernatural: false, authorNotes: [], onTriggerKnowledge: [] },
    stages: [{ id: "available", description: "你遇到一个可以选择参与或拒绝的事件。", terminal: false, choices: [
      { id: "accept", label: "了解并参与", cost: "无消耗", next: "completed", effect: {}, result: "你参与了这段经历，可以决定下一步行动。", refusal: false, knowledge: [] },
      { id: "decline", label: "暂不参与", cost: "无消耗，保留玩家选择", next: "declined", effect: {}, result: "你暂不参与，仍可继续探索。", refusal: true, knowledge: [] },
    ] }, { id: "completed", description: "事件已解决。", terminal: true, choices: [] }, { id: "declined", description: "你选择了不参与。", terminal: true, choices: [] }] };
}
