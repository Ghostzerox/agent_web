import { selectWorldSection, confirmNewJourney } from "./helpers/r12Navigation";
import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db/schema";
import { loadMigrations, migrateDatabase } from "../lib/db/migrations";
import { createPgliteMigrationDatabase } from "../tests/helpers/pglite";
import { createGameWorldRepository } from "../lib/repositories/gameWorldRepository";
import { createGameSessionRepository } from "../lib/repositories/gameSessionRepository";
import { createGameEventDesignRepository } from "../lib/repositories/gameEventDesignRepository";
import { createGameWorldApi } from "../lib/api/gameWorldApi";
import { createGameSessionApi } from "../lib/api/gameSessionApi";
import { createGamePlayApi } from "../lib/api/gamePlayApi";
import { createGameEventDesignApi } from "../lib/api/gameEventDesignApi";
import { createEventGenerationService } from "../lib/game/events/generation";
import { createGameTurnService } from "../lib/game/gameTurnService";
import { seededWorldBlueprint as blankWorldBlueprint } from "../tests/helpers/worldBlueprint";
import { blankAssetDesign } from "../lib/game/worlds/assetBlueprint";
import type { ItemDesign } from "../lib/game/worlds/assetContracts";

const mobile = process.env.EVENT_DESIGN_MOBILE_BUNDLE === "true";
for (const width of [360, 1440]) test(`authors, publishes, conditionally triggers and resolves world and branch events at ${width}px`, async ({ page }) => {
  test.setTimeout(90000); const pg = new PGlite();
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); const db = drizzle(pg, { schema });
    const worlds = createGameWorldRepository(db); const sessions = createGameSessionRepository(db); const events = createGameEventDesignRepository(db);
    const input = { brief: "无魔法的合成港城", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
    const created = await worlds.create(input); const content = blankWorldBlueprint(input); content.authorNotes = ["SYNTH_HOST_ONLY"];
    const material = blankAssetDesign("item", "copper", input, content) as ItemDesign; material.name = "合成铜片"; material.stackable = true; material.details.category = "material";
    content.items.definitions = [material]; const world = await worlds.update(created.id, { expectedVersion: created.version, input, content, lockedSections: [] });
    let modelCalls = 0; const worldApi = createGameWorldApi(worlds); const sessionApi = createGameSessionApi(sessions);
    const playApi = createGamePlayApi(sessions, createGameTurnService(sessions, { generate: async () => { throw new Error("No narrative call expected"); } }, undefined, undefined, worlds.resolveSessionTemplate));
    const eventApi = createGameEventDesignApi(events, createEventGenerationService(events, { generate: async (messages) => {
      modelCalls++; const payload = JSON.parse(messages[1].content as string); expect(payload.requestedFields).toEqual(["name"]); expect(payload.current.stages).toBeUndefined();
      return { content: '{"name":"合成港口委托"}', model: "synthetic" };
    } }));
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(); const url = new URL(req.url()); const request = new Request(req.url(), { method: req.method(), ...(req.postData() ? { body: req.postData()! } : {}) }); let response: Response;
      if (url.pathname.startsWith("/api/v1/game-worlds")) response = await worldApi(request, url.pathname.split("/").slice(4));
      else if (url.pathname.startsWith("/api/v1/game-events")) response = await eventApi(request, url.pathname.split("/").slice(4));
      else if (url.pathname === "/api/v1/game-sessions") response = await sessionApi.list();
      else if (url.pathname.startsWith("/api/v1/game-sessions/")) { const [, , , , id, action] = url.pathname.split("/"); response = action === "status" ? await playApi.updateStatus(id, request) : action === "turns" ? await playApi.createTurn(id, request) : await sessionApi.get(id); }
      else return route.fulfill({ json: { data: [] } });
      return route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    });
    await page.setViewportSize({ width, height: 900 }); page.on("dialog", (dialog) => dialog.accept());
    const path = `/entertainment?view=creator&world=${world.id}`; await page.goto(mobile ? `/#${path}` : path);
    await selectWorldSection(page, "事件设计");
    const create = async (brief: string) => { await page.getByRole("textbox", { name: "事件想法", exact: true }).fill(brief); await page.getByRole("button", { name: "创建事件", exact: true }).click();  };
    const save = async () => { await page.getByRole("button", { name: "保存事件草稿", exact: true }).click(); await expect(page.getByRole("button", { name: "保存事件草稿", exact: true })).toBeDisabled(); };
    const review = async () => { await page.getByRole("link", { name: "预览与确认事件", exact: true }).click(); await page.getByLabel("我已审阅事件条件、拒绝路径、成本奖励、人物动机与知情范围，确认纳入").check(); };
    await create("探索一段有铜片奖励、允许拒绝的当地委托。");
    await page.getByRole("textbox", { name: "事件名称", exact: true }).fill("手写港口委托"); await page.getByLabel("锁定当前事件字段（仍可手动编辑）").check(); await save();
    await expect(page.getByRole("button", { name: "生成事件内容", exact: true })).toBeDisabled(); expect(modelCalls).toBe(0);
    await page.getByLabel("锁定当前事件字段（仍可手动编辑）").uncheck(); await save(); await page.getByRole("button", { name: "生成事件内容", exact: true }).click(); await page.getByRole("dialog", { name: "生成事件内容" }).getByRole("button", { name: "开始生成", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "事件名称", exact: true })).toHaveValue("合成港口委托");
    await page.getByLabel("当前事件字段", { exact: true }).selectOption("trigger"); await page.getByRole("spinbutton", { name: "最早探索回合", exact: true }).fill("1"); await save();
    await page.getByLabel("当前事件字段", { exact: true }).selectOption("stages"); await page.locator("summary").filter({ hasText: "了解并参与" }).click();
    await page.getByRole("spinbutton", { name: "accept钱币变化", exact: true }).fill("5"); await page.getByRole("combobox", { name: "物品奖励（首项）", exact: true }).selectOption("copper"); await page.getByRole("spinbutton", { name: "奖励数量", exact: true }).fill("2"); await save();
    await review(); if (width === 360 && !mobile) await page.getByRole("main", { name: "事件设计工作台" }).screenshot({ path: "test-results/event-design-360.png" });
    await page.getByRole("button", { name: "加入世界事件", exact: true }).click(); await page.getByRole("link", { name: "发布世界事件新修订 →", exact: true }).click();
    await page.getByLabel("我已审阅当前草稿、硬约束与公开 / 隐藏设定，确认发布本版本").check(); await page.getByRole("button", { name: "发布版本", exact: true }).click();
    await confirmNewJourney(page); await page.getByRole("link", { name: "打开新旅程 →", exact: true }).click(); await page.getByRole("button", { name: "开启探索世界", exact: true }).click();
    await page.getByRole("tab", { name: "事件与史诗", exact: true }).click(); await expect(page.getByRole("tabpanel", { name: "事件与史诗" })).not.toContainText("合成港口委托");
    await page.getByRole("tab", { name: "地图", exact: true }).click(); await page.getByRole("button", { name: "等待片刻", exact: true }).click(); await page.getByRole("tab", { name: "事件与史诗", exact: true }).click();
    const event = page.getByRole("tabpanel", { name: "事件与史诗" }).getByRole("article").filter({ hasText: "合成港口委托" }); await expect(event).toContainText("奖励copper×2"); await event.getByRole("button", { name: "了解并参与", exact: true }).click(); await page.getByRole("dialog", { name: "确认事件选择" }).getByRole("button", { name: "确认选择", exact: true }).click(); await expect(event).toContainText("已结束");
    await page.getByRole("tab", { name: "背包与装备", exact: true }).click(); await expect(page.getByRole("tabpanel", { name: "背包与装备" })).toContainText("合成铜片 × 2"); await expect(page.getByRole("region", { name: "大世界探索工作区" })).toContainText("5 钱币");
    await page.getByRole("link", { name: "事件建议 / 创作 →", exact: true }).click(); await create("只加入当前分支、可以自由拒绝的事件。");
    await page.getByRole("textbox", { name: "事件名称", exact: true }).fill("合成分支事件"); await save(); await review(); await page.getByRole("button", { name: "加入当前分支", exact: true }).click();
    await page.getByRole("link", { name: "打开存档事件与后续行动 →", exact: true }).click();
    const branch = page.getByRole("tabpanel", { name: "事件与史诗" }).getByRole("article").filter({ hasText: "合成分支事件" }); await branch.getByRole("button", { name: "暂不参与", exact: true }).click(); await page.getByRole("dialog", { name: "确认事件选择" }).getByRole("button", { name: "确认选择", exact: true }).click(); await expect(branch).toContainText("已结束"); await page.reload(); await page.getByRole("tab", { name: "事件与史诗", exact: true }).click(); await expect(branch).toContainText("已结束");
    expect(modelCalls).toBe(1); await expect(page.locator("body")).not.toContainText("SYNTH_HOST_ONLY"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally { await pg.close(); }
});
