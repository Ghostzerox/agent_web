import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createTaskRepository } from "@/lib/repositories/taskRepository";
import {
  createSchedulerRepository,
  SchedulerRepositoryError,
} from "@/lib/repositories/schedulerRepository";

describe("SchedulerRepository", () => {
  let pglite: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    database = drizzle(pglite, { schema });
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("claims a due recurring task once and skips missed backlog", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    const task = await taskRepository.create({
      title: "每日复习",
      prompt: null,
      scheduleType: "daily",
      scheduleValue: { time: "09:00" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-07T01:00:00.000Z"),
    });
    const now = new Date("2026-09-10T02:00:00.000Z");

    const first = await scheduler.claimAvailableRuns({
      workerId: "worker-a",
      now,
      leaseDurationMs: 60_000,
      limit: 10,
    });
    const second = await scheduler.claimAvailableRuns({
      workerId: "worker-b",
      now,
      leaseDurationMs: 60_000,
      limit: 10,
    });

    expect(first).toHaveLength(1);
    expect(first[0].source).toBe("new");
    expect(first[0].run).toMatchObject({
      taskId: task.id,
      status: "claimed",
      claimedBy: "worker-a",
      attempt: 1,
    });
    expect(first[0].run.scheduledFor.toISOString()).toBe(
      "2026-09-07T01:00:00.000Z",
    );
    expect(first[0].task.nextRunAt?.toISOString()).toBe(
      "2026-09-11T01:00:00.000Z",
    );
    expect(first[0].task.version).toBe(2);
    expect(second).toEqual([]);
    await expect(database.select().from(schema.taskRuns)).resolves.toHaveLength(1);
  });

  it("completes a one-time task when its run is claimed", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    await taskRepository.create({
      title: "单次任务",
      prompt: "到点提醒",
      scheduleType: "once",
      scheduleValue: { runAt: "2026-09-10T01:00:00.000Z" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-10T01:00:00.000Z"),
    });

    const [claimed] = await scheduler.claimAvailableRuns({
      workerId: "worker-a",
      now: new Date("2026-09-10T01:00:01.000Z"),
      leaseDurationMs: 60_000,
      limit: 1,
    });

    expect(claimed.task).toMatchObject({ status: "completed", nextRunAt: null });
  });

  it("repairs a due task when its unique run already exists", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    const scheduledFor = new Date("2026-09-10T01:00:00.000Z");
    const task = await taskRepository.create({
      title: "中断恢复",
      prompt: null,
      scheduleType: "once",
      scheduleValue: { runAt: scheduledFor.toISOString() },
      timezone: "Asia/Shanghai",
      nextRunAt: scheduledFor,
    });
    await database.insert(schema.taskRuns).values({
      taskId: task.id,
      scheduledFor,
      status: "claimed",
      claimedBy: "existing-worker",
      leaseExpiresAt: new Date("2026-09-10T02:00:00.000Z"),
    });

    await expect(
      scheduler.claimAvailableRuns({
        workerId: "repair-worker",
        now: new Date("2026-09-10T01:00:01.000Z"),
        leaseDurationMs: 60_000,
        limit: 1,
      }),
    ).resolves.toEqual([]);
    await expect(taskRepository.get(task.id)).resolves.toMatchObject({
      status: "completed",
      nextRunAt: null,
      version: 2,
    });
    await expect(database.select().from(schema.taskRuns)).resolves.toHaveLength(1);
  });

  it("reclaims an expired lease and fences the stale attempt", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    await taskRepository.create({
      title: "可恢复任务",
      prompt: null,
      scheduleType: "once",
      scheduleValue: { runAt: "2026-09-10T01:00:00.000Z" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-10T01:00:00.000Z"),
    });
    const [initial] = await scheduler.claimAvailableRuns({
      workerId: "worker-a",
      now: new Date("2026-09-10T01:00:00.000Z"),
      leaseDurationMs: 5_000,
      limit: 1,
    });
    const reclaimedAt = new Date("2026-09-10T01:00:06.000Z");
    const [reclaimed] = await scheduler.claimAvailableRuns({
      workerId: "worker-b",
      now: reclaimedAt,
      leaseDurationMs: 60_000,
      limit: 1,
    });

    expect(reclaimed).toMatchObject({
      source: "reclaimed",
      run: { id: initial.run.id, attempt: 2, claimedBy: "worker-b" },
    });
    await expect(
      scheduler.markRunRunning(
        initial.run.id,
        "worker-a",
        1,
        reclaimedAt,
        60_000,
      ),
    ).rejects.toMatchObject({
      code: "RUN_LEASE_LOST",
    } satisfies Partial<SchedulerRepositoryError>);

    const running = await scheduler.markRunRunning(
      reclaimed.run.id,
      "worker-b",
      2,
      reclaimedAt,
      60_000,
    );
    const renewed = await scheduler.renewRunLease(
      running.id,
      "worker-b",
      2,
      new Date("2026-09-10T01:00:20.000Z"),
      60_000,
    );
    const finished = await scheduler.finishRun({
      runId: renewed.id,
      workerId: "worker-b",
      expectedAttempt: 2,
      now: new Date("2026-09-10T01:00:30.000Z"),
      outcome: { status: "succeeded", resultSummary: "done" },
    });
    expect(finished).toMatchObject({
      status: "succeeded",
      attempt: 2,
      leaseExpiresAt: null,
      resultSummary: "done",
    });
    await expect(
      scheduler.claimAvailableRuns({
        workerId: "worker-c",
        now: new Date("2026-09-11T01:00:00.000Z"),
        leaseDurationMs: 60_000,
        limit: 1,
      }),
    ).resolves.toEqual([]);
  });

  it("cancels an unfinished run when its task changes", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    const task = await taskRepository.create({
      title: "旧任务",
      prompt: null,
      scheduleType: "daily",
      scheduleValue: { time: "09:00" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-10T01:00:00.000Z"),
    });
    const [claim] = await scheduler.claimAvailableRuns({
      workerId: "worker-a",
      now: new Date("2026-09-10T01:00:00.000Z"),
      leaseDurationMs: 60_000,
      limit: 1,
    });

    await taskRepository.update(task.id, {
      title: "新任务",
      prompt: null,
      scheduleType: "daily",
      scheduleValue: { time: "10:00" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-11T02:00:00.000Z"),
      status: "paused",
      expectedVersion: claim.task.version,
    });
    const [run] = await database
      .select()
      .from(schema.taskRuns)
      .where(eq(schema.taskRuns.id, claim.run.id));
    expect(run).toMatchObject({
      status: "cancelled",
      leaseExpiresAt: null,
      errorCode: "TASK_UPDATED",
    });
  });

  it("records a terminal failure and rejects unsafe claim options", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    await expect(
      scheduler.claimAvailableRuns({
        workerId: "",
        now: new Date(),
        leaseDurationMs: 1,
        limit: 0,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CLAIM_OPTIONS" });

    await taskRepository.create({
      title: "失败任务",
      prompt: null,
      scheduleType: "once",
      scheduleValue: { runAt: "2026-09-10T01:00:00.000Z" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-10T01:00:00.000Z"),
    });
    const now = new Date("2026-09-10T01:00:01.000Z");
    const [claim] = await scheduler.claimAvailableRuns({
      workerId: "worker-a",
      now,
      leaseDurationMs: 60_000,
      limit: 1,
    });
    await scheduler.markRunRunning(
      claim.run.id,
      "worker-a",
      1,
      now,
      60_000,
    );
    const failed = await scheduler.finishRun({
      runId: claim.run.id,
      workerId: "worker-a",
      expectedAttempt: 1,
      now: new Date("2026-09-10T01:00:02.000Z"),
      outcome: {
        status: "failed",
        errorCode: "TEST_FAILURE",
        errorMessage: "Expected test failure.",
      },
    });
    expect(failed).toMatchObject({
      status: "failed",
      resultSummary: null,
      errorCode: "TEST_FAILURE",
      errorMessage: "Expected test failure.",
    });
  });
  it("stores a skipped run as a successful non-error terminal state", async () => {
    const taskRepository = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    await taskRepository.create({
      title: "Repeated briefing",
      prompt: "Artificial intelligence policy",
      kind: "personal_briefing",
      scheduleType: "once",
      scheduleValue: { runAt: "2026-09-10T01:00:00.000Z" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-09-10T01:00:00.000Z"),
    });
    const now = new Date("2026-09-10T01:00:01.000Z");
    const [claim] = await scheduler.claimAvailableRuns({
      workerId: "worker-a",
      now,
      leaseDurationMs: 60_000,
      limit: 1,
    });
    await scheduler.markRunRunning(
      claim.run.id,
      "worker-a",
      claim.run.attempt,
      now,
      60_000,
    );

    await expect(
      scheduler.finishRun({
        runId: claim.run.id,
        workerId: "worker-a",
        expectedAttempt: claim.run.attempt,
        now: new Date("2026-09-10T01:00:02.000Z"),
        outcome: {
          status: "skipped",
          resultSummary: "No novel briefing sources remained.",
        },
      }),
    ).resolves.toMatchObject({
      status: "skipped",
      resultSummary: "No novel briefing sources remained.",
      errorCode: null,
      errorMessage: null,
    });
  });

});
