import { z } from "zod";
import { stableJson } from "@/lib/ai/stableJson";
import { sampleRecallUnits, type RecallStrategy } from "@/lib/memorization/learningTools";
import type { MemorizationUnit } from "@/lib/memorization/domain";
export const PALACE_MODULES = ["professional", "companion", "reflection", "news", "reading", "tasks", "memorization", "problem-solving", "game"] as const;
export const palaceSourceInputSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("memory"), id: z.uuid() }).strict(), z.object({ kind: z.literal("knowledge"), id: z.uuid() }).strict(), z.object({ kind: z.literal("unit"), id: z.uuid(), unitId: z.uuid() }).strict()]);
export type PalaceSourceInput = z.infer<typeof palaceSourceInputSchema>;
export const palaceBindingSchema = z.object({ source: palaceSourceInputSchema, revision: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const locusSchema = z.object({ id: z.uuid(), label: z.string().trim().min(1).max(100), association: z.string().max(500), binding: palaceBindingSchema }).strict();
export const palaceRoomSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(100), module: z.enum(PALACE_MODULES), loci: z.array(locusSchema).max(24) }).strict();
export type PalaceRoom = z.infer<typeof palaceRoomSchema>;
export type PalaceLocus = z.infer<typeof locusSchema>;
export const createPalaceSchema = z.object({ title: z.string().trim().min(1).max(120), purpose: z.enum(["navigation", "learning"]) }).strict();
const versioned = { expectedVersion: z.number().int().positive() };
export const palaceOperationSchema = z.discriminatedUnion("operation", [
  z.object({ ...versioned, operation: z.literal("rename"), title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ ...versioned, operation: z.literal("add-room"), title: z.string().trim().min(1).max(100), module: z.enum(PALACE_MODULES) }).strict(),
  z.object({ ...versioned, operation: z.literal("rename-room"), roomId: z.uuid(), title: z.string().trim().min(1).max(100) }).strict(),
  z.object({ ...versioned, operation: z.literal("delete-room"), roomId: z.uuid() }).strict(),
  z.object({ ...versioned, operation: z.literal("add-locus"), roomId: z.uuid(), label: z.string().trim().min(1).max(100), association: z.string().max(500), source: palaceSourceInputSchema }).strict(),
  z.object({ ...versioned, operation: z.literal("edit-locus"), locusId: z.uuid(), label: z.string().trim().min(1).max(100), association: z.string().max(500) }).strict(),
  z.object({ ...versioned, operation: z.literal("rebind"), locusId: z.uuid(), source: palaceSourceInputSchema }).strict(),
  z.object({ ...versioned, operation: z.literal("delete-locus"), locusId: z.uuid() }).strict(),
  z.object({ ...versioned, operation: z.literal("move-locus"), locusId: z.uuid(), direction: z.enum(["up", "down"]) }).strict(),
]);
export type PalaceOperation = z.infer<typeof palaceOperationSchema>;
export type PalaceView = { id: string; title: string; purpose: "navigation" | "learning"; rooms: PalaceRoom[]; version: number };
export class PalaceError extends Error { constructor(message: string, readonly status = 409) { super(message); this.name = "PalaceError"; } }
export function palaceRoomForLocus(palace: PalaceView, locusId: string) { const room = palace.rooms.find((value) => value.loci.some((locus) => locus.id === locusId)); if (!room) throw new PalaceError("位置已删除或不属于本宫殿。", 404); return room; }
export function assertPalaceSource(purpose: PalaceView["purpose"], module: PalaceRoom["module"], source: PalaceSourceInput) {
  if (purpose === "learning" && (module !== "memorization" || source.kind !== "unit")) throw new PalaceError("学习宫殿只关联已授权的背书单元，不复制个人记忆或游戏剧情。", 403);
  if (source.kind === "memory" && !["professional", "companion", "reflection"].includes(module)) throw new PalaceError("本房间不能读取个人事实。", 403);
  if (source.kind === "knowledge" && module === "companion") throw new PalaceError("陪伴域不读取知识集合。", 403);
  if (source.kind === "unit" && module !== "memorization") throw new PalaceError("背书材料只能关联背书域。", 403);
}
export function validateLayout(rooms: PalaceRoom[]) {
  z.array(palaceRoomSchema).max(6).parse(rooms);
  const ids = rooms.flatMap((room) => [room.id, ...room.loci.map((locus) => locus.id)]);
  if (new Set(ids).size !== ids.length) throw new PalaceError("房间和位置ID必须唯一。");
  for (const room of rooms) { const sources = room.loci.map((locus) => stableJson(locus.binding.source)); if (new Set(sources).size !== sources.length) throw new PalaceError("同一房间不能重复关联同一来源。"); }
  if (new TextEncoder().encode(JSON.stringify(rooms)).length > 128000) throw new PalaceError("宫殿布局超过128KB，请拆分。", 413);
}
export function orderPalaceRecall(items: { locus: PalaceLocus; unit: MemorizationUnit }[], strategy: RecallStrategy, seed: string, now: Date, count: number) {
  const plan = sampleRecallUnits(items.map(({ locus, unit }) => ({ ...unit, id: locus.id })), strategy, seed, now, count);
  return plan.map((step) => { const item = items.find(({ locus }) => locus.id === step.unitId)!; return { locusId: item.locus.id, label: item.locus.label, association: item.locus.association, cue: item.unit.cue, reason: step.reason }; });
}

export type PalaceSourceView = { status: "ready" | "changed" | "missing" | "expired"; revision?: string; title?: string; text?: string; url?: string; useCount?: number; lastUsedAt?: string | null; unit?: MemorizationUnit; storageVersion?: number };
export type PalaceCatalog = { memories: { id: string; title: string }[]; documents: { id: string; title: string }[]; materials: import("@/lib/memorization/domain").MemorizationMaterialSummary[]; truncated: boolean };
export type PalaceRecallPlan = { version: number; steps: ReturnType<typeof orderPalaceRecall>; blocked: string[] };
