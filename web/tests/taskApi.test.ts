import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskApi } from "@/lib/api/taskApi";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import * as schema from "@/lib/db/schema";
import { createTaskRepository } from "@/lib/repositories/taskRepository";

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/v1/tasks", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Task API", () => {
  let pglite: PGlite;
  let api: ReturnType<typeof createTaskApi>;
  const now = new Date("2026-09-10T01:30:00.000Z");

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    api = createTaskApi(
      createTaskRepository(drizzle(pglite, { schema })),
      () => now,
    );
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("creates, lists, reads, updates and deletes a reminder", async () => {
    const createdResponse = await api.create(
      jsonRequest("POST", {
        title: "晚间复习",
        prompt: "复习今日错题",
        schedule: { type: "daily", time: "20:00" },
      }),
    );
    const created = (await createdResponse.json()).data;
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("location")).toBe(
      `/api/v1/tasks/${created.id}`,
    );
    expect(created).toMatchObject({
      title: "晚间复习",
      kind: "reminder",
      scheduleType: "daily",
      scheduleValue: { time: "20:00" },
      nextRunAt: "2026-09-10T12:00:00.000Z",
      status: "active",
      version: 1,
    });

    expect((await (await api.list()).json()).data).toHaveLength(1);
    expect((await (await api.get(created.id)).json()).data.id).toBe(created.id);

    const pausedResponse = await api.update(
      created.id,
      jsonRequest("PATCH", {
        title: "晚间复习（暂停）",
        prompt: null,
        schedule: { type: "daily", time: "20:00" },
        status: "paused",
        expectedVersion: created.version,
      }),
    );
    const paused = (await pausedResponse.json()).data;
    expect(paused).toMatchObject({
      title: "晚间复习（暂停）",
      status: "paused",
      nextRunAt: null,
      version: 2,
    });

    const staleResponse = await api.update(
      created.id,
      jsonRequest("PATCH", {
        title: "过期修改",
        prompt: null,
        schedule: { type: "daily", time: "20:00" },
        status: "active",
        expectedVersion: created.version,
      }),
    );
    expect(staleResponse.status).toBe(409);
    expect((await staleResponse.json()).error.code).toBe("VERSION_CONFLICT");

    expect((await api.delete(created.id)).status).toBe(204);
    expect((await api.get(created.id)).status).toBe(404);
  });

  it("rejects malformed and past schedules with the stable error shape", async () => {
    const malformed = await api.create(
      jsonRequest("POST", {
        title: "错误时间",
        prompt: null,
        schedule: { type: "daily", time: "25:00" },
      }),
    );
    const past = await api.create(
      jsonRequest("POST", {
        title: "过去提醒",
        prompt: null,
        schedule: { type: "once", runAt: "2026-09-09T10:00:00+08:00" },
      }),
    );
    const invalidId = await api.get("not-a-uuid");
    const missingAgentPrompt = await api.create(
      jsonRequest("POST", {
        title: "每日总结",
        kind: "agent_prompt",
        prompt: null,
        schedule: { type: "daily", time: "20:00" },
      }),
    );

    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(past.status).toBe(400);
    expect((await past.json()).error.message).toContain("future");
    expect(invalidId.status).toBe(400);
    expect(missingAgentPrompt.status).toBe(400);
    expect((await missingAgentPrompt.json()).error.details[0].path).toEqual([
      "prompt",
    ]);
  });

  it("creates an Agent Prompt task with a required prompt", async () => {
    const response = await api.create(
      jsonRequest("POST", {
        title: "每日学习总结",
        kind: "agent_prompt",
        prompt: "总结今天值得复习的知识点",
        schedule: { type: "daily", time: "21:00" },
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      kind: "agent_prompt",
      prompt: "总结今天值得复习的知识点",
    });
  });

  it("creates a personal briefing task and requires a topic", async () => {
    const response = await api.create(
      jsonRequest("POST", {
        title: "每日科技简报",
        kind: "personal_briefing",
        prompt: "国际人工智能政策与教育技术",
        schedule: { type: "daily", time: "08:00" },
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      kind: "personal_briefing",
      prompt: "国际人工智能政策与教育技术",
    });

    const missingTopic = await api.create(
      jsonRequest("POST", {
        title: "无主题简报",
        kind: "personal_briefing",
        prompt: null,
        schedule: { type: "daily", time: "08:00" },
      }),
    );
    expect(missingTopic.status).toBe(400);
  });

  it("creates a book recommendation task and requires a topic", async () => {
    const response = await api.create(
      jsonRequest("POST", {
        title: "每周选书",
        kind: "book_recommendation",
        prompt: "批判性思维与认知科学",
        schedule: { type: "weekly", weekday: 7, time: "09:00" },
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      kind: "book_recommendation",
      prompt: "批判性思维与认知科学",
    });

    const missingTopic = await api.create(
      jsonRequest("POST", {
        title: "无主题选书",
        kind: "book_recommendation",
        prompt: null,
        schedule: { type: "weekly", weekday: 7, time: "09:00" },
      }),
    );
    expect(missingTopic.status).toBe(400);
  });

  it("creates a reflection question task and requires a topic", async () => {
    const response = await api.create(
      jsonRequest("POST", {
        title: "每周复盘",
        kind: "reflection_question",
        prompt: "复盘本周英语学习计划",
        schedule: { type: "weekly", weekday: 7, time: "20:00" },
      }),
    );
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({
      kind: "reflection_question",
      prompt: "复盘本周英语学习计划",
    });
    expect(
      (
        await api.create(
          jsonRequest("POST", {
            title: "无主题复盘",
            kind: "reflection_question",
            prompt: null,
            schedule: { type: "weekly", weekday: 7, time: "20:00" },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("does not expose an internal database error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unavailable = createTaskApi(() => {
      throw new Error("secret connection detail");
    });
    const response = await unavailable.list();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("secret connection detail");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
