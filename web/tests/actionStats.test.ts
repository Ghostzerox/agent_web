import { describe, expect, it } from "vitest";
import { habitStats, monthWindow } from "@/lib/tasks/actionStats";
import type { ActionEntry, ActionItem, HabitRule } from "@/lib/tasks/actions";
const rule: HabitRule = { effectiveFrom:"2030-01-01", cadence:"daily", weekdays:[1,2,3,4,5], timesPerWeek:5, target:20, unit:"个", paused:false };
const item: ActionItem = { id:"a", version:1, data:{ kind:"habit", title:"习惯", note:"", startsOn:rule.effectiveFrom, dueOn:null, status:"active", goalId:null, completedOn:null, rules:[rule], linkedTaskId:null } };
const entry = (day: string, state: ActionEntry["state"], value=20): ActionEntry => ({ itemId:"a", day, value, state, note:"", rule, recordedAt:"2030-01-04T00:00:00Z", backfill:true });
describe("action statistics", () => {
  it("excludes excuses, counts skipped as missed, and does not count partial quantities", () => {
    const stats=habitStats(item,[entry("2030-01-01","done"),entry("2030-01-02","excused"),entry("2030-01-03","skipped"),entry("2030-01-04","done",10)],"2030-01-01","2030-01-04","2030-01-04");
    expect(stats).toMatchObject({ planned:3, completed:1, excused:1, skipped:1, cumulativeDays:1, rate:1/3 });
  });
  it("keeps past target snapshots, not the future edited target", () => {
    const updated=structuredClone(item); updated.data.rules.push({...rule,effectiveFrom:"2030-01-03",target:30});
    expect(habitStats(updated,[entry("2030-01-01","done"),entry("2030-01-02","done")],"2030-01-01","2030-01-02","2030-01-04").completed).toBe(2);
  });
  it("does not count future days or break streak before today ends", () => {
    const stats=habitStats(item,[entry("2030-01-01","done"),entry("2030-01-02","done")],"2030-01-01","2030-01-31","2030-01-03");
    expect(stats).toMatchObject({planned:3,completed:2,streak:2,longest:2});
  });
  it("keeps weekly quotas separate and unfinished weeks open", () => {
    const weekly=structuredClone(item); weekly.data.rules=[{...rule,cadence:"weekly-count",effectiveFrom:"2030-01-07",timesPerWeek:3}]; weekly.data.startsOn="2030-01-07";
    const entries=["2030-01-07","2030-01-08","2030-01-09"].map((d)=>({...entry(d,"done"),rule:weekly.data.rules[0]}));
    const stats=habitStats(weekly,entries,"2030-01-07","2030-01-13","2030-01-09");
    expect(stats.rate).toBeNull(); expect(stats.weeks[0]).toMatchObject({completed:3,target:3,closed:false});
  });
  it("returns a Monday aligned leap month window",()=>{expect(monthWindow("2032-02")).toMatchObject({first:"2032-02-01",last:"2032-02-29"});});
});
