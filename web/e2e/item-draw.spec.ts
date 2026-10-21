import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db/schema";
import { loadMigrations, migrateDatabase } from "../lib/db/migrations";
import { createPgliteMigrationDatabase } from "../tests/helpers/pglite";
import { createGameWorldRepository } from "../lib/repositories/gameWorldRepository";
import { createGameSessionRepository } from "../lib/repositories/gameSessionRepository";
import { createGameDrawRepository } from "../lib/repositories/gameDrawRepository";
import { createGameWorldApi } from "../lib/api/gameWorldApi";
import { createGameSessionApi } from "../lib/api/gameSessionApi";
import { createGamePlayApi } from "../lib/api/gamePlayApi";
import { createGameDrawApi } from "../lib/api/gameDrawApi";
import { createDrawGenerationService } from "../lib/game/draws/generation";
import { createGameTurnService } from "../lib/game/gameTurnService";
import { seededWorldBlueprint as blankWorldBlueprint } from "../tests/helpers/worldBlueprint";
import { blankAssetDesign } from "../lib/game/worlds/assetBlueprint";
import type { ItemDesign } from "../lib/game/worlds/assetContracts";

const mobile = process.env.ITEM_DRAW_MOBILE_BUNDLE === "true";
for (const width of [360, 1440]) test(`configures published pools, recovers a sampled draw and grants real branch inventory at ${width}px`, async ({ page }) => {
  test.setTimeout(90000); const pg = new PGlite();
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); const db = drizzle(pg, { schema });
    const worlds = createGameWorldRepository(db); const sessions = createGameSessionRepository(db); const draws = createGameDrawRepository(db);
    const input = { brief: "无魔法的合成港城", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
    const created = await worlds.create(input); const content = blankWorldBlueprint(input);
    const material = blankAssetDesign("item", "copper", input, content) as ItemDesign; material.name = "合成铜片"; material.stackable = true; material.details.category = "material";
    content.items.definitions = [material]; const world = await worlds.update(created.id, { expectedVersion: created.version, input, content, lockedSections: [] });
    let modelCalls = 0; const worldApi = createGameWorldApi(worlds); const sessionApi = createGameSessionApi(sessions);
    const playApi = createGamePlayApi(sessions, createGameTurnService(sessions, { generate: async () => { throw new Error("No narrative call expected"); } }, undefined, undefined, worlds.resolveSessionTemplate));
    const drawApi = createGameDrawApi(draws, createDrawGenerationService(draws, { generate: async (messages) => {
      modelCalls++; const request = JSON.parse(messages[1].content as string); expect(request.quantity).toBe(2); expect(request.world.magic).toBe("forbidden");
      return { content: JSON.stringify({ ...request.current, name: "合成铜铆钉", description: "本地工坊制作的普通铜铆钉" }), model: "synthetic" };
    } }));
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(); const url = new URL(req.url()); const request = new Request(req.url(), { method: req.method(), ...(req.postData() ? { body: req.postData()! } : {}) }); let response: Response;
      if (url.pathname.startsWith("/api/v1/game-worlds")) response = await worldApi(request, url.pathname.split("/").slice(4));
      else if (url.pathname.startsWith("/api/v1/game-draws")) response = await drawApi(request, url.pathname.split("/").slice(4));
      else if (url.pathname === "/api/v1/game-sessions") response = await sessionApi.list();
      else if (url.pathname.startsWith("/api/v1/game-sessions/")) { const [, , , , id, action] = url.pathname.split("/"); response = action === "status" ? await playApi.updateStatus(id, request) : action === "turns" ? await playApi.createTurn(id, request) : await sessionApi.get(id); }
      else return route.fulfill({ json: { data: [] } });
      return route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    });
    await page.setViewportSize({ width, height: 900 }); page.on("dialog", (dialog) => dialog.accept());
    const path = `/entertainment?view=creator&world=${world.id}`; await page.goto(mobile ? `/#${path}` : path);
    await page.getByRole("link", { name: "卡池配置", exact: true }).click();
    for (const source of ["固定", "生成"]) {
      await page.getByRole("button", { name: "添加卡池", exact: true }).click();
      await page.getByRole("textbox", { name: "卡池名称", exact: true }).fill(`${source}物资池`);
      await page.getByRole("button", { name: `添加${source}条目`, exact: true }).click();
      await page.getByRole("spinbutton", { name: "数量上限", exact: true }).fill("2"); await page.getByRole("spinbutton", { name: "数量下限", exact: true }).fill("2");
      await expect(page.getByRole("button", { name: "确认保存卡池规则", exact: true })).toBeDisabled();
      await page.getByLabel("我已审阅卡池的概率、数量、次数、放回、来源与虚构成本，确认保存").check();
      await page.getByRole("button", { name: "确认保存卡池规则", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "卡池已保存" })).toBeVisible();
    }
    await page.getByRole("link", { name: "前往预览与发布 →", exact: true }).click();
    await page.getByLabel("我已审阅当前草稿、硬约束与公开 / 隐藏设定，确认发布本版本").check(); await page.getByRole("button", { name: "确认发布当前草稿", exact: true }).click();
    await page.getByRole("button", { name: "以r1创建存档", exact: true }).click(); await page.getByRole("link", { name: "打开新存档并开启探索 →", exact: true }).click();
    await page.getByRole("button", { name: "开启探索世界", exact: true }).click();
    for (const source of ["固定", "生成"]) {
      await page.getByRole("link", { name: "获取 / 抽卡 →", exact: true }).click();
      await page.getByRole("combobox", { name: "选择卡池", exact: true }).selectOption({ label: `${source}物资池` });
      await expect(page.getByRole("main", { name: "存档获取工作区" })).toContainText("100.00%");
      if (source === "生成") await page.getByRole("textbox", { name: "补充关键词", exact: false }).fill("铜制紧固材料");
      await page.getByLabel("我确认1次抽取、当前规则与虚构成本；抽样本身不调用模型、不扣费发奖").check();
      await page.getByRole("button", { name: "确认宿主抽样（不调用模型）", exact: true }).click();
      await expect(page.getByRole("region", { name: "当前抽取回执" })).toContainText("已抽定数量 2");
      expect(modelCalls).toBe(0);
      await page.getByRole("link", { name: "本次回执的固定链接（刷新后可恢复） →", exact: true }).click(); await page.reload();
      await expect(page.getByRole("region", { name: "当前抽取回执" })).toContainText("已抽定数量 2");
      if (source === "生成") {
        await page.getByRole("button", { name: "AI补全已抽定物品（可能费用）", exact: true }).click();
        await expect(page.getByRole("textbox", { name: "物品名称", exact: true })).toHaveValue("合成铜铆钉"); expect(modelCalls).toBe(1);
        if (width === 360 && !mobile) await page.getByRole("main", { name: "存档获取工作区" }).screenshot({ path: "test-results/item-draw-360.png" });
      }
      await page.getByLabel("我已审阅物品及世界约束，确认入库并扣除 0 枚虚构钱币").check(); await page.getByRole("button", { name: "确认入库（不自动装备）", exact: true }).click();
      await expect(page.getByRole("heading", { name: "已入库", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "查看背包与新回合 →", exact: true }).click();
      await page.getByRole("tab", { name: "背包与装备", exact: true }).click();
      await expect(page.getByRole("tabpanel", { name: "背包与装备" }).getByRole("article").filter({ hasText: source === "固定" ? "合成铜片" : "合成铜铆钉" })).toContainText("× 2");
    }
    expect(modelCalls).toBe(1); await page.reload(); await page.getByRole("tab", { name: "背包与装备", exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "背包与装备" }).getByRole("article").filter({ hasText: "合成铜铆钉" })).toContainText("你的背包");
    await page.getByRole("link", { name: "获取 / 抽卡 →", exact: true }).click();
    await page.getByText("所选分支已入库记录（2）", { exact: true }).click();
    await expect(page.getByRole("link", { name: "合成铜铆钉 × 2 · 查看原回执 →", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await pg.close(); }
});
