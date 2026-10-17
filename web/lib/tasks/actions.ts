import { z } from "zod";

export const ACTION_TIMEZONE = "Asia/Shanghai";
export function businessDay(now = new Date()): string { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function shiftDay(day: string, amount: number): string { return new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10); }
export function weekday(day: string): number { return new Date(`${day}T00:00:00Z`).getUTCDay() || 7; }
export function weekStart(day: string): string { return shiftDay(day, 1 - weekday(day)); }
export function nextRuleDay(last: string, today: string, weekly: boolean): string { const next=shiftDay(last>today?last:today,1); return weekly?shiftDay(next,(8-weekday(next))%7):next; }
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => { const n = new Date(`${s}T00:00:00Z`); return Number.isFinite(n.getTime()) && n.toISOString().slice(0, 10) === s; }, "日期无效");
export const habitRuleSchema = z.object({
  effectiveFrom: daySchema, cadence: z.enum(["daily", "weekdays", "weekly-count"]),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine((a) => new Set(a).size === a.length),
  timesPerWeek: z.number().int().min(1).max(7), target: z.number().finite().positive().max(100000),
  unit: z.string().trim().min(1).max(20), paused: z.boolean(),
}).strict();
export type HabitRule = z.infer<typeof habitRuleSchema>;
export const actionDefinitionSchema = z.object({
  kind: z.enum(["todo", "habit", "goal"]), title: z.string().trim().min(1).max(160),
  note: z.string().trim().max(2000), startsOn: daySchema, dueOn: daySchema.nullable(),
  status: z.enum(["active", "paused", "archived"]), goalId: z.uuid().nullable(),
  completedOn: daySchema.nullable(), rules: z.array(habitRuleSchema).max(400),
  linkedTaskId: z.uuid().nullable(),
}).strict();
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;
export type ActionItem = { id: string; version: number; data: ActionDefinition };
export type ActionEntry = { itemId: string; day: string; value: number; state: "done" | "skipped" | "excused" | "revoked"; note: string; rule: HabitRule | null; recordedAt: string; backfill: boolean };
export type ActionSnapshot = { today: string; items: ActionItem[]; entries: ActionEntry[] };
const mutation = { mutationId: z.uuid() };
export const actionCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...mutation, operation: z.literal("create"), data: actionDefinitionSchema }).strict(),
  z.object({ ...mutation, operation: z.literal("update"), id: z.uuid(), expectedVersion: z.number().int().positive(), title: z.string().trim().min(1).max(160), note: z.string().trim().max(2000), dueOn: daySchema.nullable(), goalId: z.uuid().nullable(), status: z.enum(["active", "paused", "archived"]) }).strict(),
  z.object({ ...mutation, operation: z.literal("record"), id: z.uuid(), expectedVersion: z.number().int().positive(), day: daySchema, value: z.number().finite().min(0).max(100000), state: z.enum(["done", "skipped", "excused", "revoked"]), note: z.string().trim().max(2000) }).strict(),
  z.object({ ...mutation, operation: z.literal("rule"), id: z.uuid(), expectedVersion: z.number().int().positive(), rule: habitRuleSchema }).strict(),
  z.object({ ...mutation, operation: z.literal("link"), id: z.uuid(), expectedVersion: z.number().int().positive(), taskId: z.uuid().nullable() }).strict(),
]);
export type ActionCommand = z.infer<typeof actionCommandSchema>;
export class ActionError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export function ruleFor(item: ActionItem, day: string): HabitRule | null { return [...item.data.rules].reverse().find((rule) => rule.effectiveFrom <= day) ?? null; }
export function isPlanned(item: ActionItem, day: string, rule = ruleFor(item, day)): boolean {
  return item.data.kind === "habit" && day >= item.data.startsOn && Boolean(rule && !rule.paused && (rule.cadence !== "weekdays" || rule.weekdays.includes(weekday(day))));
}
export function todoState(item: ActionItem, today: string, entries: ActionEntry[] = []): string {
  const todayEntry=entries.find((e)=>e.itemId===item.id&&e.day===today);
  return item.data.status !== "active" ? item.data.status : item.data.completedOn ? "done" : todayEntry && ["skipped","excused"].includes(todayEntry.state) ? "skipped" : item.data.dueOn && item.data.dueOn < today ? "overdue" : "pending";
}
