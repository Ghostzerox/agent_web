import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { businessDay, isPlanned, ruleFor, shiftDay, weekStart, type ActionEntry, type ActionItem } from "./actions";
import { normalizeTaskSchedule, scheduleFromStored } from "./schedule";
import { achieved } from "./actionStats";
export class ActionReminderSuppressed extends Error { readonly code = "ACTION_REMINDER_SUPPRESSED"; }
export function suppressActionReminder(item: ActionItem, entries: ActionEntry[], day: string): boolean {
  if (item.data.status !== "active" || day < item.data.startsOn) return true;
  const own = entries.filter((e) => e.itemId === item.id), entry = own.find((e) => e.day === day);
  if (entry?.state === "excused" || entry?.state === "skipped" || achieved(entry)) return true;
  if (item.data.kind === "todo") return Boolean(item.data.completedOn);
  if (!isPlanned(item, day)) return true;
  const rule = ruleFor(item, day);
  if (rule?.cadence === "weekly-count") {
    const start = weekStart(day), end = shiftDay(start,6), days: string[] = [];
    for (let d = start; d <= end; d = shiftDay(d,1)) if (isPlanned(item,d) && ruleFor(item,d)?.cadence === "weekly-count") days.push(d);
    const available = days.filter((d) => own.find((e) => e.day === d)?.state !== "excused");
    return own.filter((e) => available.includes(e.day) && achieved(e)).length >= Math.min(rule.timesPerWeek, available.length);
  }
  return false;
}
export async function linkedAction<T extends PgQueryResultHKT>(db: PgDatabase<T,typeof schema>, taskId: string) {
  const [item] = await db.select().from(schema.actionItems).where(and(eq(schema.actionItems.userId,LOCAL_USER_ID),sql`${schema.actionItems.data}->>'linkedTaskId' = ${taskId}`)).limit(1);
  if (!item) return null;
  const rows = await db.select().from(schema.actionEntries).where(eq(schema.actionEntries.itemId,item.id));
  return { item, entries: rows.map((r)=>r.data) };
}
export async function assertReminderActionPending<T extends PgQueryResultHKT>(db: PgDatabase<T,typeof schema>, taskId: string, scheduledFor: Date) {
  const linked = await linkedAction(db,taskId);
  if (linked && suppressActionReminder(linked.item,linked.entries,businessDay(scheduledFor))) throw new ActionReminderSuppressed("Reminder skipped by the linked user's action state.");
}
export type LocalActionReminder = { version: number; nextRunAt: string | null };
export async function annotateActionReminders<T extends PgQueryResultHKT>(db: PgDatabase<T,typeof schema>, tasks: schema.ScheduledTaskRecord[], now=new Date()) {
  const result: (schema.ScheduledTaskRecord & {localActionReminder?:LocalActionReminder})[] = [];
  for (const task of tasks) {
    if (task.kind !== "reminder" || task.status !== "active" || !task.nextRunAt) { result.push(task); continue; }
    const linked = await linkedAction(db,task.id);
    if (!linked) { result.push(task); continue; }
    let next: Date | null = task.nextRunAt;
    if (linked.item.data.status !== "active" || linked.item.data.completedOn) next = null;
    else {
      const schedule = scheduleFromStored(task.scheduleType,task.scheduleValue);
      const start = new Date(`${linked.item.data.startsOn}T00:00:00+08:00`).getTime() - 1;
      if (schedule.type !== "once") next = normalizeTaskSchedule(schedule,new Date(Math.max(now.getTime(),start))).nextRunAt;
      for(let attempts=0; next && (next <= now || suppressActionReminder(linked.item,linked.entries,businessDay(next))); attempts++) {
        if(schedule.type === "once" || attempts >= 399) { next=null; break; }
        next=normalizeTaskSchedule(schedule,next).nextRunAt;
      }
    }
    result.push({...task,localActionReminder:{version:linked.item.version,nextRunAt:next?.toISOString() ?? null}});
  }
  return result;
}
