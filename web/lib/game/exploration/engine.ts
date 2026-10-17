import { explorationActionSchema, explorationStateSchema, ExplorationError, type ExplorationAction, type ExplorationState } from "./contracts";
import { getWorldTemplate, type WorldCondition, type WorldEffect, type WorldTemplate } from "./catalog";

export function meets(state: ExplorationState, condition?: WorldCondition): boolean {
  return !condition || ((!condition.flag || state.flags[condition.flag] === true)
    && (!condition.learned || state.learned.includes(condition.learned))
    && (!condition.item || state.instances.some((item) => item.owner === "player" && item.definitionId === condition.item))
    && (!condition.minTick || state.tick >= condition.minTick));
}
function fail(message: string): never { throw new ExplorationError(message); }
const add = (values: string[], value: string) => { if (!values.includes(value)) values.push(value); };

export function applyWorldEffect(state: ExplorationState, template: WorldTemplate, effect: WorldEffect) {
  for (const flag of effect.flags ?? []) state.flags[flag] = true;
  for (const id of effect.discover ?? []) add(state.discovered, id);
  for (const id of effect.reveal ?? []) {
    const lore = template.lore.find((entry) => entry.id === id);
    if (!lore) fail("设定引用无效。");
    if (!state.learned.includes(id)) {
      add(state.learned, id);
      state.history.push({ ...lore, tick: state.tick });
    }
  }
}

export function projectWorld(state: ExplorationState, template = getWorldTemplate(state.templateId, state.templateVersion)): ExplorationState {
  const current = template.locations.find((location) => location.id === state.locationId) ?? fail("当前位置不存在。");
  for (const exit of current.exits) if (meets(state, exit.requires)) add(state.discovered, exit.to);
  state.view = {
    world: template.world, region: template.region, ranks: template.ranks, slots: template.slots,
    locations: template.locations.filter((location) => state.discovered.includes(location.id)).map((location) => ({
      id: location.id, name: location.name, region: template.region,
      description: state.visited.includes(location.id) ? location.description : "尚未到访。",
      visited: state.visited.includes(location.id),
      exits: location.id === state.locationId ? location.exits.filter((exit) => state.discovered.includes(exit.to)).map((exit) => ({
        id: exit.to, name: template.locations.find((place) => place.id === exit.to)!.name,
        accessible: meets(state, exit.requires), reason: exit.reason,
      })) : [],
      points: location.id === state.locationId ? location.points.filter((point) => meets(state, point.requires)).map(({ id, name, description }) => ({ id, name, description })) : [],
    })), items: [], events: [], epics: [],
  };
  return explorationStateSchema.parse(state);
}

export function startWorld(templateId: string): ExplorationState {
  const template = getWorldTemplate(templateId);
  return projectWorld({ schemaVersion: 1, templateId, templateVersion: template.version, tick: 0,
    locationId: template.start, discovered: [template.start], visited: [template.start], learned: [], flags: {},
    coins: 12, conditions: [], progress: { rating: template.ranks.rating[0].id, tier: template.ranks.tier[0].id, level: 1 },
    instances: structuredClone(template.instances), characters: {}, events: {}, history: [],
    view: { world: template.world, region: template.region, ranks: template.ranks, slots: template.slots, locations: [], items: [], events: [], epics: [] },
    lastResult: "你已抵达雾港。普通行动不掷骰，地图和人物会随探索逐步开放；可以自由探索，也可以不参与灯塔故事。",
  }, template);
}

export function applyExplorationAction(raw: ExplorationState | undefined, rawAction: ExplorationAction, source: string): ExplorationState {
  const action = explorationActionSchema.parse(rawAction);
  if (action.action === "start") {
    if (raw) fail("这条剧情线已经开启世界，不可覆盖存档。");
    return startWorld(action.templateId);
  }
  if (!raw) fail("请先开启探索世界。");
  const state = explorationStateSchema.parse(structuredClone(raw));
  const template = getWorldTemplate(state.templateId, state.templateVersion);
  const location = template.locations.find((item) => item.id === state.locationId)!;
  if (action.action === "move") {
    const exit = location.exits.find((item) => item.to === action.targetId) ?? fail("只能沿当前位置的相邻路径移动。");
    if (!meets(state, exit.requires)) fail(exit.reason);
    state.locationId = exit.to; add(state.discovered, exit.to); add(state.visited, exit.to);
    const destination = template.locations.find((item) => item.id === exit.to)!;
    state.lastResult = `抵达${destination.name}。${destination.description}`;
  } else if (action.action === "inspect") {
    if (action.targetId === location.id) state.lastResult = location.description;
    else {
      const point = location.points.find((item) => item.id === action.targetId && meets(state, item.requires)) ?? fail("这里没有可查看的目标。");
      state.lastResult = point.description;
    }
  } else if (action.action === "investigate") {
    const point = location.points.find((item) => item.id === action.targetId && meets(state, item.requires)) ?? fail("这里没有可调查的目标。");
    if (state.flags[`investigated-${point.id}`]) fail("已经调查过，线索与物品不会重复结算。");
    applyWorldEffect(state, template, point.effect);
    state.flags[`investigated-${point.id}`] = true;
    state.lastResult = point.result;
  } else if (action.action === "wait") state.lastResult = "你停留片刻，观察潮水与路人的变化。";
  else fail("该动作尚未在当前世界开放。");
  state.tick += action.action === "inspect" ? 0 : 1;
  state.history.push({ id: `${source}:${state.tick}`, tick: state.tick, kind: "fact", origin: "play", text: state.lastResult,
    locationId: state.locationId, actorIds: [], eventId: null, source });
  // Full records remain in immutable turn snapshots; context keeps a bounded working chronology.
  state.history = state.history.slice(-200);
  return projectWorld(state, template);
}
