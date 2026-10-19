import { z } from "zod";
import { numericPolicySchema, worldRanksSchema } from "../exploration/contracts";
import { characterDesignSchema, itemRulesSchema, worldItemsSchema } from "./assetContracts";

const text = z.string().trim().min(1).max(600);
const lines = z.array(text).max(12);
const key = z.string().regex(/^[a-z][a-z0-9-]{0,23}$/u).refine((id) => !["player", "host", "constructor", "prototype"].includes(id));
export const WORLD_SECTIONS = ["overview", "ranks", "itemRules", "region", "characters", "items", "lore", "opening", "hook", "authorNotes", "conflicts"] as const;
export const worldSectionSchema = z.enum(WORLD_SECTIONS);
export type WorldSection = typeof WORLD_SECTIONS[number];
export const worldBriefSchema = z.object({
  brief: z.string().trim().min(1).max(4000), constraints: z.array(z.string().trim().min(1).max(300)).max(12),
  magic: z.enum(["forbidden", "allowed"]), numericPolicy: numericPolicySchema,
}).strict();
export const worldBlueprintSchema = z.object({
  overview: z.object({ name: z.string().trim().min(1).max(120), premise: text, tone: z.string().trim().min(1).max(500), era: text.max(280), technology: text.max(280),
    supernatural: text.max(280), usesSupernatural: z.boolean(), cultures: lines, factions: lines, history: lines }).strict(),
  ranks: worldRanksSchema,
  itemRules: itemRulesSchema,
  items: worldItemsSchema,
  region: z.object({ name: text, startId: key, locations: z.array(z.object({
    id: key, name: text.max(120), description: text, exits: z.array(key).max(8), discovery: text,
  }).strict()).min(2).max(8) }).strict(),
  characters: z.array(characterDesignSchema).min(1).max(8),
  lore: z.array(z.object({ id: key, text, kind: z.enum(["fact", "rumor", "legend", "opinion"]),
    locationId: key, visibility: z.enum(["public", "author"]), knownBy: z.array(key).max(5) }).strict()).max(12),
  opening: z.object({ text, playerRole: text }).strict(),
  hook: z.object({ id: key, name: text.max(120), description: text, locationId: key,
    acceptText: text, outcome: text, declineOutcome: text }).strict(),
  authorNotes: lines, conflicts: lines,
}).strict().refine((value) => JSON.stringify(value).length <= 50000, "世界草稿不能超过50000字符。");
export type WorldBrief = z.infer<typeof worldBriefSchema>;
export type WorldBlueprint = z.infer<typeof worldBlueprintSchema>;
export type WorldOrigins = Partial<Record<WorldSection, "user" | "ai">>;
export const worldOriginsSchema = z.partialRecord(worldSectionSchema, z.enum(["user", "ai"]));
export const updateWorldDraftSchema = z.object({
  expectedVersion: z.number().int().positive(), input: worldBriefSchema,
  content: worldBlueprintSchema.nullable(), lockedSections: z.array(worldSectionSchema).max(WORLD_SECTIONS.length),
}).strict();
export const generateWorldSchema = z.object({ expectedVersion: z.number().int().positive(), requestId: z.uuid(),
  sections: z.array(worldSectionSchema).min(1).max(WORLD_SECTIONS.length) }).strict();
export const publishWorldSchema = z.object({ expectedVersion: z.number().int().positive(),
  confirmed: z.literal(true), constraintReviewConfirmed: z.literal(true) }).strict();
export const createWorldSaveSchema = z.object({ revision: z.number().int().positive(), requestId: z.uuid() }).strict();
export class WorldDesignError extends Error {
  constructor(readonly code: "WORLD_NOT_FOUND" | "WORLD_VERSION_CONFLICT" | "WORLD_INVALID" | "WORLD_GENERATION_FAILED", message: string) { super(message); this.name = "WorldDesignError"; }
}
