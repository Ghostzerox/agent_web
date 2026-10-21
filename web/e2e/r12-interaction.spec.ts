import { expect, test } from "@playwright/test";
import { blankWorldBlueprint } from "../lib/game/worlds/blueprint";
import { selectWorldSection } from "./helpers/r12Navigation";
const mobile = process.env.R12_MOBILE_BUNDLE === "true";
const path = (route: string) => mobile ? `/#${route}` : route;
for (const width of [360, 390, 768, 1440]) test(`R12 workspace edits, confirmation and keyboard at ${width}px`, async ({ page }) => {
  const input = { brief: "普通沿海小城", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
  const id = "00000000-0000-4000-8000-000000000012";
  let draft = { id, input, content: blankWorldBlueprint(input), lockedSections: [], origins: {}, version: 1, createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", revisions: [], issues: [] };
  let writes = 0;
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname.includes("/game-worlds/")) {
      if (req.method() === "PATCH") { writes++; draft = { ...draft, ...req.postDataJSON(), version: draft.version + 1 }; }
      else if (req.method() !== "GET") throw new Error("Unexpected paid or publication request");
      return route.fulfill({ json: { data: draft } });
    }
    return route.fulfill({ json: { data: url.pathname.endsWith("/credentials") ? { configured: true, model: "synthetic-ui", provider: "test" } : [] } });
  });
  await page.goto(path(`/entertainment?view=creator&world=${id}&section=overview`));
  await page.getByRole("textbox", { name: "名称", exact: true }).fill("未保存但保留的名称");
  await selectWorldSection(page, "区域与地图");
  await page.getByRole("button", { name: "添加地点", exact: true }).click();
  await selectWorldSection(page, "世界概览");
  await expect(page.getByRole("textbox", { name: "名称", exact: true })).toHaveValue("未保存但保留的名称");
  await expect(page.getByRole("button", { name: "生成此部分", exact: true })).toBeDisabled();
  await expect(page.locator("#world-generation-help")).toContainText("先保存");
  await page.getByRole("button", { name: "保存更改", exact: true }).click(); expect(writes).toBe(1);
  expect(draft.content.region.locations).toHaveLength(3);
  await page.getByRole("button", { name: "生成此部分", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "确认AI世界生成", exact: true });
  await expect(modal).toContainText("世界概览"); await expect(modal).toContainText("synthetic-ui");
  await modal.getByRole("button", { name: "取消", exact: true }).focus();
  await page.keyboard.press("Shift+Tab"); await expect(modal.getByRole("button", { name: "开始生成", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0);
  await expect(page.getByRole("button", { name: "生成此部分", exact: true })).toBeFocused(); expect(writes).toBe(1);
  await selectWorldSection(page, "世界级人物（可为空）");
  await page.getByRole("button", { name: "添加预设人物", exact: true }).click();
  await page.getByRole("button", { name: "移除人物", exact: true }).click();
  await selectWorldSection(page, "公开史料与秘密"); await page.getByRole("button", { name: "添加史料", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "内容", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存更改", exact: true }).click();
  await selectWorldSection(page, "世界概览"); await page.getByText("高级结构编辑", { exact: true }).click();
  const raw = page.getByRole("textbox", { name: "当前部分JSON", exact: true }); await raw.fill("{");
  await selectWorldSection(page, "区域与地图");
  await expect(raw).toBeVisible(); await expect(page.getByRole("alert").filter({ hasText: "高级JSON尚未应用" })).toContainText("先应用修改或放弃JSON编辑");
  await page.getByRole("button", { name: "放弃JSON编辑", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const width of [360, 1440]) test(`R12 daily actions, reading and settings feedback at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let created = false; let saved = false; let writes = 0;
  const news = { id: "00000000-0000-4000-8000-000000000014", title: "合成今日简报", source: "personal_briefing", body: "有来源的合成阅读正文", status: "unread", occurredAt: "2026-10-21T00:00:00Z", briefingSources: null, reflectionQuestions: null, feedback: null };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); if (req.method() !== "GET") writes++;
    if (url.pathname === "/api/v1/actions") {
      if (req.method() !== "GET") created = true;
      return route.fulfill({ json: { data: req.method() === "GET" ? { today: "2026-10-21", entries: [], items: created ? [{ id: "00000000-0000-4000-8000-000000000015", version: 1, data: { kind: "todo", title: "读一章书", note: "", startsOn: "2026-10-21", dueOn: null, status: "active", completedOn: null, rules: [], goalId: null, linkedTaskId: null } }] : [] } : { id: "00000000-0000-4000-8000-000000000015", version: 1, data: req.postDataJSON().data } } });
    }
    if (url.pathname === "/api/v1/inbox") return route.fulfill({ json: { data: [news] } });
    if (url.pathname.endsWith("/credentials/test")) return route.fulfill({ status: 503, json: { error: { message: "合成连接失败，请核对地址" } } });
    if (url.pathname.endsWith("/credentials")) {
      if (req.method() === "PUT") saved = true;
      return route.fulfill({ json: { data: { configured: saved, source: saved ? "stored" : "none", provider: saved ? "test" : null, model: saved ? "synthetic" : null, baseUrl: saved ? "https://synthetic.invalid" : null, apiKeyHint: null, version: saved ? 1 : null, missing: [] } } });
    }
    return route.fulfill({ status: 503, json: { error: { message: "合成离线反馈" } } });
  });
  await page.goto(path("/tasks")); await page.getByLabel("行动名称", { exact: true }).fill("读一章书");
  await page.getByRole("button", { name: "添加待办", exact: true }).click(); await expect(page.getByRole("heading", { name: "读一章书", exact: true })).toBeVisible();
  const todo = page.getByRole("article").filter({ hasText: "读一章书" }); await todo.getByText("更多操作", { exact: true }).click(); await todo.getByRole("button", { name: "归档", exact: true }).click();
  await page.getByRole("dialog", { name: "归档此行动？" }).getByRole("button", { name: "取消", exact: true }).click(); expect(writes).toBe(1);
  await page.goto(path("/content")); await expect(page.getByRole("heading", { name: news.title, exact: true })).toBeVisible();
  await page.getByText("阅读正文", { exact: true }).click(); await expect(page.getByText(news.body, { exact: true })).toBeVisible(); expect(writes).toBe(1);
  await page.goto(path("/settings")); await page.getByRole("link", { name: /模型服务/ }).click();
  await page.getByLabel("Provider", { exact: true }).fill("test"); await page.getByLabel("Base URL", { exact: true }).fill("https://synthetic.invalid"); await page.getByLabel("Model", { exact: true }).fill("synthetic"); await page.getByLabel("API Key", { exact: true }).fill("synthetic-key-only");
  await page.getByRole("button", { name: "测试连接", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "合成连接失败" })).toContainText("合成连接失败");
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("synthetic");
  await page.getByRole("button", { name: "保存配置", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "配置已保存" })).toBeVisible();
  expect(writes).toBe(3); expect(await page.getByLabel("API Key", { exact: true }).inputValue()).toBe("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
