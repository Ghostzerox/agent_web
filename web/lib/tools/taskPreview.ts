import { z } from "zod";
import { normalizeTaskSchedule, type TaskSchedule } from "@/lib/tasks/schedule";

export const previewScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("once"), runAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal("daily"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u) }).strict(),
  z.object({ type: z.literal("weekly"), weekday: z.number().int().min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u) }).strict(),
]);

export function previewTaskSchedule(schedule: TaskSchedule, after: Date, count = 5): string[] {
  previewScheduleSchema.parse(schedule);
  if (!Number.isFinite(after.getTime()) || !Number.isInteger(count) || count < 1 || count > 10) throw new Error("预览参数无效。");
  const results: string[] = [];
  let cursor = after;
  for (let index = 0; index < count; index++) {
    cursor = normalizeTaskSchedule(schedule, cursor).nextRunAt;
    results.push(cursor.toISOString());
    if (schedule.type === "once") break;
  }
  return results;
}

export function taskPreviewConflicts(candidate: { title: string; schedule: TaskSchedule }, existing: readonly { title: string; schedule: TaskSchedule }[], after: Date) {
  const times = previewTaskSchedule(candidate.schedule, after);
  return existing.flatMap((item, index) => {
    let other: string[];
    try { other = previewTaskSchedule(item.schedule, after); } catch { return []; }
    const overlaps = times.filter((instant) => other.includes(instant));
    return overlaps.length ? [{ index, title: item.title, kind: candidate.title.trim() === item.title.trim() ? "possible-duplicate" as const : "same-minute" as const, instants: overlaps }] : [];
  });
}
