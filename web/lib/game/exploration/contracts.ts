import { z } from "zod";

// Independent of the legacy game-state.v2 and export-v3 compatibility contracts.
export const EXPLORATION_STATE_VERSION = 1;
export const EXPLORATION_HOST_CONTRACT = "exploration.v1";
export const worldKey = z.string().min(1).max(60).regex(/^[a-z][a-z0-9-]*$/u)
  .refine((key) => !["constructor", "prototype"].includes(key));
const text = z.string().trim().min(1).max(600);
const lines = z.array(text).max(20);
const keys = z.array(worldKey).max(100).refine((ids) => ids.length === new Set(ids).size);
const record = <T extends z.ZodType>(value: T, limit = 100) => z.record(worldKey, value)
  .refine((items) => Object.keys(items).length <= limit);
const rank = z.object({ id: worldKey, name: z.string().min(1).max(60), meaning: text }).strict();
export const worldRanksSchema = z.object({
  rating: z.array(rank).min(1).max(12), quality: z.array(rank).min(1).max(12),
  tier: z.array(rank).min(1).max(12), levelsPerTier: z.number().int().min(1).max(10),
}).strict().superRefine((value, ctx) => {
  for (const field of ["rating", "quality", "tier"] as const) {
    if (new Set(value[field].map((item) => item.id)).size !== value[field].length)
      ctx.addIssue({ code: "custom", path: [field], message: "档位 ID 不得重复。" });
  }
});
export const worldItemSchema = z.object({
  id: worldKey, name: text, description: text, quality: worldKey, tier: worldKey,
  rating: worldKey, level: z.number().int().min(1).max(10),
  stackable: z.boolean(), unique: z.boolean(), slot: worldKey.nullable(),
  abilities: lines, consumable: z.boolean(), price: z.number().int().min(0).max(10000),
}).strict();
export const worldItemInstanceSchema = z.object({
  id: worldKey, definitionId: worldKey, owner: worldKey,
  quantity: z.number().int().min(1).max(999), equippedSlot: worldKey.nullable(),
  source: text,
}).strict();
export const worldHistorySchema = z.object({
  id: z.string().min(1).max(120), tick: z.number().int().min(0),
  kind: z.enum(["fact", "rumor", "legend", "opinion"]),
  origin: z.enum(["setting", "play"]), text,
  locationId: worldKey, actorIds: keys, eventId: worldKey.nullable(),
  source: z.string().min(1).max(160), // setting ID or immutable request receipt in the source turn
}).strict();
export const publicWorldCharacterSchema = z.object({
  id: worldKey, name: text, category: z.enum(["player", "npc", "important"]),
  controller: z.enum(["user", "ai", "shared"]), locationId: worldKey,
  identity: text, faction: text, personality: text, speech: text,
  goals: lines, appearance: text, backstory: text, values: lines, boundaries: lines,
  abilities: lines, relationship: z.enum(["wary", "neutral", "friendly", "trusted"]),
  relationshipReason: text, knownInformation: lines, promises: lines, memories: lines,
  unresolved: lines, arc: text,
  topics: z.array(z.object({ id: worldKey, label: text }).strict()).max(20),
  interactions: z.array(z.enum(["promise", "help", "negotiate", "trade"])).max(4),
}).strict();
const locationView = z.object({
  id: worldKey, name: text, region: text, description: text, visited: z.boolean(),
  exits: z.array(z.object({ id: worldKey, name: text, accessible: z.boolean(), reason: text }).strict()).max(20),
  points: z.array(z.object({ id: worldKey, name: text, description: text }).strict()).max(20),
}).strict();
const eventView = z.object({
  id: worldKey, name: text, scope: z.enum(["local", "character", "world"]),
  stage: worldKey, description: text, locationId: worldKey, actorIds: keys,
  choices: z.array(z.object({ id: worldKey, label: text, cost: text, available: z.boolean() }).strict()).max(10),
  settled: z.boolean(),
}).strict();
const epicView = z.object({ id: worldKey, name: text, chapters: lines,
  milestones: lines, keyActors: keys, ending: text.nullable(), consequences: lines }).strict();
export const explorationStateSchema = z.object({
  schemaVersion: z.literal(EXPLORATION_STATE_VERSION), templateId: worldKey,
  templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  tick: z.number().int().min(0).max(1000000), locationId: worldKey,
  discovered: keys, visited: keys, learned: keys, flags: record(z.boolean()),
  coins: z.number().int().min(0).max(1000000), conditions: lines,
  wallets: record(z.number().int().min(0).max(1000000), 50),
  progress: z.object({ rating: worldKey, tier: worldKey, level: z.number().int().min(1).max(10) }).strict(),
  instances: z.array(worldItemInstanceSchema).max(150),
  characters: record(publicWorldCharacterSchema, 50),
  events: record(z.object({ stage: worldKey, settled: z.boolean() }).strict(), 50),
  history: z.array(worldHistorySchema).max(200),
  // Public projection only. Hidden template data is never serialized into snapshots.
  view: z.object({ world: text, region: text, ranks: worldRanksSchema, slots: keys,
    locations: z.array(locationView).max(100), items: z.array(worldItemSchema).max(100),
    events: z.array(eventView).max(50), epics: z.array(epicView).max(20),
  }).strict(),
  lastResult: text,
  receipt: z.object({ requestId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().optional(),
}).strict().superRefine((state, ctx) => {
  const ids = state.instances.map((item) => item.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "物品实例重复。" });
  if (!state.visited.includes(state.locationId) || state.visited.some((id) => !state.discovered.includes(id)))
    ctx.addIssue({ code: "custom", message: "当前位置 / 已访问地点必须已发现。" });
  if (!state.view.ranks.rating.some((rank) => rank.id === state.progress.rating)
    || !state.view.ranks.tier.some((rank) => rank.id === state.progress.tier)
    || state.progress.level > state.view.ranks.levelsPerTier)
    ctx.addIssue({ code: "custom", message: "进度超出世界档位定义。" });
});

export const explorationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), templateId: worldKey }).strict(),
  z.object({ action: z.literal("inspect"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("move"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("investigate"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("take"), instanceId: worldKey, quantity: z.number().int().min(1).max(99) }).strict(),
  z.object({ action: z.literal("equip"), instanceId: worldKey }).strict(),
  z.object({ action: z.literal("unequip"), instanceId: worldKey }).strict(),
  z.object({ action: z.literal("use"), instanceId: worldKey }).strict(),
  z.object({ action: z.literal("give"), instanceId: worldKey, targetId: worldKey, quantity: z.number().int().min(1).max(99) }).strict(),
  z.object({ action: z.literal("trade"), instanceId: worldKey, targetId: worldKey, direction: z.enum(["buy", "sell"]), quantity: z.number().int().min(1).max(99) }).strict(),
  z.object({ action: z.literal("talk"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("ask"), targetId: worldKey, topicId: worldKey }).strict(),
  z.object({ action: z.literal("promise"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("help"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("negotiate"), targetId: worldKey }).strict(),
  z.object({ action: z.literal("choose"), eventId: worldKey, choiceId: worldKey }).strict(),
  z.object({ action: z.literal("wait") }).strict(),
]);
export type ExplorationState = z.infer<typeof explorationStateSchema>;
export type ExplorationAction = z.infer<typeof explorationActionSchema>;
export type WorldItem = z.infer<typeof worldItemSchema>;
export type WorldCharacter = z.infer<typeof publicWorldCharacterSchema>;
export type WorldHistory = z.infer<typeof worldHistorySchema>;
export class ExplorationError extends Error {
  readonly code = "EXPLORATION_ACTION_INVALID";
  constructor(message: string) { super(message); this.name = "ExplorationError"; }
}
