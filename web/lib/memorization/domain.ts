import { z } from "zod";
import { spellingResultSchema } from "./learningTools";

export const MEMORIZATION_PLUGIN_ID = "study.memorization";
export const MAX_MEMORIZATION_MATERIALS = 12;
export const MAX_MEMORIZATION_UNITS = 24;

export const memorizationUnitInputSchema = z
  .object({
    cue: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(3_000),
  })
  .strict();

export const memorizationAttemptSchema = z
  .object({
    id: z.string().uuid(),
    unitId: z.string().uuid(),
    score: z.number().int().min(0).max(100),
    localScore: z.number().int().min(0).max(100),
    source: z.enum(["model", "deterministic"]),
    mode: z.enum(["semantic", "verbatim"]).optional(),
    spelling: spellingResultSchema.optional(),
    feedback: z.string().max(800),
    missedPoints: z.array(z.string().max(180)).max(6),
    reviewedAt: z.string().datetime(),
    nextReviewAt: z.string().datetime(),
  })
  .strict();

export const memorizationUnitSchema = memorizationUnitInputSchema.extend({
  id: z.string().uuid(),
  reviewCount: z.number().int().nonnegative(),
  lastScore: z.number().int().min(0).max(100).nullable(),
  nextReviewAt: z.string().datetime().nullable(),
  weakPoints: z.array(z.string().max(180)).max(6),
});

export const memorizationMaterialSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    sourceText: z.string().trim().min(1).max(6_000),
    units: z.array(memorizationUnitSchema).min(1).max(MAX_MEMORIZATION_UNITS),
    attempts: z.array(memorizationAttemptSchema).max(40),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const memorizationMaterialSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    unitCount: z.number().int().positive(),
    reviewedUnitCount: z.number().int().nonnegative(),
    averageScore: z.number().int().min(0).max(100).nullable(),
    nextReviewAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type MemorizationUnitInput = z.infer<typeof memorizationUnitInputSchema>;
export type MemorizationUnit = z.infer<typeof memorizationUnitSchema>;
export type MemorizationMaterial = z.infer<typeof memorizationMaterialSchema>;
export type MemorizationMaterialSummary = z.infer<
  typeof memorizationMaterialSummarySchema
>;

function compact(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function splitLongChunk(chunk: string): string[] {
  if (chunk.length <= 320) return [chunk];
  const sentences = chunk.split(/(?<=[。！？!?；;])/u).map(compact).filter(Boolean);
  if (sentences.length <= 1) {
    return Array.from({ length: Math.ceil(chunk.length / 280) }, (_, index) =>
      chunk.slice(index * 280, (index + 1) * 280).trim(),
    ).filter(Boolean);
  }
  const result: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 320) {
      result.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) result.push(current);
  return result;
}

export function splitMemorizationText(sourceText: string): MemorizationUnitInput[] {
  const normalized = sourceText.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n\s*\n|\n(?=(?:\d+[.、]|[一二三四五六七八九十]+[、.]))/u)
    .map(compact)
    .filter(Boolean)
    .flatMap(splitLongChunk)
    .slice(0, MAX_MEMORIZATION_UNITS);
  return paragraphs.map((content, index) => ({
    cue: `第 ${index + 1} 单元 · ${content.slice(0, 24)}${content.length > 24 ? "…" : ""}`,
    content,
  }));
}

function normalizedCharacters(value: string): string[] {
  return Array.from(
    value
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[^\p{Letter}\p{Number}]+/gu, ""),
  );
}

function ngrams(value: string, width: number): Map<string, number> {
  const characters = normalizedCharacters(value);
  const result = new Map<string, number>();
  if (characters.length < width) {
    if (characters.length) result.set(characters.join(""), 1);
    return result;
  }
  for (let index = 0; index <= characters.length - width; index += 1) {
    const gram = characters.slice(index, index + width).join("");
    result.set(gram, (result.get(gram) ?? 0) + 1);
  }
  return result;
}

export function scoreRecitation(target: string, recitation: string): number {
  const expected = ngrams(target, 2);
  const actual = ngrams(recitation, 2);
  const expectedCount = [...expected.values()].reduce((sum, count) => sum + count, 0);
  const actualCount = [...actual.values()].reduce((sum, count) => sum + count, 0);
  if (!expectedCount || !actualCount) return 0;
  let overlap = 0;
  for (const [gram, count] of expected) {
    overlap += Math.min(count, actual.get(gram) ?? 0);
  }
  const recall = overlap / expectedCount;
  const precision = overlap / actualCount;
  return Math.round((recall * 0.72 + precision * 0.28) * 100);
}

export function reviewIntervalDays(score: number): number {
  if (score < 60) return 1;
  if (score < 80) return 3;
  if (score < 90) return 7;
  return 14;
}

export function nextReviewInstant(reviewedAt: Date, score: number): Date {
  const next = new Date(reviewedAt);
  next.setUTCDate(next.getUTCDate() + reviewIntervalDays(score));
  return next;
}

export function summarizeMaterial(
  material: MemorizationMaterial,
): MemorizationMaterialSummary {
  const reviewed = material.units.filter((unit) => unit.lastScore !== null);
  const nextDates = material.units
    .map((unit) => unit.nextReviewAt)
    .filter((value): value is string => value !== null)
    .sort();
  return {
    id: material.id,
    title: material.title,
    unitCount: material.units.length,
    reviewedUnitCount: reviewed.length,
    averageScore: reviewed.length
      ? Math.round(
          reviewed.reduce((sum, unit) => sum + (unit.lastScore ?? 0), 0) /
            reviewed.length,
        )
      : null,
    nextReviewAt: nextDates[0] ?? null,
    updatedAt: material.updatedAt,
  };
}

export function materialStorageKey(id: string): string {
  return `memorization/materials/${id}`;
}
