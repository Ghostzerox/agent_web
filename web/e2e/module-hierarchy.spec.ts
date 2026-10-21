import { expect, test, type Page } from "@playwright/test";
const mobile = process.env.R8_MOBILE_BUNDLE === "true";
const path = (url: string) => mobile ? `/#${url}` : url;
const id = "00000000-0000-4000-8000-000000000001";
async function local(page: Page, label: string) {
  await page.getByRole("button", { name: "打开本模块功能", exact: true }).click();
  await page.getByRole("navigation", { name: "模块内导航" }).getByRole("link", { name: label, exact: true }).click();
}

for (const width of [360, 1440]) test(`module directories and independent child workspaces at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); let writes = 0; const reads: string[] = [];
  await page.route("**/api/v1/**", (route) => {
    if (route.request().method() !== "GET") writes++;
    reads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 503, json: { error: { message: "合成离线反馈" } } });
  });
  for (const url of ["/settings", "/content", "/tasks", "/entertainment", "/study"]) {
    await page.goto(path(url)); await expect(page.locator("h1")).toBeVisible();
    if (url !== "/tasks") await expect(page.locator("input,textarea")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (url === "/settings" || url === "/tasks") await page.screenshot({ path: `test-results-r8-visual/${mobile ? "react" : "web"}-${url.slice(1)}-${width}.png`, fullPage: true });
  }
  expect(reads.filter((url) => !["/api/v1/health", "/api/v1/actions", "/api/v1/inbox"].includes(url))).toEqual([]);
  await page.goto(path("/tasks")); await page.getByRole("link", { name: "行动与待办", exact: true }).click();
  await page.getByLabel("行动名称", { exact: true }).fill("不能丢失的草稿");
  await page.getByRole("button", { name: "打开本模块功能", exact: true }).click(); page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("navigation", { name: "模块内导航" }).getByRole("link", { name: "习惯打卡", exact: true }).click();
  await expect(page.getByLabel("行动名称", { exact: true })).toHaveValue("不能丢失的草稿");
  await page.getByRole("button", { name: "打开本模块功能", exact: true }).click(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("navigation", { name: "模块内导航" }).getByRole("link", { name: "习惯打卡", exact: true }).click();
  await expect(page.getByLabel("行动名称", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/section=habits$/);
  await expect(page.getByRole("button", { name: "刷新行动记录", exact: true })).toBeVisible();
  await local(page, "任务首页"); await expect(page.getByRole("link", { name: "行动与待办", exact: true })).toBeVisible();
  await page.goto(path("/memory?view=knowledge&palace=learning")); await expect(page.getByRole("alert").filter({ hasText: "记忆链接参数" })).toContainText("参数无效或冲突");
  await expect(page.getByRole("region", { name: "知识资料库" })).toHaveCount(0);
  await page.goto(path("/memory?palace=learning")); await expect(page.getByRole("alert").filter({ hasText: "记忆链接参数" })).toContainText("参数无效或冲突");
  await page.goto(path("/study/memory-palaces")); await expect(page.getByRole("heading", { name: "学习助记宫殿", level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "个人数据子页" })).toHaveCount(0);
  expect(writes).toBe(0);
});

test("memory child links mount only the chosen editor and preserve folded drafts", async ({ page }) => {
  const reads: string[] = []; let writes = 0;
  await page.route("**/api/v1/**", (route) => {
    reads.push(new URL(route.request().url()).pathname); if (route.request().method() !== "GET") writes++;
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto(path("/memory?view=navigation"));
  await page.getByText("展开 AI 记忆导航", { exact: true }).click();
  await page.getByLabel("宫殿名称", { exact: true }).fill("未保存宫殿");
  await page.getByText("展开 AI 记忆导航", { exact: true }).click();
  await page.getByText("展开 AI 记忆导航", { exact: true }).click();
  await expect(page.getByLabel("宫殿名称", { exact: true })).toHaveValue("未保存宫殿");
  page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("link", { name: "候选审核", exact: true }).click();
  await expect(page.getByLabel("宫殿名称", { exact: true })).toHaveValue("未保存宫殿");
  expect(reads.some((url) => url.includes("/memory-candidates") || url.includes("/knowledge"))).toBe(false); expect(writes).toBe(0);
});

test("inbox source and highlight locate a delivered result without marking it read", async ({ page }) => {
  let writes = 0;
  const item = { id, title: "指定简报", source: "personal_briefing", body: "这是一条合成正文", status: "unread", occurredAt: "2026-10-18T00:00:00Z", briefingSources: null, reflectionQuestions: null, feedback: null };
  await page.route("**/api/v1/**", (route) => { if (route.request().method() !== "GET") writes++; return route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/inbox") ? [item] : [] } }); });
  await page.goto(path(`/inbox?source=personal_briefing&highlight=${id}`));
  await expect(page.getByRole("article", { name: "定位结果：指定简报" })).toBeVisible();
  await expect(page.getByText("这是一条合成正文", { exact: true })).toBeVisible();
  await page.goto(path("/inbox?highlight=missing")); await expect(page.getByText(/指定投递不在当前可访问列表/)).toBeVisible();
  expect(writes).toBe(0);
});

test("canceling history back preserves a dirty memory editor and its URL", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto(path("/memory"));
  await page.getByRole("link", { name: "AI 记忆导航", exact: true }).click();
  await page.getByText("展开 AI 记忆导航", { exact: true }).click();
  await page.getByLabel("宫殿名称", { exact: true }).fill("返回时不能丢失");
  // The existing navigation guard has a 500 ms same-navigation approval window.
  // Let that window expire before testing an independent history traversal.
  await page.waitForTimeout(550);
  const dialog = page.waitForEvent("dialog");
  await page.evaluate(() => history.back()); await (await dialog).dismiss();
  await expect(page).toHaveURL(/view=navigation$/);
  await expect(page.getByLabel("宫殿名称", { exact: true })).toHaveValue("返回时不能丢失");
});
