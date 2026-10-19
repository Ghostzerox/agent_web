import { z } from "zod";
import { worldKey } from "../exploration/contracts";

const text = z.string().trim().min(1).max(600);
const keys = z.array(worldKey).max(12).refine((ids) => new Set(ids).size === ids.length);
export const eventConditionSchema = z.object({ flag: worldKey.optional(), learned: worldKey.optional(), item: worldKey.optional(),
  minTick: z.number().int().min(0).max(1000000).optional(),
  relationship: z.object({ actorId: worldKey, atLeast: z.enum(["wary", "neutral", "friendly", "trusted"]) }).strict().optional() }).strict();
export const eventKnowledgeSchema = z.object({ text, evidence: z.enum(["fact", "rumor", "legend", "opinion"]),
  recipients: keys.min(1), reason: text }).strict();
export const eventEffectSchema = z.object({ flags: keys.optional(), discover: keys.optional(), reveal: keys.optional(),
  coins: z.number().int().min(-10000).max(10000).optional(), condition: text.optional(), removeCondition: text.optional(),
  rewards: z.array(z.object({ definitionId: worldKey, quantity: z.number().int().min(1).max(99) }).strict()).max(6).optional(),
  character: z.object({ id: worldKey, relationship: z.enum(["wary", "neutral", "friendly", "trusted"]).optional(), reason: text,
    important: z.boolean().optional(), locationId: worldKey.optional(), removeUnresolved: z.array(text).max(6).optional() }).strict().optional(),
}).strict();
export const eventDetailsSchema = z.object({ category: z.enum(["exploration", "social", "commission", "personal", "world", "epic"]),
  cause: text, visibility: z.enum(["local", "participants"]), usesSupernatural: z.boolean(),
  authorNotes: z.array(text).max(4), onTriggerKnowledge: z.array(eventKnowledgeSchema).max(6) }).strict();
export const eventDefinitionSchema = z.object({ id: worldKey.max(24), name: text.max(120), scope: z.enum(["local", "character", "world"]),
  locationId: worldKey, actorIds: keys, trigger: eventConditionSchema, details: eventDetailsSchema,
  stages: z.array(z.object({ id: worldKey, description: text, terminal: z.boolean(),
    choices: z.array(z.object({ id: worldKey, label: text.max(120), cost: text, requires: eventConditionSchema.optional(), coinCost: z.number().int().min(0).max(10000).optional(),
      consume: worldKey.optional(), next: worldKey, effect: eventEffectSchema, result: text, refusal: z.boolean(), knowledge: z.array(eventKnowledgeSchema).max(6) }).strict()).max(6),
  }).strict()).min(3).max(8),
}).strict().refine((value) => JSON.stringify(value).length <= 25000, "事件设计不能超过25000字符。");
export type EventDefinition = z.infer<typeof eventDefinitionSchema>;
export const EVENT_FIELDS = ["name", "scope", "locationId", "actorIds", "trigger", "details", "stages"] as const;
export type EventField = typeof EVENT_FIELDS[number];
export const eventFieldSchema = z.enum(EVENT_FIELDS);
export const createEventDesignSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("world"), worldId: z.uuid(), expectedVersion: z.number().int().positive(), brief: text.max(600) }).strict(),
  z.object({ kind: z.literal("session"), sessionId: z.uuid(), parentTurnId: z.uuid(), expectedVersion: z.number().int().positive(), brief: text.max(600) }).strict(),
]);
export const updateEventDesignSchema = z.object({ expectedVersion: z.number().int().positive(), brief: text, content: eventDefinitionSchema,
  lockedFields: z.array(eventFieldSchema).max(EVENT_FIELDS.length) }).strict();
export const generateEventSchema = z.object({ expectedVersion: z.number().int().positive(), requestId: z.uuid(), fields: z.array(eventFieldSchema).min(1).max(EVENT_FIELDS.length) }).strict();
export const confirmEventSchema = z.object({ expectedVersion: z.number().int().positive(), expectedSourceVersion: z.number().int().positive(), confirmed: z.literal(true) }).strict();
export class EventDesignError extends Error {
  constructor(readonly code: "EVENT_NOT_FOUND" | "EVENT_CONFLICT" | "EVENT_INVALID", message: string) { super(message); this.name = "EventDesignError"; }
}
