import { createWorldCharacter } from "../exploration/characterFactory";
import type { WorldTemplate } from "../exploration/templateTypes";
import { validateWorldTemplate } from "../exploration/validateTemplate";
import { worldBlueprintSchema, WorldDesignError, type WorldBlueprint, type WorldBrief } from "./contracts";
import { worldAssetIssues } from "./assetValidation";
import { drawPoolIssues } from "../draws/pools";
import { eventDesignIssues } from "../events/validation";

export function worldDraftIssues(input: WorldBrief, content: WorldBlueprint | null): string[] {
  if (!content) return ["尚无结构化世界草稿，请生成或填写后再发布。"]; const issues: string[] = [];
  const locations = new Set(content.region.locations.map((place) => place.id));
  const characters = new Set(content.characters.map((person) => person.id));
  for (const [label, ids, count] of [["地点", locations, content.region.locations.length], ["人物", characters, content.characters.length]] as const)
    if (ids.size !== count) issues.push(`${label}ID重复。`);
  if ([...characters].some((id) => locations.has(id))) issues.push("人物和地点ID不能重名。");
  if (!locations.has(content.region.startId)) issues.push("起点不存在。");
  for (const place of content.region.locations) if (place.exits.some((id) => !locations.has(id) || id === place.id)) issues.push(`${place.name}的路径引用无效。`);
  const reached = new Set<string>(); const queue = [content.region.startId];
  while (queue.length) { const id = queue.shift()!; if (reached.has(id)) continue; reached.add(id); queue.push(...(content.region.locations.find((place) => place.id === id)?.exits ?? [])); }
  if ([...locations].some((id) => !reached.has(id))) issues.push("地图含无法从起点到达的地点。");
  for (const place of content.region.locations) {
    const seen = new Set<string>(); const pending = [place.id];
    while (pending.length) { const id = pending.shift()!; if (seen.has(id)) continue; seen.add(id); pending.push(...(content.region.locations.find((item) => item.id === id)?.exits ?? [])); }
    if (!seen.has(content.region.startId)) { issues.push("地图存在无法返回起点的单向死路。"); break; }
  }
  for (const person of content.characters) if (!locations.has(person.locationId)) issues.push(`${person.name}的地点不存在。`);
  if (new Set(content.lore.map((entry) => entry.id)).size !== content.lore.length) issues.push("史料ID重复。");
  for (const entry of content.lore) if (!locations.has(entry.locationId) || entry.knownBy.some((id) => !characters.has(id) || id === "player")) issues.push(`史料${entry.id}的地点或知情者不存在。`);
  if (content.hook && !locations.has(content.hook.locationId)) issues.push("初始交互事件的地点不存在。");
  if (input.magic === "forbidden" && content.overview.usesSupernatural) issues.push("硬约束冲突：禁止超自然能力，但草稿声明使用超自然设定。");
  if (input.numericPolicy !== "light" && content.ranks.levelsPerTier !== undefined) issues.push("定性世界 / 指定属性世界不得强制每阶等级数。");
  if (input.numericPolicy === "light" && content.ranks.levelsPerTier === undefined) issues.push("轻数值世界需要明确每阶等级数。");
  issues.push(...worldAssetIssues(input, content), ...content.conflicts.map((line) => `待解决冲突：${line}`));
  issues.push(...drawPoolIssues(content.drawPools ?? [], { items: content.items.definitions, locations: content.region.locations, ranks: content.ranks, numericPolicy: input.numericPolicy, slots: content.itemRules.slots }));
  const events = content.eventDesigns ?? [];
  const eventIds = [...(content.hook ? [content.hook.id] : []), ...events.map((event) => event.id)];
  if (new Set(eventIds).size !== eventIds.length) issues.push("事件ID与初始交互或其他事件重复。");
  for (const event of events) issues.push(...eventDesignIssues(event, { items: content.items.definitions, instances: content.items.placements, acquisitionRules: { magic: input.magic }, locations: content.region.locations,
    characters: content.characters.filter((person) => person.id !== "player").map((person) => ({ card: { id: person.id } })),
    lore: [...content.lore, ...content.characters.flatMap((person) => person.profile.secrets.map((_, index) => ({ id: `${person.id}-secret-${index}` })))] }));
  return [...new Set(issues)];
}

export function compileWorld(id: string, revision: number, input: WorldBrief, raw: WorldBlueprint): WorldTemplate {
  const content = worldBlueprintSchema.parse(raw); const issues = worldDraftIssues(input, content);
  if (issues.length) throw new WorldDesignError("WORLD_INVALID", issues.join("\n"));
  const { overview, region, characters, lore, hook } = content;
  const worldId = `world-${id}`; const version = `1.0.${revision}`;
  const player = content.characters.find((person) => person.category === "player");
  const privateLore = characters.flatMap((person) => person.profile.secrets.map((secret, index) => ({ id: `${person.id}-secret-${index}`, text: secret.text,
    kind: secret.kind, origin: "setting" as const, locationId: person.locationId, actorIds: [...new Set([person.id, ...secret.knownBy])].filter((key) => key !== "player"),
    eventId: null, source: `${worldId}@${version}:${person.id}-secret-${index}` })));
  if (privateLore.some((entry) => lore.some((other) => other.id === entry.id))) throw new WorldDesignError("WORLD_INVALID", "人物秘密ID与世界史料重名，请修改史料ID。");
  const publicCard = (person: typeof characters[number]) => ({ ...createWorldCharacter(person.id, person.name, person.locationId, person.identity),
    category: person.category, controller: person.category === "player" ? "user" as const : "ai" as const, goals: [person.goal], personality: person.personality,
    speech: person.speech, faction: person.profile.faction, appearance: person.profile.appearance, backstory: person.profile.publicBackground });
  const template: WorldTemplate = {
    id: worldId, version, hostContract: "exploration.v1", world: overview.name, region: region.name, start: region.startId,
    numericPolicy: input.numericPolicy, acquisitionRules: { magic: input.magic }, drawPools: content.drawPools ?? [],
    publicRules: [input.magic === "forbidden" ? "本世界禁止超自然能力。" : "超自然能力遵循当前世界规则。", ...input.constraints,
      `时代：${overview.era}`, `技术：${overview.technology}`, `超自然规则：${overview.supernatural}`],
    hostNotes: content.authorNotes,
    characterNotes: Object.fromEntries(characters.map((person) => [person.id, person.profile.authorNotes])),
    authorLoreIds: [...lore.filter((entry) => entry.visibility === "author").map((entry) => entry.id), ...privateLore.map((entry) => entry.id)],
    personas: Object.fromEntries(characters.map((person) => [person.id, { privateBackground: person.profile.privateBackground, values: person.profile.values,
      boundaries: person.profile.boundaries, abilities: person.profile.abilities, needs: person.profile.needs, longTermGoal: person.profile.longTermGoal, relationships: person.profile.relationships }])),
    setting: { premise: overview.premise, tone: overview.tone, era: overview.era, technology: overview.technology,
      supernatural: overview.supernatural, cultures: overview.cultures, factions: overview.factions, history: overview.history },
    initial: { coins: 0, progress: { rating: content.ranks.rating[0].id, tier: content.ranks.tier[0].id,
      ...(input.numericPolicy === "light" ? { level: 1 } : {}) },
      player: player ? publicCard(player) : { ...createWorldCharacter("player", "行旅者", region.startId, content.opening.playerRole), category: "player", controller: "user" }, message: content.opening.text },
    ranks: content.ranks, slots: content.itemRules.slots, attributeRules: content.itemRules.attributes,
    items: content.items.definitions.map(({ kind: _kind, usesSupernatural: _magic, useEffect: _effect, ...item }) => { void _kind; void _magic; void _effect; return item; }),
    instances: content.items.placements.map((placement) => ({ ...placement, equippedSlot: null, source: `${worldId}@${version}:placement-${placement.id}` })),
    consumableEffects: Object.fromEntries(content.items.definitions.filter((item) => item.consumable).map((item) => [item.id, {
      ...(item.useEffect?.addCondition ? { condition: item.useEffect.addCondition } : {}), ...(item.useEffect?.removeCondition ? { removeCondition: item.useEffect.removeCondition } : {}) }])),
    itemUseRequirements: Object.fromEntries(content.items.definitions.filter((item) => item.useEffect).map((item) => [item.id,
      { locationId: item.useEffect!.locationId, condition: item.useEffect!.requiresCondition }])),
    locations: region.locations.map((place) => ({ id: place.id, name: place.name, description: place.description,
      exits: place.exits.map((to) => ({ to, reason: `沿路前往${region.locations.find((entry) => entry.id === to)!.name}` })),
      points: [{ id: `${place.id}-discovery`, name: "观察与了解当地", description: "观察环境与当地生活，不预设存在谜案或线索。", result: place.discovery,
        effect: { reveal: lore.filter((entry) => entry.locationId === place.id && entry.visibility === "public").map((entry) => entry.id) } }] })),
    characters: characters.filter((person) => person.category !== "player").map((person) => ({ card: publicCard(person),
      knowledge: [...lore.filter((entry) => entry.knownBy.includes(person.id)).map((entry) => entry.id), ...privateLore.filter((entry) => entry.actorIds.includes(person.id)).map((entry) => entry.id)], trader: false,
      topics: lore.filter((entry) => entry.visibility === "public" && entry.knownBy.includes(person.id)).map((entry) => ({ id: entry.id, label: "询问当地资料", answer: entry.text, effect: { reveal: [entry.id] } })) })),
    lore: [...lore.map((entry) => ({ id: entry.id, text: entry.text, kind: entry.kind, origin: "setting" as const, locationId: entry.locationId,
      actorIds: entry.knownBy, eventId: null, source: `${worldId}@${version}:${entry.id}` })), ...privateLore],
    events: [...(hook ? [{ id: hook.id, name: hook.name, scope: "local" as const, locationId: hook.locationId, actorIds: [], trigger: {}, stages: [
      { id: "available", description: hook.description, terminal: false, choices: [
        { id: "accept", label: hook.acceptText, cost: "无消耗；确认后写入本分支", next: "completed", effect: {}, result: hook.outcome },
        { id: "decline", label: "暂不参与", cost: "无消耗", next: "declined", effect: {}, result: hook.declineOutcome },
      ] }, { id: "completed", description: hook.outcome, terminal: true, choices: [] }, { id: "declined", description: hook.declineOutcome, terminal: true, choices: [] },
    ] }] : []), ...(content.eventDesigns ?? [])], epics: [],
  };
  validateWorldTemplate(template); return template;
}
