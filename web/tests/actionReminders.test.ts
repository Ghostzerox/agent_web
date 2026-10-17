import { describe, expect, it, vi } from "vitest";
import { suppressActionReminder } from "@/lib/tasks/actionReminders";
import { syncActionNotifications } from "@/lib/notifications/actionNotificationSync";
import { localReminderFromTask } from "@/lib/notifications/localTaskNotifications";
import type { ActionItem, ActionEntry } from "@/lib/tasks/actions";
import type { TaskRecord } from "@/lib/api/taskClient";
import type { LocalNotificationAdapter, LocalReminderSnapshot } from "@/lib/platform/capabilities";
const item: ActionItem={id:"a",version:1,data:{kind:"habit",title:"背单词",note:"",startsOn:"2030-01-01",dueOn:null,status:"active",goalId:null,completedOn:null,linkedTaskId:"t",rules:[{effectiveFrom:"2030-01-01",cadence:"daily",weekdays:[1,2,3,4,5],timesPerWeek:5,target:20,unit:"个",paused:false}]}};
const entry: ActionEntry={itemId:"a",day:"2030-01-02",value:20,state:"done",note:"",rule:item.data.rules[0],recordedAt:"2030-01-02T00:00:00Z",backfill:false};
describe("action reminder eligibility",()=>{
  it("suppresses completed/excused/skipped days and restores revoked days",()=>{
    expect(suppressActionReminder(item,[entry],entry.day)).toBe(true);
    for(const state of ["skipped","excused"] as const) expect(suppressActionReminder(item,[{...entry,state}],entry.day)).toBe(true);
    expect(suppressActionReminder(item,[{...entry,state:"revoked"}],entry.day)).toBe(false);
    expect(suppressActionReminder(item,[{...entry,value:10}],entry.day)).toBe(false);
    expect(suppressActionReminder(item,[entry],"2030-01-03")).toBe(false);
  });
  it("suppresses paused actions and exhausted weekly quotas",()=>{
    expect(suppressActionReminder({...item,data:{...item.data,status:"paused"}},[],entry.day)).toBe(true);
    const weekly={...item,data:{...item.data,rules:[{...item.data.rules[0],cadence:"weekly-count" as const,timesPerWeek:1}]}};
    expect(suppressActionReminder(weekly,[entry],"2030-01-03")).toBe(true);
  });
  it("honors a to-do's explicit skipped day without mutating its scheduler",()=>{
    const todo={...item,data:{...item.data,kind:"todo" as const,rules:[]}};
    expect(suppressActionReminder(todo,[{...entry,rule:null,state:"skipped"}],entry.day)).toBe(true);
    expect(suppressActionReminder(todo,[{...entry,rule:null,state:"skipped"}],"2030-01-03")).toBe(false);
  });
  it("uses one-shot eligible snapshots instead of repeating a stale daily alarm",()=>{
    const task={id:"t",kind:"reminder",status:"active",title:"任务",version:1,nextRunAt:"2030-01-02T12:00:00Z",scheduleType:"daily",scheduleValue:{time:"20:00"},localActionReminder:{version:2,nextRunAt:"2030-01-03T12:00:00Z"}} as TaskRecord;
    expect(localReminderFromTask(task)).toMatchObject({scheduledAt:"2030-01-03T12:00:00.000Z",recurrence:undefined});
    expect(localReminderFromTask({...task,localActionReminder:{version:3,nextRunAt:null}})).toBeNull();
  });
  it("removes a stale cached alarm even if the post-write network refresh fails",async()=>{
    let reminders:LocalReminderSnapshot[]=[{taskId:"t",occurrenceId:"old",title:"提醒",body:"",scheduledAt:"2030-01-02T12:00:00Z",deepLink:"/tasks"}];
    const adapter:LocalNotificationAdapter={checkPermission:async()=>"granted",requestPermission:async()=>"granted",reconcile:vi.fn(async()=>({scheduled:0,cancelled:1,pending:0}))};
    const cache={read:async()=>({savedAt:"2030-01-02T00:00:00Z",reminders}),write:async(next:readonly LocalReminderSnapshot[])=>{reminders=[...next];return "now";}};
    await expect(syncActionNotifications(adapter,["t"],async()=>{throw new Error("offline");},cache)).rejects.toThrow("offline");
    expect(reminders).toEqual([]);expect(adapter.reconcile).toHaveBeenCalledWith([]);
  });
});
