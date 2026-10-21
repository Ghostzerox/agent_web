import { selectWorldSection, confirmNewJourney } from "./helpers/r12Navigation";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db/schema";
import { loadMigrations, migrateDatabase } from "../lib/db/migrations";
import { createPgliteMigrationDatabase } from "../tests/helpers/pglite";
import { createGameWorldRepository } from "../lib/repositories/gameWorldRepository";
import { createGameAssetDesignRepository } from "../lib/repositories/gameAssetDesignRepository";
import { createGameSessionRepository } from "../lib/repositories/gameSessionRepository";
import { createGameWorldApi } from "../lib/api/gameWorldApi";
import { createGameAssetDesignApi } from "../lib/api/gameAssetDesignApi";
import { createGameSessionApi } from "../lib/api/gameSessionApi";
import { createGamePlayApi } from "../lib/api/gamePlayApi";
import { createAssetGenerationService } from "../lib/game/worlds/assetGeneration";
import { createGameTurnService } from "../lib/game/gameTurnService";
import { seededWorldBlueprint as blankWorldBlueprint } from "../tests/helpers/worldBlueprint";

const mobile = process.env.ASSET_DESIGN_MOBILE_BUNDLE === "true";
for (const width of [360, 1440]) test(`designs item and important character, confirms, publishes and plays at ${width}px`, async ({ page }) => {
  test.setTimeout(90000); const pg = new PGlite();
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); const db = drizzle(pg, { schema });
    const worlds = createGameWorldRepository(db); const designs = createGameAssetDesignRepository(db); const sessions = createGameSessionRepository(db);
    const input = { brief: "无魔法蒸汽港城，铜哨来自当地工艺。", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
    const created = await worlds.create(input); const content = blankWorldBlueprint(input); content.overview.name = "合成铜湾";
    const world = await worlds.update(created.id, { expectedVersion: created.version, input, content, lockedSections: [] });
    const worldApi = createGameWorldApi(worlds); let designCalls = 0; const actorRequests: string[] = [];
    const designApi = createGameAssetDesignApi(designs, createAssetGenerationService(designs, { generate: async () => {
      designCalls++; return { content: '{"description":"合成旧铜哨：只能向附近同伴示意，不能读心。"}', model: "synthetic" };
    } }));
    const sessionApi = createGameSessionApi(sessions); const playApi = createGamePlayApi(sessions, createGameTurnService(sessions, { generate: async (messages) => {
      actorRequests.push(JSON.stringify(messages)); return { content: '{"narrative":"合成记录员回应：我们先核对告示。","statePatch":{}}', model: "synthetic" };
    } }, undefined, undefined, worlds.resolveSessionTemplate));
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(); const url = new URL(req.url()); const request = new Request(req.url(), { method: req.method(), ...(req.postData() ? { body: req.postData()! } : {}) });
      let response: Response;
      if (url.pathname.startsWith("/api/v1/game-worlds")) response = await worldApi(request, url.pathname.split("/").slice(4));
      else if (url.pathname.startsWith("/api/v1/game-designs")) response = await designApi(request, url.pathname.split("/").slice(4));
      else if (url.pathname === "/api/v1/game-sessions") response = await sessionApi.list();
      else if (url.pathname.startsWith("/api/v1/game-sessions/")) { const [, , , , id, action] = url.pathname.split("/"); response = action === "status" ? await playApi.updateStatus(id, request) : action === "turns" ? await playApi.createTurn(id, request) : await sessionApi.get(id); }
      else return route.fulfill({ json: { data: [] } });
      return route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    });
    await page.setViewportSize({ width, height: 900 }); page.on("dialog", (dialog) => dialog.accept());
    const path = `/entertainment?view=creator&world=${world.id}`; await page.goto(mobile ? `/#${path}` : path);
    await selectWorldSection(page, "道具设计");
    await page.getByRole("textbox", { name: "设计描述", exact: true }).fill("一枚有当地工艺来历的旧铜哨。");
    await page.getByRole("button", { name: "创建设计", exact: true }).click();

    await page.getByRole("textbox", { name: "名称", exact: true }).fill("旧铜哨");
    await page.getByLabel("锁定当前字段（仍可手动编辑）").check();
    await page.getByRole("button", { name: "保存设计草稿", exact: true }).click();
    await expect(page.getByRole("button", { name: "生成设计", exact: true })).toBeDisabled(); expect(designCalls).toBe(0);
    await page.getByLabel("当前设计字段", { exact: true }).selectOption("description");
    await page.getByRole("button", { name: "生成设计", exact: true }).click(); await page.getByRole("dialog", { name: "生成设计内容" }).getByRole("button", { name: "开始生成", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "描述", exact: true })).toHaveValue("合成旧铜哨：只能向附近同伴示意，不能读心。");
    await page.getByRole("link", { name: "预览与确认", exact: true }).click();
    if (width === 360 && !mobile) await page.getByRole("region", { name: "道具与人物设计工作台", exact: true }).screenshot({ path: "test-results/asset-design-360.png" });
    await expect(page.getByRole("button", { name: "加入世界", exact: true })).toBeDisabled();
    expect((await worlds.get(world.id)).content!.items.definitions).toHaveLength(0);
    await page.getByLabel("我已审阅世界约束、公开 / 本人 / 主持范围，确认纳入当前世界草稿").check();
    await page.getByRole("button", { name: "加入世界", exact: true }).click();
    await page.getByRole("link", { name: "查看世界定义 / 初始配置 →", exact: true }).click();
    await page.getByRole("button", { name: "配置一个初始实例", exact: true }).click();
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    await selectWorldSection(page, "人物设计");
    await page.getByRole("combobox", { name: "设计对象", exact: true }).selectOption("guide");
    await page.getByRole("textbox", { name: "设计描述", exact: true }).fill("设计一位有私密经历和修钟需求的记录员。");
    await page.getByRole("button", { name: "创建设计", exact: true }).click();

    await page.getByRole("textbox", { name: "名称", exact: true }).fill("铜湾记录员");
    await page.getByLabel("当前设计字段", { exact: true }).selectOption("category");
    await page.getByLabel("人物类别", { exact: true }).selectOption("important");
    await page.getByLabel("当前设计字段", { exact: true }).selectOption("profile");
    await page.getByRole("textbox", { name: "本人知道的经历", exact: true }).fill("SYNTH_PRIVATE_PAST");
    await page.getByRole("textbox", { name: "价值观（每行一项）", exact: true }).fill("核对记录");
    await page.getByRole("textbox", { name: "当前需求（每行一项）", exact: true }).fill("修复旧钟");
    await page.getByText("仅主持知道（本人也不自动知道）", { exact: true }).click();
    await page.getByRole("textbox", { name: "主持备注（每行一项，最多4项）", exact: true }).fill("SYNTH_HOST_SECRET");
    await page.getByRole("button", { name: "保存设计草稿", exact: true }).click();
    await page.getByRole("link", { name: "预览与确认", exact: true }).click();
    await page.getByLabel("我已审阅世界约束、公开 / 本人 / 主持范围，确认纳入当前世界草稿").check();
    await page.getByRole("button", { name: "加入世界", exact: true }).click();
    await page.getByRole("link", { name: "前往世界预览与发布 →", exact: true }).click();
    await page.getByLabel("我已审阅当前草稿、硬约束与公开 / 隐藏设定，确认发布本版本").check();
    await page.getByRole("button", { name: "发布版本", exact: true }).click();
    await confirmNewJourney(page);
    await page.getByRole("link", { name: "打开新旅程 →", exact: true }).click();
    await page.getByRole("button", { name: "开启探索世界", exact: true }).click();
    const workspace = page.getByRole("region", { name: "大世界探索工作区" });
    await page.getByRole("tab", { name: "背包与装备", exact: true }).click();
    const item = workspace.getByRole("article").filter({ hasText: "旧铜哨" }); await item.getByRole("button", { name: "拾取", exact: true }).click();
    await expect(item).toContainText("你的背包");
    await page.getByRole("tab", { name: "人物", exact: true }).click(); const person = workspace.getByRole("article").filter({ hasText: "铜湾记录员" });
    await expect(person).toContainText("重要角色"); await expect(page.locator("body")).not.toContainText("SYNTH_PRIVATE_PAST");
    await expect(page.locator("body")).not.toContainText("SYNTH_HOST_SECRET");
    await person.getByText("自由 AI 对话（点击发送才调用模型）", { exact: true }).click();
    await page.getByRole("textbox", { name: "对铜湾记录员说", exact: true }).fill("你最近需要什么？");
    await page.getByRole("button", { name: "发送给铜湾记录员 · 调用 AI", exact: true }).click();
    await expect.poll(() => actorRequests.length).toBe(1); expect(actorRequests[0]).toContain("SYNTH_PRIVATE_PAST"); expect(actorRequests[0]).not.toContain("SYNTH_HOST_SECRET"); expect(designCalls).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await pg.close(); }
});
