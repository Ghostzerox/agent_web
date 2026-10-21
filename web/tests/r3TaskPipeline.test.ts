import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createTaskRepository } from "@/lib/repositories/taskRepository";
import { createSchedulerRepository } from "@/lib/repositories/schedulerRepository";
import { createInboxRepository } from "@/lib/repositories/inboxRepository";
import { createModelUsageRepository } from "@/lib/repositories/modelUsageRepository";
import { createAgentPromptGenerator } from "@/lib/tasks/agentPromptGenerator";
import { createPersonalBriefingGenerator } from "@/lib/tasks/personalBriefingGenerator";
import { createBookRecommendationGenerator } from "@/lib/tasks/bookRecommendationGenerator";
import { createReflectionQuestionGenerator } from "@/lib/tasks/reflectionQuestionGenerator";
import { runReminderBatch } from "@/lib/tasks/reminderWorker";
import { OpenAICompatibleProvider } from "@/lib/ai/server/modelProvider";
import { taskPromptProfile } from "@/lib/ai/taskPromptProfiles";
import type { ReflectionPreferenceRecord } from "@/lib/db/schema";

const at = new Date("2026-10-15T01:00:00.000Z");
const news = "## 今日重点\n本周完成三次听力练习。[S1]\n## 为什么值得关注\n可以据此复盘时间投入。[S1]";
const questions = JSON.stringify({ candidates: [
  { question: "本周先做哪个英语学习动作来验证计划是否有效？", type: "action", why: "改进英语学习。", emotionalLoad: 1 },
  { question: "英语学习安排中哪个未经验证的假设最值得检查？", type: "assumption", why: "检验英语学习前提。", emotionalLoad: 1 },
  { question: "哪些英语学习证据能改变你对当前方法的判断？", type: "evidence", why: "检查英语学习证据。", emotionalLoad: 1 },
] });
const preferences: ReflectionPreferenceRecord = { userId: "00000000-0000-4000-8000-000000000001", enabled: true, goals: ["改进英语学习"], avoidTopics: [], style: "balanced", maxQuestions: 1, version: 1, createdAt: at, updatedAt: at };

describe("R3 task → real generators → measured transport → durable result integration", () => {
  let pg: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  beforeEach(async () => {
    pg = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations());
    database = drizzle(pg, { schema });
  });
  afterEach(async () => { vi.unstubAllGlobals(); await pg.close(); });

  async function setup(kind: schema.ScheduledTaskRecord["kind"], outputs: string[], enableReflection = true) {
    const tasks = createTaskRepository(database);
    const task = await tasks.create({ kind, title: "合成英语学习任务", prompt: "英语学习", scheduleType: "once", scheduleValue: { runAt: at.toISOString() }, timezone: "Asia/Shanghai", nextRunAt: at });
    const payloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      payloads.push(JSON.parse(String(init.body)));
      const content = outputs.shift();
      if (content === undefined) throw new Error("Unexpected additional generation");
      return Response.json({ model: "test-model", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 } });
    }));
    const usage = createModelUsageRepository(database);
    const agent = createAgentPromptGenerator({ getConfig: () => ({ apiKey: "server-only-test-key", baseUrl: "https://api.deepseek.com", model: "test-model" }), createProvider: (config) => new OpenAICompatibleProvider(config, (call) => usage.record(call)) });
    const reflection = createReflectionQuestionGenerator({ agent, preferences: { get: async () => ({ ...preferences, enabled: enableReflection }) } });
    const inbox = createInboxRepository(database);
    const briefing = createPersonalBriefingGenerator({ agent, reflection, search: { search: async () => [{ id: "S1", title: "合成学习记录", snippet: "三次听力练习。", url: "https://example.com/synthetic", source: "合成", publishedAt: at.toISOString(), fetchedAt: at.toISOString() }] } });
    const batch = () => runReminderBatch({ scheduler: createSchedulerRepository(database), inbox, agent, briefing, books: createBookRecommendationGenerator({ agent, profiles: { get: async () => { throw new Error("Unused profile read"); } } }), reflection, now: () => at }, { workerId: "r3-integration", batchSize: 10, leaseDurationMs: 60000 });
    return { task, batch, payloads, inbox, usage };
  }

  it("accounts for both news and optional reflection and persists the validated result once", async () => {
    const h = await setup("personal_briefing", [news, questions]);
    expect(await h.batch()).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    const [item] = await h.inbox.list();
    expect(item.body).toContain("## 给你的思考问题");
    const calls = (await h.usage.list(new Date("2000-01-01"))).calls;
    expect(new Set(calls.map((call) => call.business))).toEqual(new Set(["news", "reflection"]));
    expect(calls.every((call) => call.promptVersion === taskPromptProfile(call.business).version)).toBe(true);
    expect(h.payloads[0]).not.toHaveProperty("response_format");
    expect(h.payloads[1]).toHaveProperty("response_format", { type: "json_object" });
    for (const body of h.payloads) { expect(body).not.toHaveProperty("max_tokens"); expect(body).not.toHaveProperty("max_completion_tokens"); }
    expect(JSON.stringify(calls)).not.toMatch(/server-only-test-key|三次听力练习/u);
    expect(await h.batch()).toMatchObject({ claimed: 0 });
    expect(await h.inbox.list()).toHaveLength(1);
    expect(h.payloads).toHaveLength(2);
  });
  it("does not bill a reflection generation when that feature is disabled", async () => {
    const h = await setup("personal_briefing", [news], false);
    expect(await h.batch()).toMatchObject({ completed: 1 });
    expect(h.payloads).toHaveLength(1);
    expect((await h.usage.list(new Date("2000-01-01"))).calls).toHaveLength(1);
    expect((await h.inbox.list())[0].body).not.toContain("## 给你的思考问题");
  });
  it("keeps a completed paid request in usage when output validation fails without creating an Inbox success", async () => {
    const h = await setup("personal_briefing", [news.replaceAll("[S1]", "[S99]")]);
    expect(await h.batch()).toMatchObject({ completed: 0, failed: 1 });
    expect(await h.inbox.list()).toEqual([]);
    expect((await h.usage.list(new Date("2000-01-01"))).calls).toHaveLength(1);
    const [run] = await database.select().from(schema.taskRuns);
    expect(run).toMatchObject({ status: "failed", errorCode: "BRIEFING_OUTPUT_INVALID" });
  });
  it("ordinary reminders create no model calls or model usage", async () => {
    const h = await setup("reminder", []);
    expect(await h.batch()).toMatchObject({ completed: 1 });
    expect(h.payloads).toEqual([]);
    expect((await h.usage.list(new Date("2000-01-01"))).calls).toEqual([]);
    expect(await h.inbox.list()).toHaveLength(1);
  });
});
