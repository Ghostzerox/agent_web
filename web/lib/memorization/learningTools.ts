import { z } from "zod";
import type { MemorizationMaterial, MemorizationUnit } from "./domain";
import { rollGameDice } from "@/lib/game/dice";

export const spellingOptionsSchema = z.object({
  caseSensitive: z.boolean().default(true), ignorePunctuation: z.boolean().default(false),
  ignoreWhitespace: z.boolean().default(false),
}).strict();
export const spellingResultSchema = z.object({
  exact: z.boolean(), score: z.number().int().min(0).max(100), distance: z.number().int().nonnegative(),
  changes: z.array(z.object({ kind: z.enum(["insert", "delete", "replace"]), expected: z.string(), actual: z.string(), targetStart: z.number().int(), targetEnd: z.number().int(), actualStart: z.number().int(), actualEnd: z.number().int() }).strict()).max(60),
  truncated: z.boolean(), options: spellingOptionsSchema,
}).strict();
export type SpellingResult = z.infer<typeof spellingResultSchema>;

function tokens(text: string, options: z.infer<typeof spellingOptionsSchema>) {
  let offset = 0;
  return Array.from(text).flatMap((character) => {
    const start = offset; offset += character.length;
    if ((options.ignorePunctuation && /\p{P}/u.test(character)) || (options.ignoreWhitespace && /\s/u.test(character))) return [];
    return [{ value: options.caseSensitive ? character : character.toLocaleLowerCase("en-US"), original: character, start, end: offset }];
  });
}

export function checkSpelling(target: string, actual: string, rawOptions: unknown = {}): SpellingResult {
  const options = spellingOptionsSchema.parse(rawOptions);
  const left = tokens(target, options); const right = tokens(actual, options);
  if (left.length > 2000 || right.length > 2000) throw new z.ZodError([{ code: "custom", path: ["recitation"], message: "逐字检查每次最多 2000 个有效字符，请拆分单元。" }]);
  const width = right.length + 1;
  const distance = new Uint16Array((left.length + 1) * width);
  for (let i = 0; i <= left.length; i++) distance[i * width] = i;
  for (let j = 0; j <= right.length; j++) distance[j] = j;
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    distance[i * width + j] = Math.min(distance[(i - 1) * width + j] + 1, distance[i * width + j - 1] + 1, distance[(i - 1) * width + j - 1] + Number(left[i - 1].value !== right[j - 1].value));
  }
  const changes: SpellingResult["changes"] = [];
  let i = left.length; let j = right.length;
  while (i || j) {
    if (i && j && left[i - 1].value === right[j - 1].value) { i--; j--; continue; }
    const replace = i && j && distance[i * width + j] === distance[(i - 1) * width + j - 1] + 1;
    const remove = !replace && i && distance[i * width + j] === distance[(i - 1) * width + j] + 1;
    const expected = replace || remove ? left[i - 1] : null;
    const given = replace || !remove ? right[j - 1] : null;
    const targetAt = left[i]?.start ?? target.length;
    const actualAt = right[j]?.start ?? actual.length;
    changes.push({ kind: replace ? "replace" : remove ? "delete" : "insert", expected: expected?.original ?? "", actual: given?.original ?? "", targetStart: expected?.start ?? targetAt, targetEnd: expected?.end ?? targetAt, actualStart: given?.start ?? actualAt, actualEnd: given?.end ?? actualAt });
    if (replace || remove) i--;
    if (replace || !remove) j--;
  }
  changes.reverse();
  const count = distance[left.length * width + right.length];
  return spellingResultSchema.parse({ exact: count === 0, score: Math.round((1 - count / Math.max(left.length, right.length, 1)) * 100), distance: count, changes: changes.slice(0, 60), truncated: changes.length > 60, options });
}

export type RecallStrategy = "random" | "weak" | "due" | "ordered";
export function sampleRecallUnits(units: readonly MemorizationUnit[], strategy: RecallStrategy, seed: string, now: Date, count: number) {
  z.enum(["random", "weak", "due", "ordered"]).parse(strategy);
  z.string().min(1).max(120).parse(seed);
  z.number().int().min(1).max(24).parse(count);
  if (!Number.isFinite(now.getTime())) throw new Error("抽测时间无效。");
  const ranked = units.map((unit, index) => ({ unit, index, tie: rollGameDice({ count: 1, sides: 100, modifier: 0, purpose: "抽测排序" }, `${seed}:${unit.id}`).total }));
  ranked.sort((a, b) => {
    if (strategy === "ordered") return a.index - b.index;
    if (strategy === "weak") { const delta = (a.unit.lastScore ?? -1) - (b.unit.lastScore ?? -1); if (delta) return delta; }
    if (strategy === "due") {
      const priority = (unit: MemorizationUnit) => !unit.nextReviewAt ? 0 : new Date(unit.nextReviewAt) <= now ? 1 : 2;
      const delta = priority(a.unit) - priority(b.unit); if (delta) return delta;
      const timeDelta = new Date(a.unit.nextReviewAt ?? 0).getTime() - new Date(b.unit.nextReviewAt ?? 0).getTime(); if (timeDelta) return timeDelta;
    }
    return a.tie - b.tie || a.unit.id.localeCompare(b.unit.id);
  });
  return ranked.slice(0, count).map(({ unit }) => ({ unitId: unit.id, reason: strategy === "weak" ? unit.lastScore === null ? "未测单元优先" : `上次 ${unit.lastScore} 分，低分优先` : strategy === "due" ? !unit.nextReviewAt ? "尚未复习" : new Date(unit.nextReviewAt) <= now ? "已到复习时间" : "未到期，作为候补" : strategy === "ordered" ? "按材料原顺序" : "同一 seed、单元 ID 与版本可复现的随机顺序" }));
}

export const materialTransferSchema = z.object({
  format: z.literal("agent-web/memorization-v1"), title: z.string().trim().min(1).max(120), sourceText: z.string().trim().min(1).max(6000),
  units: z.array(z.object({ cue: z.string().trim().min(1).max(160), content: z.string().trim().min(1).max(3000) }).strict()).min(1).max(24),
}).strict();

export function exportMaterial(material: MemorizationMaterial) {
  return materialTransferSchema.parse({ format: "agent-web/memorization-v1", title: material.title, sourceText: material.sourceText, units: material.units.map(({ cue, content }) => ({ cue, content })) });
}
