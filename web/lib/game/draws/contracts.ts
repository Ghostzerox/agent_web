import { z } from "zod";
import { designKey } from "../worlds/assetContracts";
import type { ItemDesign } from "../worlds/assetContracts";

const text = z.string().trim().min(1).max(600);
const quantities = { minQuantity: z.number().int().min(1).max(99), maxQuantity: z.number().int().min(1).max(99) };
export const drawEntrySchema = z.discriminatedUnion("source", [
  z.object({ id: designKey, source: z.literal("fixed"), definitionId: designKey, weight: z.number().int().min(0).max(10000), ...quantities }).strict(),
  z.object({ id: designKey, source: z.literal("generated"), theme: text, category: z.enum(["tool", "equipment", "consumable", "material"]),
    quality: designKey, tier: designKey, rating: designKey, level: z.number().int().min(1).max(10).optional(),
    unique: z.boolean(), weight: z.number().int().min(0).max(10000), ...quantities }).strict(),
]);
export const drawPoolSchema = z.object({ id: designKey, name: text.max(120), explanation: text,
  locationId: designKey.nullable(), minTick: z.number().int().min(0).max(1000000),
  coinCost: z.number().int().min(0).max(10000), maxDraws: z.number().int().min(1).max(100), replacement: z.boolean(),
  entries: z.array(drawEntrySchema).min(1).max(20),
}).strict().superRefine((pool, ctx) => {
  if (!pool.entries.some((entry) => entry.weight > 0)) ctx.addIssue({ code: "custom", message: "卡池至少需要一个正权重条目。" });
  if (new Set(pool.entries.map((entry) => entry.id)).size !== pool.entries.length) ctx.addIssue({ code: "custom", message: "卡池条目ID重复。" });
  if (pool.entries.some((entry) => entry.minQuantity > entry.maxQuantity)) ctx.addIssue({ code: "custom", message: "数量下限不能大于上限。" });
});
export const drawPoolsSchema = z.array(drawPoolSchema).max(8).refine((pools) => new Set(pools.map((pool) => pool.id)).size === pools.length, "卡池ID重复。");
export type DrawPool = z.infer<typeof drawPoolSchema>;
export type DrawEntry = z.infer<typeof drawEntrySchema>;
export type DrawSample = { entry: DrawEntry; quantity: number; seed: string; algorithm: string };
export type DrawStatus = "sampled" | "generating" | "ready" | "failed" | "cancelled" | "settled";
export type DrawData = { templateId: string; templateVersion: string; pool: DrawPool; sample: DrawSample; keywords: string;
  item: ItemDesign | null; attempts: string[]; generationClaim: string | null; model: string | null; error: string | null };
export const prepareDrawSchema = z.object({ requestId: z.uuid(), parentTurnId: z.uuid(), expectedVersion: z.number().int().positive(), poolId: designKey,
  keywords: z.string().trim().max(600), confirmed: z.literal(true) }).strict();
export const generateDrawSchema = z.object({ attemptId: z.uuid(), confirmed: z.literal(true) }).strict();
export class DrawError extends Error {
  constructor(readonly code: "DRAW_NOT_FOUND" | "DRAW_CONFLICT" | "DRAW_INVALID", message: string) { super(message); this.name = "DrawError"; }
}
