import { z } from "zod";
import type { MemorizationMaterial, MemorizationUnit } from "./domain";
import { createSeededRandom } from "@/lib/shared/random";

export type RecallStrategy = "random" | "weak" | "due" | "ordered";
export function sampleRecallUnits(units: readonly MemorizationUnit[], strategy: RecallStrategy, seed: string, now: Date, count: number) {
  z.enum(["random", "weak", "due", "ordered"]).parse(strategy);
  z.string().min(1).max(120).parse(seed);
  z.number().int().min(1).max(24).parse(count);
  if (!Number.isFinite(now.getTime())) throw new Error("抽测时间无效。");
  const ranked = units.map((unit, index) => ({ unit, index, tie: Math.floor(createSeededRandom(`${seed}:${unit.id}`)() * 100) + 1 }));
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
