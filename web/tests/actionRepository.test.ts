import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, type MigrationSession } from "@/lib/db/migrations";
import { createActionRepository } from "@/lib/repositories/actionRepository";
import { createActionApi } from "@/lib/api/actionApi";
import { businessDay, daySchema, type ActionCommand, type ActionDefinition } from "@/lib/tasks/actions";
import { createTaskRepository } from "@/lib/repositories/taskRepository";
import { createSchedulerRepository } from "@/lib/repositories/schedulerRepository";
import { createInboxRepository } from "@/lib/repositories/inboxRepository";
import { runReminderBatch } from "@/lib/tasks/reminderWorker";
import { annotateActionReminders } from "@/lib/tasks/actionReminders";
const now = new Date("2030-01-02T08:00:00Z");
const definition = (title = "行动"): ActionDefinition => ({ kind: "todo", title, note: "", startsOn: "2030-01-02", dueOn: null, status: "active", goalId: null, completedOn: null, rules: [], linkedTaskId: null });
describe("action facts and CAS", () => {
  let pg: PGlite; let repo: ReturnType<typeof createActionRepository>;
  beforeAll(async () => {
    pg = new PGlite();
    const session = (db: Pick<PGlite, "query">): MigrationSession => ({ execute: async (q, args = []) => (await db.query(q, [...args])).rows as Record<string, unknown>[] });
    await migrateDatabase({ ...session(pg), transaction: (fn) => pg.transaction((tx) => fn(session(tx))) }, await loadMigrations());
    repo = createActionRepository(drizzle(pg, { schema }));
  });
  afterAll(async () => { await pg.close(); });
  const create = (data = definition()) => repo.mutate({ operation: "create", mutationId: crypto.randomUUID(), data }, now);
  it("has strict Shanghai dates", () => { expect(businessDay(new Date("2030-01-01T16:00:00Z"))).toBe("2030-01-02"); expect(daySchema.safeParse("2030-02-30").success).toBe(false); });
  it("records one completion without a TaskRun and supports undo", async () => {
    const item = await create();
    const done = await repo.mutate({ operation: "record", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: 1, day: "2030-01-02", value: 1, state: "done", note: "真实完成" }, now);
    expect(done.data.completedOn).toBe("2030-01-02");
    expect((await pg.query("select * from task_runs")).rows).toHaveLength(0);
    const undone = await repo.mutate({ operation: "record", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: 2, day: "2030-01-02", value: 0, state: "revoked", note: "纠正" }, now);
    expect(undone.data.completedOn).toBeNull();
    expect((await repo.read("2030-01-01", "2030-01-03", now)).entries.find((e) => e.itemId === item.id)?.state).toBe("revoked");
  });
  it("replays the same mutation once and rejects reused identifiers with different payload", async () => {
    const command: ActionCommand = { operation: "create", mutationId: crypto.randomUUID(), data: definition("幂等") };
    const first = await repo.mutate(command, now); expect((await repo.mutate(command, now)).id).toBe(first.id);
    await expect(repo.mutate({ ...command, data: definition("不同") }, now)).rejects.toThrow("操作编号");
  });
  it("rejects stale concurrent writes and future completion", async () => {
    const item = await create(); const command: ActionCommand = { operation: "record", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: 1, day: "2030-01-02", value: 1, state: "done", note: "" };
    await repo.mutate(command, now);
    await expect(repo.mutate({ ...command, mutationId: crypto.randomUUID() }, now)).rejects.toThrow("另一端");
    await expect(repo.mutate({ ...command, mutationId: crypto.randomUUID(), expectedVersion: 2, day: "2030-01-03" }, now)).rejects.toThrow("未来");
  });
  it("does not accept arbitrary owner fields or inverted API ranges", async () => {
    const api = createActionApi(repo, () => now);
    expect((await api.handle(new Request("http://localhost/api/v1/actions?from=2030-01-03&to=2030-01-01"))).status).toBe(400);
    const response = await api.handle(new Request("http://localhost/api/v1/actions", { method: "POST", body: JSON.stringify({ operation: "create", mutationId: crypto.randomUUID(), data: definition(), userId: crypto.randomUUID() }) }));
    expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("keeps a unique daily total and historical rule across future edits", async () => {
    const data = definition("背单词"); data.kind = "habit"; data.rules = [{ effectiveFrom: data.startsOn, cadence: "weekly-count", weekdays: [1,2,3,4,5], timesPerWeek: 5, target: 20, unit: "个", paused: false }];
    const item = await create(data);
    const record = { operation: "record" as const, id: item.id, expectedVersion: 1, day: "2030-01-02", value: 10, state: "done" as const, note: "" };
    await repo.mutate({ ...record, mutationId: crypto.randomUUID() }, now);
    const corrected = await repo.mutate({ ...record, expectedVersion: 2, value: 20, mutationId: crypto.randomUUID() }, now);
    await repo.mutate({ operation: "rule", id: item.id, expectedVersion: corrected.version, mutationId: crypto.randomUUID(), rule: { ...data.rules[0], effectiveFrom: "2030-01-07", target: 30 } }, now);
    const snapshot = await repo.read("2030-01-01", "2030-01-04", now), entries = snapshot.entries.filter((e) => e.itemId === item.id);
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ value: 20, rule: { target: 20 }, backfill: false });
    await expect(repo.mutate({ operation: "rule", id: item.id, expectedVersion: 4, mutationId: crypto.randomUUID(), rule: { ...data.rules[0], target: 99 } }, now)).rejects.toThrow("未来日期");
  });
  it("handles scheduled weekdays, backfill, pause and excuse without changing older rules", async () => {
    const data = definition("运动"); data.kind = "habit"; data.rules = [{ effectiveFrom: data.startsOn, cadence: "weekdays", weekdays: [3], timesPerWeek: 1, target: 30, unit: "分钟", paused: false }];
    const item = await create(data), nextDay = new Date("2030-01-03T08:00:00Z");
    const base = { operation: "record" as const, id: item.id, expectedVersion: 1, mutationId: crypto.randomUUID(), day: "2030-01-03", value: 30, state: "done" as const, note: "" };
    await expect(repo.mutate(base, nextDay)).rejects.toThrow("计划内");
    const backfilled = await repo.mutate({ ...base, day: "2030-01-02" }, nextDay);
    expect((await repo.read("2030-01-02", "2030-01-03", nextDay)).entries.find((e) => e.itemId === item.id)?.backfill).toBe(true);
    const paused = await repo.mutate({ operation: "update", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: backfilled.version, title: data.title, note: "", dueOn: null, goalId: null, status: "paused" }, nextDay);
    expect(paused.data.rules[0].paused).toBe(false); expect(paused.data.rules.at(-1)).toMatchObject({ effectiveFrom: "2030-01-04", paused: true });
    await expect(repo.mutate({ ...base, expectedVersion: paused.version, day: "2030-01-02", mutationId: crypto.randomUUID() }, nextDay)).rejects.toThrow("恢复");
  });
  it("links real steps to a goal without nesting goals or equating goal progress to task runs", async () => {
    const goal = await create({ ...definition("目标"), kind:"goal" });
    const step = await create({ ...definition("里程碑"), goalId:goal.id });
    await expect(create({ ...definition("嵌套"), kind:"goal", goalId:goal.id })).rejects.toThrow("嵌套");
    await expect(create({ ...definition("错关联"), goalId:step.id })).rejects.toThrow("目标不存在");
    const done = await repo.mutate({ operation:"record", id:step.id, expectedVersion:1, mutationId:crypto.randomUUID(), day:"2030-01-02", value:1, state:"done", note:"" },now);
    expect(done.data.goalId).toBe(goal.id);
    const snapshot=await repo.read("2030-01-01","2030-01-03",now);
    expect(snapshot.items.find((i)=>i.id===goal.id)?.data.completedOn).toBeNull();
    expect(snapshot.items.filter((i)=>i.data.goalId===goal.id && i.data.completedOn)).toHaveLength(1);
  });
  it("suppresses a linked reminder at the real Inbox boundary and restores only later runs after undo",async()=>{
    const db=drizzle(pg,{schema}), tasks=createTaskRepository(db), scheduler=createSchedulerRepository(db), inbox=createInboxRepository(db);
    const task=await tasks.create({title:"R6集成提醒",prompt:"",kind:"reminder",scheduleType:"daily",scheduleValue:{time:"20:00"},timezone:"Asia/Shanghai",nextRunAt:new Date(now.getTime()-5000)});
    const item=await create(definition("实际行动"));
    await repo.mutate({operation:"link",id:item.id,expectedVersion:1,mutationId:crypto.randomUUID(),taskId:task.id},now);
    const other=await create(definition("另一个行动"));
    await expect(repo.mutate({operation:"link",id:other.id,expectedVersion:1,mutationId:crypto.randomUUID(),taskId:task.id},now)).rejects.toThrow("已绑定");
    await repo.mutate({operation:"record",id:item.id,expectedVersion:2,mutationId:crypto.randomUUID(),day:"2030-01-02",value:1,state:"done",note:""},now);
    expect((await annotateActionReminders(db,[task],now))[0].localActionReminder?.nextRunAt).toBeNull();
    const noModel={generate:async()=>{throw new Error("No model should be called");}};
    const dependencies={scheduler,inbox,agent:noModel,briefing:noModel,books:noModel,now:()=>now};
    expect(await runReminderBatch(dependencies,{workerId:"r6-test",batchSize:20,leaseDurationMs:60000})).toMatchObject({skipped:1,completed:0});
    expect((await pg.query("select * from inbox_items where task_id=$1",[task.id])).rows).toHaveLength(0);
    await repo.mutate({operation:"record",id:item.id,expectedVersion:3,mutationId:crypto.randomUUID(),day:"2030-01-02",value:0,state:"revoked",note:""},now);
    const later=new Date("2030-01-02T12:00:01Z");
    expect(await runReminderBatch({...dependencies,now:()=>later},{workerId:"r6-test",batchSize:20,leaseDurationMs:60000})).toMatchObject({completed:1,skipped:0});
    expect((await pg.query("select * from inbox_items where task_id=$1",[task.id])).rows).toHaveLength(1);
    await tasks.delete(task.id);
    expect((await repo.read("2030-01-01","2030-01-03",now)).items.find((i)=>i.id===item.id)).toBeDefined();
  });
  it("exports real correction history without including credential or chat fields",async()=>{
    const exported=await repo.export("2030-01-01","2030-01-03",now);
    expect(exported.format).toBe("ai-study-companion.actions");expect(exported.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(exported)).not.toContain("apiKey");expect(exported).not.toHaveProperty("conversations");
  });
});
