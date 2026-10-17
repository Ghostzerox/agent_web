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

function spawn(state: ExplorationState, template: WorldTemplate, id: string, owner?: string) {
  if (state.flags[`spawned-${id}`]) return;
  const instance = template.instances.find((item) => item.id === id) ?? fail("物品来源不存在。");
  state.instances.push({ ...structuredClone(instance), owner: owner ?? instance.owner });
  state.flags[`spawned-${id}`] = true;
}

export function validateWorldInventory(state: ExplorationState, template: WorldTemplate) {
  const unique = new Set<string>(); const slots = new Set<string>();
  for (const item of state.instances) {
    const definition = template.items.find((entry) => entry.id === item.definitionId) ?? fail("物品定义不存在。");
    if (!definition.stackable && item.quantity !== 1) fail("独立物品不可堆叠。");
    if (definition.unique && (unique.has(definition.id) || item.quantity !== 1)) fail("唯一物品重复。");
    if (definition.unique) unique.add(definition.id);
    if (item.owner !== "player" && !template.locations.some((entry) => entry.id === item.owner) && !template.characters.some((entry) => entry.card.id === item.owner)) fail("物品所有者无效。");
    if (item.equippedSlot) {
      if (item.owner !== "player" || item.equippedSlot !== definition.slot || !template.slots.includes(item.equippedSlot)) fail("装备槽或所有权无效。");
      if (slots.has(item.equippedSlot)) fail("同一槽位只能装备一件物品。");
      slots.add(item.equippedSlot);
    }
  }
}

function transfer(state: ExplorationState, instanceId: string, from: string, to: string, quantity: number) {
  const item = state.instances.find((entry) => entry.id === instanceId && entry.owner === from) ?? fail("物品不属于该持有者。");
  if (item.quantity < quantity) fail("物品数量不足。");
  if (item.equippedSlot) fail("请先卸下装备再转移。");
  if (item.quantity === quantity) item.owner = to;
  else {
    item.quantity -= quantity;
    let index = 0; let id: string;
    do { id = `${item.definitionId}-split-${state.tick}-${index++}`; } while (state.instances.some((entry) => entry.id === id));
    state.instances.push({ ...item, id, owner: to, quantity });
  }
}

export function applyWorldEffect(state: ExplorationState, template: WorldTemplate, effect: WorldEffect) {
  for (const flag of effect.flags ?? []) state.flags[flag] = true;
  for (const id of effect.discover ?? []) add(state.discovered, id);
  for (const id of effect.grant ?? []) spawn(state, template, id, "player");
  if (effect.coins) state.coins += effect.coins;
  if (effect.condition) add(state.conditions, effect.condition);
  if (effect.removeCondition) state.conditions = state.conditions.filter((item) => item !== effect.removeCondition);
  if (effect.progress) state.progress = { ...effect.progress };
  if (effect.character) {
    const change = effect.character;
    const definition = template.characters.find((person) => person.card.id === change.id) ?? fail("人物不存在。");
    const character = state.characters[change.id] ??= structuredClone(definition.card);
    if (change.important) Object.assign(character, definition.revealedCard ?? {}, { category: "important" });
    if (change.relationship) {
      // A small helpful action must not downgrade previously earned trust.
      if (character.relationship !== "trusted" || change.relationship !== "friendly") character.relationship = change.relationship;
      character.relationshipReason = change.reason;
    }
    if (change.locationId) character.locationId = change.locationId;
    character.memories = [...character.memories, change.reason].slice(-12);
  }
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
  for (const definition of template.characters) {
    const character = state.characters[definition.card.id];
    if ((character?.locationId ?? definition.card.locationId) !== state.locationId) continue;
    const known = state.characters[definition.card.id] ??= structuredClone(definition.card);
    known.topics = definition.topics.filter((topic) => meets(state, topic.requires)).map(({ id, label }) => ({ id, label }));
    known.interactions = [
      ...(definition.promise && meets(state, definition.promise.requires) ? ["promise" as const] : []),
      ...(definition.help ? ["help" as const] : []), ...(definition.negotiate ? ["negotiate" as const] : []), ...(definition.trader ? ["trade" as const] : []),
    ];
  }
  for (const item of template.instances) {
    const owner = state.characters[item.owner] ?? template.characters.find((person) => person.card.id === item.owner)?.card;
    if (item.owner === "player" || item.owner === state.locationId || owner?.locationId === state.locationId) spawn(state, template, item.id);
  }
  validateWorldInventory(state, template);
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
    })), items: template.items.filter((item) => state.instances.some((instance) => instance.definitionId === item.id &&
      (instance.owner === "player" || instance.owner === state.locationId || state.characters[instance.owner]?.locationId === state.locationId))),
    events: template.events.filter((event) => state.events[event.id] && state.discovered.includes(event.locationId)).map((event) => {
      const runtime = state.events[event.id]; const stage = event.stages.find((entry) => entry.id === runtime.stage)!;
      return { id: event.id, name: event.name, scope: event.scope, locationId: event.scope === "character" ? state.characters[event.actorIds[0]]?.locationId ?? event.locationId : event.locationId, actorIds: event.actorIds,
        stage: stage.id, description: stage.description, settled: runtime.settled,
        choices: stage.choices.map((choice) => ({ id: choice.id, label: choice.label, cost: choice.cost,
          available: meets(state, choice.requires) && state.coins >= (choice.coinCost ?? 0)
            && (!choice.consume || state.instances.some((item) => item.owner === "player" && item.definitionId === choice.consume && !item.equippedSlot)) })) };
    }), epics: [],
  };
  return explorationStateSchema.parse(state);
}

export function startWorld(templateId: string): ExplorationState {
  const template = getWorldTemplate(templateId);
  return projectWorld({ schemaVersion: 1, templateId, templateVersion: template.version, tick: 0,
    locationId: template.start, discovered: [template.start], visited: [template.start], learned: [], flags: {},
    coins: 12, wallets: Object.fromEntries(template.characters.map((person) => [person.card.id, 30])), conditions: [], progress: { rating: template.ranks.rating[0].id, tier: template.ranks.tier[0].id, level: 1 },
    instances: [], characters: {}, events: {}, history: [],
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
  state.tick += action.action === "inspect" ? 0 : 1;
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
  } else if (["equip", "unequip", "use", "take", "give", "trade"].includes(action.action) && "instanceId" in action) {
    const item = state.instances.find((entry) => entry.id === action.instanceId) ?? fail("当前分支没有该物品。");
    const definition = template.items.find((entry) => entry.id === item.definitionId)!;
    if (action.action === "take") {
      transfer(state, item.id, state.locationId, "player", action.quantity);
      state.lastResult = `拾取${definition.name} × ${action.quantity}。`;
    } else if (action.action === "give" || action.action === "trade") {
      const target = template.characters.find((person) => person.card.id === action.targetId) ?? fail("目标不存在。");
      if ((state.characters[target.card.id]?.locationId ?? target.card.locationId) !== state.locationId) fail("只能与同地点的人物交互。");
      if (action.action === "trade") {
        if (!target.trader || definition.price <= 0) fail("对方不交易此物品。");
        const price = definition.price * action.quantity;
        if (action.direction === "buy") {
          if (state.coins < price) fail("钱币不足。");
          transfer(state, item.id, target.card.id, "player", action.quantity);
          state.coins -= price; state.wallets[target.card.id] += price;
        } else {
          if (state.wallets[target.card.id] < price) fail("对方钱币不足。");
          transfer(state, item.id, "player", target.card.id, action.quantity);
          state.coins += price; state.wallets[target.card.id] -= price;
        }
        state.lastResult = `${action.direction === "buy" ? "购入" : "售出"}${definition.name} × ${action.quantity}，${price} 枚钱币。`;
      } else {
        transfer(state, item.id, "player", target.card.id, action.quantity);
        state.lastResult = `赠予${target.card.name}${definition.name} × ${action.quantity}；赠礼不自动等于赢得信任。`;
      }
    } else {
      if (item.owner !== "player") fail("只能操作自己的物品。");
      if (action.action === "equip") {
        if (!definition.slot) fail("该物品不可装备。");
        if (item.equippedSlot || state.instances.some((entry) => entry.equippedSlot === definition.slot)) fail("槽位已占用，请先卸下。");
        item.equippedSlot = definition.slot; state.lastResult = `装备${definition.name}，能力：${definition.abilities.join("、")}。`;
      } else if (action.action === "unequip") {
        if (!item.equippedSlot) fail("该物品尚未装备。");
        item.equippedSlot = null; state.lastResult = `卸下${definition.name}。`;
      } else if (action.action === "use") {
        if (!definition.consumable) fail("该物品不是消耗品；剧情道具请通过事件使用。");
        if (item.equippedSlot) fail("请先卸下装备。");
        applyWorldEffect(state, template, template.consumableEffects[definition.id] ?? {});
        item.quantity--; state.instances = state.instances.filter((entry) => entry.quantity > 0);
        state.lastResult = `使用${definition.name}，消耗 1；${definition.abilities.join("、")}。`;
      }
    }
  } else if (["talk", "ask", "promise", "help", "negotiate"].includes(action.action) && "targetId" in action) {
    const definition = template.characters.find((person) => person.card.id === action.targetId) ?? fail("人物不存在。");
    const character = state.characters[action.targetId];
    if (!character || character.locationId !== state.locationId || character.controller === "user") fail("只能与同地点的非玩家角色交互。");
    if (action.action === "talk") {
      state.lastResult = `${character.name}：我现在关心的是${character.goals[0]}。你想谈什么？`;
    } else if (action.action === "ask") {
      const topic = definition.topics.find((entry) => entry.id === action.topicId && meets(state, entry.requires)) ?? fail("话题尚未解锁，对方不会凭空知道你的秘密。");
      applyWorldEffect(state, template, topic.effect ?? {});
      if (!character.knownInformation.includes(topic.answer)) character.knownInformation = [...character.knownInformation, topic.answer].slice(-20);
      state.lastResult = topic.answer;
    } else if (action.action === "promise") {
      const promise = definition.promise ?? fail("对方目前没有可约定的事项。");
      if (!meets(state, promise.requires)) fail("需要先讨论具体事项。");
      if (character.promises.includes(promise.text)) fail("该承诺已记录，不重复创建。");
      character.promises.push(promise.text); state.lastResult = `你明确作出承诺：${promise.text}`;
    } else {
      const interaction = action.action === "help" ? definition.help : definition.negotiate;
      if (!interaction || !meets(state, interaction.requires)) {
        state.lastResult = `${character.name}暂不接受：${action.action === "help" ? "需要先带来能解决问题的物品" : "需要可信证据和双方认可的依据"}。没有损失物品，也没有自动改变信任。`;
      } else {
        const flag = `interaction-${action.action}-${character.id}`;
        if (state.flags[flag]) fail("该项协助 / 交涉已经完成，不重复奖励。");
        applyWorldEffect(state, template, interaction.effect); state.flags[flag] = true; state.lastResult = interaction.result;
      }
    }
    character.memories = [...character.memories, state.lastResult].slice(-12);
    const promise = definition.promise;
    if (promise && character.promises.includes(promise.text) && meets(state, promise.completion) && !state.flags[`fulfilled-${character.id}`]) {
      applyWorldEffect(state, template, promise.effect); state.flags[`fulfilled-${character.id}`] = true;
      character.unresolved = character.unresolved.filter((entry) => entry !== "缺失的镜片");
    }
  } else if (action.action === "choose") {
    const event = template.events.find((entry) => entry.id === action.eventId) ?? fail("事件不存在。");
    const runtime = state.events[event.id] ?? fail("事件尚未触发。");
    // Character events follow their involved character after a world consequence moves them.
    const eventLocation = event.scope === "character" ? state.characters[event.actorIds[0]]?.locationId ?? event.locationId : event.locationId;
    if (eventLocation !== state.locationId) fail("需要到事件发生地点交互。");
    if (runtime.settled) fail("事件已经结束，不重复结算。");
    const stage = event.stages.find((entry) => entry.id === runtime.stage)!;
    const choice = stage.choices.find((entry) => entry.id === action.choiceId) ?? fail("当前阶段没有该选项。");
    if (!meets(state, choice.requires)) fail(`尚不符合条件：${choice.cost}`);
    if (state.coins < (choice.coinCost ?? 0)) fail("钱币不足，事件未结算。");
    if (choice.consume) {
      const item = state.instances.find((entry) => entry.definitionId === choice.consume && entry.owner === "player") ?? fail("所需物品不在背包。");
      if (item.equippedSlot) fail("请先卸下剧情所需装备。");
      item.quantity--; state.instances = state.instances.filter((entry) => entry.quantity > 0);
    }
    state.coins -= choice.coinCost ?? 0;
    applyWorldEffect(state, template, choice.effect);
    runtime.stage = choice.next;
    runtime.settled = event.stages.find((entry) => entry.id === choice.next)?.terminal ?? fail("事件阶段无效。");
    state.lastResult = choice.result;
  } else if (action.action === "wait") state.lastResult = "你停留片刻，观察潮水与路人的变化。";
  else fail("该动作尚未在当前世界开放。");
  state.history.push({ id: `${source}:${state.tick}`, tick: state.tick, kind: "fact", origin: "play", text: state.lastResult,
    locationId: state.locationId, actorIds: action.action === "choose" ? template.events.find((entry) => entry.id === action.eventId)!.actorIds : "targetId" in action && state.characters[action.targetId] ? [action.targetId] : [], eventId: action.action === "choose" ? action.eventId : null, source });
  for (const event of template.events) {
    if (!state.events[event.id] && meets(state, event.trigger)) {
      state.events[event.id] = { stage: event.stages[0].id, settled: false };
      state.history.push({ id: `${source}:event-${event.id}`, tick: state.tick, kind: "fact", origin: "play", text: `事件开启：${event.name}`,
        locationId: event.locationId, actorIds: event.actorIds, eventId: event.id, source });
    }
  }
  // Full records remain in immutable turn snapshots; context keeps a bounded working chronology.
  state.history = state.history.slice(-200);
  return projectWorld(state, template);
}
