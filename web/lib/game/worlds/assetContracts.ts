import { z } from "zod";
import { attributeRuleSchema, characterPersonaSchema, worldItemSchema } from "../exploration/contracts";

const text = z.string().trim().min(1).max(600);
// Runtime keys allow 60 characters; leave ten for derived IDs such as "-discovery".
export const MAX_DESIGN_KEY_LENGTH = 50;
export const designKey = z.string().max(MAX_DESIGN_KEY_LENGTH, "引用标识最多50字符").regex(/^[a-z][a-z0-9-]*$/u)
  .refine((id) => !["player", "host", "constructor", "prototype"].includes(id));
const personKey = z.union([z.literal("player"), designKey]);
export const itemRulesSchema = z.object({ slots: z.array(designKey).max(8), attributes: z.array(attributeRuleSchema).max(8) }).strict();
export const characterProfileSchema = characterPersonaSchema.extend({ faction: text, appearance: text, publicBackground: text,
  usesSupernatural: z.boolean(), secrets: z.array(z.object({ text, kind: z.enum(["fact", "rumor", "legend", "opinion"]), knownBy: z.array(designKey).max(8) }).strict()).max(4),
  authorNotes: z.array(text).max(4) }).strict();
export const characterDesignSchema = z.object({ kind: z.literal("character"), id: personKey, category: z.enum(["npc", "important", "player"]),
  name: text.max(120), identity: text, locationId: designKey, goal: text, personality: text, speech: text, profile: characterProfileSchema }).strict();
export const itemDesignSchema = worldItemSchema.omit({ details: true }).extend({ kind: z.literal("item"), id: designKey,
  name: text.max(120), abilities: z.array(text.max(120)).max(3), details: worldItemSchema.shape.details.unwrap(), usesSupernatural: z.boolean(),
  useEffect: z.object({ locationId: designKey.nullable(), requiresCondition: text.max(120).nullable(), addCondition: text.max(120).nullable(), removeCondition: text.max(120).nullable() }).strict().nullable(),
}).strict();
export const assetDesignContentSchema = z.discriminatedUnion("kind", [itemDesignSchema, characterDesignSchema]).refine((value) => JSON.stringify(value).length <= 15000, "单个设计不能超过15000字符。");
export type AssetDesignContent = z.infer<typeof assetDesignContentSchema>;
export type ItemDesign = z.infer<typeof itemDesignSchema>;
export type CharacterDesign = z.infer<typeof characterDesignSchema>;
export const worldItemsSchema = z.object({ definitions: z.array(itemDesignSchema).max(20), placements: z.array(z.object({
  id: designKey, definitionId: designKey, owner: personKey, quantity: z.number().int().min(1).max(999),
}).strict()).max(40) }).strict();
export const ASSET_FIELDS = ["name", "description", "quality", "tier", "rating", "level", "stackable", "unique", "slot", "abilities", "consumable", "price", "details", "usesSupernatural", "useEffect",
  "category", "identity", "locationId", "goal", "personality", "speech", "profile"] as const;
export type AssetField = typeof ASSET_FIELDS[number];
export const assetFieldSchema = z.enum(ASSET_FIELDS);
export const createAssetDesignSchema = z.object({ worldId: z.uuid(), expectedWorldVersion: z.number().int().positive(), kind: z.enum(["item", "character"]),
  targetId: personKey.optional(), brief: z.string().trim().min(1).max(2000) }).strict();
export const updateAssetDesignSchema = z.object({ expectedVersion: z.number().int().positive(), brief: z.string().trim().min(1).max(2000),
  content: assetDesignContentSchema, lockedFields: z.array(assetFieldSchema).max(ASSET_FIELDS.length) }).strict();
export const generateAssetDesignSchema = z.object({ expectedVersion: z.number().int().positive(), requestId: z.uuid(),
  fields: z.array(assetFieldSchema).min(1).max(ASSET_FIELDS.length) }).strict();
export const confirmAssetDesignSchema = z.object({ expectedVersion: z.number().int().positive(), expectedWorldVersion: z.number().int().positive(), confirmed: z.literal(true) }).strict();
export function blankCharacterProfile(): z.infer<typeof characterProfileSchema> {
  return { faction: "尚未表明阵营", appearance: "尚未描述外貌", publicBackground: "你尚未了解此人的过往。", privateBackground: "待设计的本人经历",
    values: [], boundaries: ["不替玩家决定思想与选择"], abilities: [], needs: [], longTermGoal: "待设计的长期目标", relationships: [], secrets: [], authorNotes: [], usesSupernatural: false };
}
