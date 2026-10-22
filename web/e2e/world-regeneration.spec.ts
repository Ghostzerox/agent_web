import { expect, test } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db/schema";
import { migrateDatabase, loadMigrations } from "../lib/db/migrations";
import { createPgliteMigrationDatabase } from "../tests/helpers/pglite";
import { createGameWorldRepository } from "../lib/repositories/gameWorldRepository";
import { createGameWorldApi } from "../lib/api/gameWorldApi";
import { createWorldGenerationService } from "../lib/game/worlds/generation";
import { blankWorldBlueprint } from "../lib/game/worlds/blueprint";
import type { WorldSection } from "../lib/game/worlds/contracts";

const mobile = process.env.WORLD_CREATION_MOBILE_BUNDLE === "true";
for (const width of [360, 1440]) test(`same brief can replace the whole draft repeatedly and survive reload at ${width}px`, async ({ page }) => {
  const pg = new PGlite();
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations());
    const db = drizzle(pg, { schema }); const repo = createGameWorldRepository(db);
    const input = { brief: "没有魔法的海港，自由生活与航海。", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
    const created = await repo.create(input); const content = blankWorldBlueprint(input); content.overview.name = "第一版世界";
    const initial = await repo.update(created.id, { expectedVersion: created.version, input, content, lockedSections: [] });
    let calls = 0;
    const api = createGameWorldApi(repo, createWorldGenerationService(repo, { generate: async (messages) => {
      calls++; const payload = JSON.parse(messages.at(-1)!.content as string);
      expect(payload.operation).toBe("regenerate"); expect(payload.input).toEqual(input);
      for (const section of payload.requestedSections) expect(payload.current).not.toHaveProperty(section);
      const next = calls < 3 ? blankWorldBlueprint(input) : (await repo.get(created.id)).content!;
      if (calls < 3) { next.overview.name = `第${calls + 1}版世界`; next.overview.technology = `第${calls + 1}版技术`; }
      return { content: JSON.stringify(Object.fromEntries((payload.requestedSections as WorldSection[]).map((key) => [key, next[key]]))), model: "synthetic" };
    } }));
    await page.route("**/api/**", async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.startsWith("/api/v1/game-worlds")) return route.fulfill({ json: { data: [] } });
      const response = await api(new Request(req.url(), { method: req.method(), ...(req.postData() ? { body: req.postData()! } : {}) }), url.pathname.split("/").slice(4));
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.setViewportSize({ width, height: 900 });
    const url = `/entertainment?view=creator&world=${created.id}&section=overview`;
    await page.goto(mobile ? `/#${url}` : url);
    for (const version of [2, 3]) {
      await expect(page.getByRole("textbox", { name: "名称", exact: true })).toHaveValue(version === 2 ? "第一版世界" : "第2版世界");
      await page.getByRole("combobox", { name: "AI生成范围", exact: true }).selectOption("all");
      await page.getByRole("button", { name: "生成草稿", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "确认AI世界生成", exact: true });
      await expect(dialog).toContainText("重新设计");
      await dialog.getByRole("button", { name: "开始生成", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "名称", exact: true })).toHaveValue(`第${version}版世界`);
      await expect(page.getByRole("status").filter({ hasText: "实际更新" })).toContainText(`v${initial.version + version - 1}`);
      expect((await repo.get(created.id)).input).toEqual(input);
      await page.reload();
      await expect(page.getByRole("textbox", { name: "名称", exact: true })).toHaveValue(`第${version}版世界`);
      await expect(page.getByRole("textbox", { name: "技术水平", exact: true })).toHaveValue(`第${version}版技术`);
    }
    expect(calls).toBe(2);
    await page.getByRole("button", { name: "生成此部分", exact: true }).click();
    await page.getByRole("dialog", { name: "确认AI世界生成" }).getByRole("button", { name: "开始生成", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "完全相同" })).toContainText("当前仍是草稿");
    await expect(page.getByRole("textbox", { name: "名称", exact: true })).toHaveValue("第3版世界");
    expect((await repo.get(created.id)).version).toBe(initial.version + 2); expect(calls).toBe(3);
  } finally { await pg.close(); }
});
