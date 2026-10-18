import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import {
  createInboxRepository,
  InboxRepositoryError,
} from "@/lib/repositories/inboxRepository";
import { createSchedulerRepository } from "@/lib/repositories/schedulerRepository";
import { createTaskRepository } from "@/lib/repositories/taskRepository";

const briefingSources = [
  {
    title: "AI policy update",
    url: "https://example.com/policy",
    source: "example.com",
    publishedAt: "2026-09-09T00:00:00.000Z",
    urlKey: "https://example.com/policy",
    titleKey: "aipolicyupdate",
  },
];

describe("InboxRepository", () => {
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

  async function runningReminder(
    kind:
      | "reminder"
      | "agent_prompt"
      | "personal_briefing"
      | "book_recommendation"
      | "reflection_question" = "reminder",
  ) {
    const tasks = createTaskRepository(database);
    const scheduler = createSchedulerRepository(database);
    const task = await tasks.create({
      title:
        kind === "agent_prompt"
          ? "每日总结"
          : kind === "personal_briefing"
            ? "每日科技简报"
            : kind === "book_recommendation"
              ? "每周选书"
              : kind === "reflection_question"
                ? "每周复盘"
            : "喝水提醒",
      prompt:
        kind === "agent_prompt"
          ? "总结今天的学习"
          : kind === "personal_briefing"
            ? "国际人工智能政策"
            : kind === "book_recommendation"
              ? "批判性思维"
              : kind === "reflection_question"
                ? "复盘英语学习"
            : "起来活动并喝一杯水",
      kind,
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
    const run = await scheduler.markRunRunning(
      claim.run.id,
      "worker-a",
      claim.run.attempt,
      now,
      60_000,
    );
    return { task, run, tasks };
  }

  it("atomically completes a run and creates one unread inbox item", async () => {
    const inbox = createInboxRepository(database);
    const { run } = await runningReminder();
    const completed = await inbox.completeReminderRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: run.attempt,
      now: new Date("2026-09-10T01:00:02.000Z"),
    });

    expect(completed.run).toMatchObject({
      status: "succeeded",
      leaseExpiresAt: null,
    });
    expect(completed.inboxItem).toMatchObject({
      taskRunId: run.id,
      title: "喝水提醒",
      body: "起来活动并喝一杯水",
      status: "unread",
      readAt: null,
    });
    await expect(inbox.list("unread")).resolves.toHaveLength(1);
    await expect(
      inbox.completeReminderRun({
        runId: run.id,
        workerId: "worker-a",
        expectedAttempt: run.attempt,
        now: new Date("2026-09-10T01:00:03.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "RUN_LEASE_LOST",
    } satisfies Partial<InboxRepositoryError>);
    await expect(inbox.list()).resolves.toHaveLength(1);
  });

  it("marks items read or unread and deletes only the local item", async () => {
    const inbox = createInboxRepository(database);
    const { run } = await runningReminder();
    const { inboxItem } = await inbox.completeReminderRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: 1,
      now: new Date("2026-09-10T01:00:02.000Z"),
    });

    const read = await inbox.markStatus(
      inboxItem.id,
      "read",
      new Date("2026-09-10T01:01:00.000Z"),
    );
    expect(read.status).toBe("read");
    expect(read.readAt?.toISOString()).toBe("2026-09-10T01:01:00.000Z");
    await expect(inbox.list("unread")).resolves.toEqual([]);

    const unread = await inbox.markStatus(
      inboxItem.id,
      "unread",
      new Date("2026-09-10T01:02:00.000Z"),
    );
    expect(unread).toMatchObject({ status: "unread", readAt: null });
    await expect(
      inbox.markFeedback(
        inboxItem.id,
        "helpful",
        new Date("2026-09-10T01:03:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "INBOX_FEEDBACK_UNSUPPORTED" });
    await expect(inbox.delete(inboxItem.id)).resolves.toBe(true);
    await expect(inbox.delete(inboxItem.id)).resolves.toBe(false);
  });

  it("stores an Agent Prompt result and model on its completed Run", async () => {
    const inbox = createInboxRepository(database);
    const { run } = await runningReminder("agent_prompt");
    const completed = await inbox.completeAgentPromptRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: run.attempt,
      now: new Date("2026-09-10T01:00:02.000Z"),
      content: "# 今日总结\n\n完成了数学复习。",
      model: "deepseek-test",
    });

    expect(completed.inboxItem).toMatchObject({
      source: "agent_prompt",
      title: "每日总结",
      body: "# 今日总结\n\n完成了数学复习。",
    });
    expect(completed.run).toMatchObject({
      status: "succeeded",
      resultSummary: "Agent response stored in durable inbox (deepseek-test).",
    });
  });

  it("stores a sourced personal briefing in the durable inbox", async () => {
    const inbox = createInboxRepository(database);
    const { run } = await runningReminder("personal_briefing");
    const completed = await inbox.completePersonalBriefingRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: run.attempt,
      now: new Date("2026-09-10T01:00:02.000Z"),
      content: "## 今日重点\n\n政策发布。[S1]\n\n## 来源\n\n- [来源](https://example.com)",
      model: "deepseek-test",
      sources: briefingSources,
      questions: [],
    });

    expect(completed.inboxItem).toMatchObject({
      source: "personal_briefing",
      title: "每日科技简报",
      body: expect.stringContaining("## 来源"),
      briefingSources,
      feedback: null,
    });
    expect(completed.run).toMatchObject({
      status: "succeeded",
      resultSummary:
        "Personal briefing stored in durable inbox (deepseek-test, 1 sources).",
    });

    const feedbackAt = new Date("2026-09-10T01:03:00.000Z");
    await expect(
      inbox.markFeedback(completed.inboxItem.id, "duplicate", feedbackAt),
    ).resolves.toMatchObject({ feedback: "duplicate", updatedAt: feedbackAt });
    await expect(
      inbox.listRecentBriefingSignals(
        completed.inboxItem.taskId!,
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).resolves.toEqual([
      { ...briefingSources[0], feedback: "duplicate" },
    ]);
  });

  it("stores book recommendations in the same durable inbox", async () => {
    const inbox = createInboxRepository(database);
    const { run } = await runningReminder("book_recommendation");
    const completed = await inbox.completeBookRecommendationRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: run.attempt,
      now: new Date("2026-09-10T01:00:02.000Z"),
      content: "## 本次推荐\n\n带来源的书籍推荐。[S1]",
      model: "deepseek-test",
    });

    expect(completed.inboxItem).toMatchObject({
      source: "book_recommendation",
      title: "每周选书",
      body: expect.stringContaining("## 本次推荐"),
      feedback: null,
    });
    expect(completed.run.resultSummary).toBe(
      "Book recommendations stored in durable inbox (deepseek-test).",
    );
  });

  it("stores reflection diagnostics and exposes them to history deduplication", async () => {
    const inbox = createInboxRepository(database);
    const { run } = await runningReminder("reflection_question");
    const questions = [
      {
        question: "本周先验证哪个英语学习假设？",
        type: "action" as const,
        why: "形成最小行动。",
        scores: { relevance: 5, novelty: 5, actionability: 5, emotionalLoad: 1, total: 5 },
        candidateCount: 4,
      },
    ];
    const completed = await inbox.completeReflectionQuestionRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: run.attempt,
      now: new Date("2026-09-10T01:00:02.000Z"),
      content: "## 给你的思考问题\n\n**本周先验证哪个英语学习假设？**",
      model: "deepseek-test",
      questions,
    });
    expect(completed.inboxItem).toMatchObject({
      source: "reflection_question",
      reflectionQuestions: questions,
    });
    await expect(
      inbox.listRecentReflectionQuestions(new Date("2026-09-01T00:00:00.000Z")),
    ).resolves.toEqual(questions);
  });

  it("keeps the inbox snapshot after its source task is deleted", async () => {
    const inbox = createInboxRepository(database);
    const { task, run, tasks } = await runningReminder();
    await inbox.completeReminderRun({
      runId: run.id,
      workerId: "worker-a",
      expectedAttempt: 1,
      now: new Date("2026-09-10T01:00:02.000Z"),
    });
    await tasks.delete(task.id);

    const [item] = await inbox.list();
    expect(item).toMatchObject({
      taskId: null,
      taskRunId: null,
      title: "喝水提醒",
      body: "起来活动并喝一杯水",
    });
  });

  it("rolls back the inbox write after user cancellation", async () => {
    const inbox = createInboxRepository(database);
    const { task, run, tasks } = await runningReminder();
    await tasks.update(task.id, {
      title: task.title,
      prompt: task.prompt,
      scheduleType: "once",
      scheduleValue: task.scheduleValue,
      timezone: task.timezone,
      nextRunAt: new Date("2026-09-11T01:00:00.000Z"),
      status: "paused",
      expectedVersion: 2,
    });

    await expect(
      inbox.completeReminderRun({
        runId: run.id,
        workerId: "worker-a",
        expectedAttempt: 1,
        now: new Date("2026-09-10T01:00:02.000Z"),
      }),
    ).rejects.toMatchObject({ code: "RUN_LEASE_LOST" });
    await expect(inbox.list()).resolves.toEqual([]);
  });
});
