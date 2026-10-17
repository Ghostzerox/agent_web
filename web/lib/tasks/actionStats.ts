import { isPlanned, ruleFor, shiftDay, weekStart, type ActionEntry, type ActionItem } from "./actions";
export function datesBetween(from: string, to: string): string[] {
  const result: string[] = []; for (let day = from; day <= to && result.length < 380; day = shiftDay(day, 1)) result.push(day); return result;
}
export function monthWindow(month: string) {
  const first = `${month}-01`, next = new Date(`${first}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const last = shiftDay(next.toISOString().slice(0,10), -1);
  return { first, last, from: weekStart(first), to: shiftDay(weekStart(last), 6) };
}
export function achieved(entry: ActionEntry | undefined): boolean { return Boolean(entry?.state === "done" && entry.rule && entry.value >= entry.rule.target); }
export function habitStats(item: ActionItem, entries: ActionEntry[], from: string, to: string, today: string) {
  const own = entries.filter((e) => e.itemId === item.id), byDay = new Map(own.map((e) => [e.day, e]));
  const end = to < today ? to : today;
  let planned = 0, completed = 0, excused = 0, skipped = 0, streak = 0, longest = 0;
  const weeks: { start: string; target: number; completed: number; closed: boolean; mode: "weekly-count" }[] = [];
  for (const day of datesBetween(from, end)) {
    const entry = byDay.get(day), rule = entry?.state !== "revoked" && entry?.rule ? entry.rule : ruleFor(item, day);
    if (!isPlanned(item, day, rule)) continue;
    if (rule?.cadence === "weekly-count") continue;
    if (entry?.state === "excused") { excused++; continue; }
    planned++;
    if (achieved(entry)) { completed++; streak++; longest = Math.max(longest, streak); }
    else { if (entry?.state === "skipped") skipped++; if (day < today || entry?.state === "skipped") streak = 0; }
  }
  for (let start = weekStart(from); start <= end; start = shiftDay(start, 7)) {
    const days = datesBetween(start, shiftDay(start, 6));
    const eligible = days.filter((day) => isPlanned(item, day) && ruleFor(item, day)?.cadence === "weekly-count");
    if (!eligible.length || !eligible.some((day) => day >= from && day <= to)) continue;
    const rule = ruleFor(item, eligible[0])!;
    const available = eligible.filter((day) => byDay.get(day)?.state !== "excused");
    const target = Math.min(rule.timesPerWeek, available.length);
    const done = available.filter((day) => day <= today && achieved(byDay.get(day))).length;
    const closed = shiftDay(start, 6) < today;
    weeks.push({ start, target, completed: done, closed, mode: "weekly-count" });
  }
  let weeklyStreak = 0, longestWeeklyStreak = 0;
  for (const week of weeks) { if (!week.target) continue; if (week.completed >= week.target) { weeklyStreak++; longestWeeklyStreak = Math.max(longestWeeklyStreak, weeklyStreak); } else if (week.closed) weeklyStreak = 0; }
  return { planned, completed, excused, skipped, streak, longest, weeklyStreak, longestWeeklyStreak, rate: planned ? completed / planned : null, cumulativeDays: own.filter((e) => e.day >= from && e.day <= end && achieved(e)).length, weeks };
}
