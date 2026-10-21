import { selectWorldSection, confirmNewJourney } from "./helpers/r12Navigation";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db/schema";
import { migrateDatabase, loadMigrations } from "../lib/db/migrations";
import { createPgliteMigrationDatabase } from "../tests/helpers/pglite";
import { createGameWorldRepository } from "../lib/repositories/gameWorldRepository";
import { createGameSessionRepository } from "../lib/repositories/gameSessionRepository";
import { createModelUsageRepository } from "../lib/repositories/modelUsageRepository";
import { createGameWorldApi } from "../lib/api/gameWorldApi";
import { createGameSessionApi } from "../lib/api/gameSessionApi";
import { createGamePlayApi } from "../lib/api/gamePlayApi";
import { createModelUsageApi } from "../lib/api/modelUsageApi";
import { createGameTurnService } from "../lib/game/gameTurnService";
import { createWorldGenerationService } from "../lib/game/worlds/generation";
import { withModelOperation, currentModelOperation } from "../lib/ai/server/operationContext";

const mobile = process.env.WORLD_CREATION_MOBILE_BUNDLE === "true";
for (const width of [360, 1440]) test(`empty sandbox → encounter → correlated token usage at ${width}px`, async ({ page }) => {
  test.setTimeout(90000); const pg = new PGlite(); let release: (() => void) | undefined; let calls = 0;
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); const db = drizzle(pg, { schema });
    const worlds = createGameWorldRepository(db); const sessions = createGameSessionRepository(db); const usage = createModelUsageRepository(db);
    const worldApi = createGameWorldApi(worlds, createWorldGenerationService(worlds, { generate: async () => { throw new Error("Manual sandbox must not call a model"); } })); const sessionApi = createGameSessionApi(sessions); const usageApi = createModelUsageApi(usage);
    const playApi = createGamePlayApi(sessions, createGameTurnService(sessions, { generate: async () => {
      calls++; const operationId = currentModelOperation(); expect(operationId).toMatch(/^[a-f0-9-]{36}$/u);
      await new Promise<void>((resolve) => { release = resolve; });
      await usage.record({ id: crypto.randomUUID(), operationId, business: "game", providerOrigin: "https://synthetic.invalid", model: "synthetic",
        startedAt: new Date().toISOString(), status: "completed", attempts: 1, durationMs: 100, firstTokenMs: 50,
        usage: { inputTokens: 55, outputTokens: 21, cachedInputTokens: 10, uncachedInputTokens: 45, reasoningTokens: 0 },
        finishReason: "stop", errorCode: null, price: null, estimatedCost: null });
      return { content: JSON.stringify({ observation: "树荫下一位菜农正在歇脚。", person: { name: "柳青", identity: "菜农", appearance: "戴草帽", personality: "随和", speech: "简短自然", faction: "无所属势力", goal: "休息后回家", publicBackground: "在附近务农", usesSupernatural: false } }), model: "synthetic" };
    } }, undefined, undefined, worlds.resolveSessionTemplate));
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const request = new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.postData() ? { body: req.postData()! } : {}) });
      const result = await withModelOperation(request, async () => {
        if (url.pathname === "/api/v1/model/usage") return usageApi.get(request);
        if (url.pathname.startsWith("/api/v1/game-worlds")) return worldApi(request, url.pathname.split("/").slice(4));
        if (url.pathname === "/api/v1/game-sessions") return sessionApi.list();
        if (url.pathname.startsWith("/api/v1/game-sessions/")) {
          const [, , , , id, action] = url.pathname.split("/");
          return action === "status" ? playApi.updateStatus(id, request) : action === "turns" ? playApi.createTurn(id, request) : sessionApi.get(id);
        }
        return Response.json({ data: [] });
      });
      await route.fulfill({ status: result.status, contentType: "application/json", body: await result.text() });
    });
    page.on("dialog", (dialog) => dialog.accept()); await page.setViewportSize({ width, height: 900 });
    await page.goto(mobile ? "/#/entertainment?view=creator" : "/entertainment?view=creator");
    await page.getByLabel("粗略世界描述", { exact: true }).fill("田园生活与旅行，没有魔法，不需要谜案或预写人物剧情。");
    await page.getByRole("button", { name: "创建世界", exact: true }).click();
    await page.getByRole("button", { name: "手动开始", exact: true }).click();
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    const draft = (await worlds.list())[0]; expect((await worlds.get(draft.id)).content).toMatchObject({ characters: [], hook: null }); expect(calls).toBe(0);
    await selectWorldSection(page, "预览与发布");
    await page.getByLabel("我已审阅当前草稿、硬约束与公开 / 隐藏设定，确认发布本版本").check();
    await page.getByRole("button", { name: "发布版本", exact: true }).click();
    await confirmNewJourney(page);
    await page.getByRole("link", { name: "打开新旅程 →", exact: true }).click();
    await page.getByRole("button", { name: "开启探索世界", exact: true }).click(); expect(calls).toBe(0);
    await page.getByText("行动中自然相遇（可选 AI）", { exact: true }).click();
    await page.getByRole("textbox", { name: "相遇行动", exact: true }).fill("沿乡间步道散步，看看周围生活。");
    await page.getByRole("button", { name: "探索并记录相遇（调用AI）", exact: true }).click(); await page.getByRole("dialog", { name: "生成行动相遇" }).getByRole("button", { name: "开始生成", exact: true }).click();
    const meter = page.getByRole("region", { name: "AI Token用量" });
    await expect(meter).toContainText("生成中"); await expect(meter).toContainText("实际用量待返回"); await expect.poll(() => calls).toBe(1);
    release!();
    await expect(meter).toContainText("76 Token", { timeout: 12000 });
    await meter.getByRole("button").click();
    await expect(page.getByRole("dialog", { name: "本次AI用量详情" })).toContainText("输入 55 / 输出 21 / 缓存命中 10 Token"); await page.getByRole("button", { name: "关闭用量详情" }).click();
    await expect(page.getByText("相遇结果已保存；模型用量见上方（可能产生费用）。", { exact: true })).toBeVisible();
    const workspace = page.getByRole("region", { name: "大世界探索工作区" });
    await workspace.getByRole("tab", { name: "人物", exact: true }).click(); await expect(workspace).toContainText("柳青");
    expect((await worlds.get(draft.id)).content!.characters).toEqual([]); expect(calls).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 360) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `test-results/sandbox-usage-${mobile ? "react" : "web"}-360.png` });
    }
  } finally { release?.(); await pg.close(); }
});
