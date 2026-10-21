import { expect, test } from "@playwright/test";
const path = (route: string) => process.env.R12_MOBILE_BUNDLE === "true" ? `/#${route}` : route;
test("R12 200% text scaling and 100 long inbox titles remain readable without page overflow", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/v1/**", (route) => {
    if (route.request().method() !== "GET") writes++;
    const url = new URL(route.request().url());
    const data = url.pathname === "/api/v1/inbox" ? Array.from({ length: 100 }, (_, index) => ({
      id: `synthetic-${index}`, title: `${index + 1} ${"长标题阅读与来源定位".repeat(10)}`, source: "personal_briefing", body: "合成压力数据，不涉及用户内容。", status: "unread", occurredAt: "2026-10-21T00:00:00Z", briefingSources: null, reflectionQuestions: null, feedback: null,
    })) : url.pathname.endsWith("/health") ? { status: "healthy", checks: { database: "ready", modelProvider: "configured" } } : [];
    return route.fulfill({ json: { data } });
  });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(path("/settings"));
  await page.getByRole("link", { name: /模型服务/ }).waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "test-results/r12-text-200.png" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  await page.setViewportSize({ width: 360, height: 900 }); await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(path("/inbox")); await expect(page.getByRole("article")).toHaveCount(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); expect(writes).toBe(0);
  await page.screenshot({ path: "test-results/r12-long-inbox-dark.png" });
});
