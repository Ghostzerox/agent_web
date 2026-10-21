import { expect, test, type Page } from "@playwright/test";
import { blankWorldBlueprint } from "../lib/game/worlds/blueprint";

const mobile = process.env.R12_MOBILE_BUNDLE === "true";
const path = (url: string) => mobile ? `/#${url}` : url;
const id = "00000000-0000-4000-8000-000000000012";
async function synthetic(page: Page) {
  let writes = 0;
  const input = { brief: "没有魔法的海港，人们依靠航海和手艺生活。", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
  const content = blankWorldBlueprint(input); content.overview.name = "潮汐港";
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") { writes++; return route.fulfill({ status: 409, json: { error: { message: "禁止视觉测试写入" } } }); }
    const url = new URL(route.request().url());
    const data = url.pathname === `/api/v1/game-worlds/${id}` ? { id, input, content, origins: {}, lockedSections: [], version: 1, revisions: [], issues: [] }
      : url.pathname === "/api/v1/game-worlds" ? [{ id, name: "潮汐港", brief: input.brief, version: 1 }]
      : url.pathname === "/api/v1/actions" ? { today: "2026-10-22", items: [], entries: [] } : [];
    return route.fulfill({ json: { data } });
  });
  return () => writes;
}

for (const width of [360, 1440]) {
  test(`clear parents and grouped closable navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes = await synthetic(page);
    await page.goto(path("/entertainment?view=creator"));
    await page.getByRole("textbox", { name: "粗略世界描述", exact: true }).fill("不可丢失的创作描述");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "返回娱乐首页", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "粗略世界描述", exact: true })).toHaveValue("不可丢失的创作描述");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "返回娱乐首页", exact: true }).click();
    await expect(page.getByRole("heading", { name: "为想象力打开一扇门", exact: true })).toBeVisible();
    await page.goto(path(`/entertainment?view=creator&world=${id}&section=overview`));
    await expect(page.getByRole("textbox", { name: "名称", exact: true })).toHaveValue("潮汐港");
    const more = page.locator("details.ui-more");
    await more.locator("summary").click();
    await expect(page.getByRole("button", { name: "重新加载", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "重新加载", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(more).not.toHaveAttribute("open");
    await expect(more.locator("summary")).toBeFocused();
    await more.locator("summary").click();
    // On a phone the popover legitimately covers part of the world hero.
    await page.getByRole("heading", { level: 1 }).click();
    await expect(more).not.toHaveAttribute("open");
    if (width > 767) {
      const directory = page.getByRole("navigation", { name: "世界创作局部导航" });
      await expect(directory.locator("details[open]")).toHaveCount(1);
      await directory.locator("summary").filter({ hasText: "人物与社会" }).click();
      await expect(directory.locator("details[open]")).toHaveCount(1);
      await expect(directory.getByRole("link", { name: "公开史料与秘密", exact: true })).toBeVisible();
      await directory.locator("summary").filter({ hasText: "道具与事件" }).click();
      await expect(directory.locator("details[open]")).toHaveCount(1);
    }
    await page.getByRole("button", { name: "生成此部分", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "返回我的世界", exact: true })).toBeInViewport();
    await page.getByRole("link", { name: "返回我的世界", exact: true }).click();
    await expect(page.getByRole("button", { name: "创建世界", exact: true })).toBeVisible();
    await page.goto(path("/study/problem-solving"));
    await page.getByRole("link", { name: "返回学习首页", exact: true }).click();
    await expect(page.getByRole("heading", { name: "今天，想练习什么？", exact: true })).toBeVisible();
    await page.goto(path("/tasks?section=actions"));
    await expect(page.getByLabel("行动名称", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "返回任务首页", exact: true }).click();
    await expect(page.getByRole("heading", { name: "今天，先做一件事", exact: true })).toBeVisible();
    await page.goto(path("/settings"));
    await page.getByRole("button", { name: "打开本模块功能", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "本模块功能", exact: true });
    for (const group of ["模型与设备", "记忆与陪伴", "扩展"]) await expect(panel.getByRole("heading", { name: group, exact: true })).toBeVisible();
    await panel.getByRole("link", { name: "高级工具", exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByRole("button", { name: "关闭本模块功能", exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/navigation-clarity/${mobile ? "react" : "web"}-navigation-${width}.png` });
    await panel.getByRole("button", { name: "关闭本模块功能", exact: true }).click();
    await expect(page.getByRole("button", { name: "打开本模块功能", exact: true })).toBeFocused();
    expect(writes()).toBe(0);
  });
  for (const colorScheme of ["light", "dark"] as const) test(`mode-specific visual hierarchy ${colorScheme} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const writes = await synthetic(page);
    const backgrounds = new Set<string>();
    for (const [name, url] of [["entertainment", "/entertainment"], ["creator", "/entertainment?view=creator"], ["world", `/entertainment?view=creator&world=${id}&section=overview`], ["study", "/study"], ["tasks", "/tasks"], ["content", "/content"], ["settings", "/settings"]]) {
      await page.goto(path(url));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (name === "world") await expect(page.getByRole("textbox", { name: "名称", exact: true })).toBeVisible();
      if (name === "creator") await expect(page.getByRole("button", { name: "创建世界", exact: true })).toBeVisible();
      if (name === "tasks") await expect(page.getByLabel("行动名称", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      backgrounds.add(await page.locator(".workspace").evaluate((el) => getComputedStyle(el).backgroundColor));
      await page.screenshot({ path: `test-results/navigation-clarity/${mobile ? "react" : "web"}-${name}-${colorScheme}-${width}.png`, fullPage: true });
    }
    expect(backgrounds.size).toBe(5);
    expect(writes()).toBe(0);
  });
}
