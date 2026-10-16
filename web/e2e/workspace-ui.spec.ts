import { expect, test } from "@playwright/test";

const routes = ["/", "/chat", "/tools", "/study", "/study/memorization", "/study/problem-solving", "/entertainment", "/entertainment/quick-adventure", "/tasks", "/inbox", "/reading", "/reflection", "/memory", "/persona", "/voice", "/proactivity", "/plugins", "/notifications", "/api-key"];
for (const width of [360, 390, 1440]) {
  test(`all pages retain readable shells and recoverable offline states at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let writes = 0;
    await page.route("**/api/v1/**", (route) => {
      if (route.request().method() !== "GET") writes++;
      return route.fulfill({ status: 503, json: { error: { message: "测试服务端暂时离线" } } });
    });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), route).toBe(true);
      if (width < 1024) await expect(page.getByRole("button", { name: "打开模式与导航" })).toBeVisible();
      else await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
    }
    expect(writes).toBe(0);
    expect(pageErrors).toEqual([]);
  });
}

test("mobile navigation traps focus, closes with Escape/back/backdrop, and never generates content", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  let writes = 0;
  await page.route("**/api/v1/**", (route) => { if (route.request().method() !== "GET") writes++; return route.fulfill({ status: 503, json: { error: { message: "服务端暂时离线" } } }); });
  await page.goto("/study");
  const opener = page.getByRole("button", { name: "打开模式与导航" });
  const drawer = page.getByRole("dialog", { name: "模式与导航" });
  await opener.click();
  await expect(drawer.getByRole("link", { name: "学习模式" })).toHaveAttribute("aria-current", "page");
  for (let index = 0; index < 24; index++) { await page.keyboard.press("Tab"); expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  expect(await page.evaluate(() => window.dispatchEvent(new Event("companion:back", { cancelable: true })))).toBe(false);
  await expect(drawer).toHaveCount(0);
  await opener.click();
  await page.mouse.click(350, 20);
  await expect(drawer).toHaveCount(0);
  await opener.click();
  await drawer.getByRole("link", { name: "学习模式" }).click();
  await expect(page.locator("h1")).toHaveText("学习模式");
  expect(writes).toBe(0);
});

test("unsaved notification settings can cancel navigation and successful save clears the guard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let preferences = { pushEnabled: false, quietHoursEnabled: true, quietStart: "22:00", quietEnd: "08:00", timezone: "Asia/Shanghai", version: 1 };
  let writes = 0;
  await page.route("**/api/v1/**", (route) => {
    if (route.request().method() === "PATCH") {
      writes++; const input = route.request().postDataJSON();
      preferences = { ...preferences, quietStart: input.quietStart, version: 2 };
      return route.fulfill({ json: { data: preferences } });
    }
    return route.fulfill({ json: { data: { publicKey: null, preferences, subscriptions: [] } } });
  });
  await page.goto("/notifications");
  await page.getByLabel("安静时段开始", { exact: true }).fill("23:15");
  await page.getByRole("button", { name: "打开模式与导航" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "学习模式" }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await page.getByRole("button", { name: "关闭模式与导航" }).click();
  await expect(page.getByLabel("安静时段开始", { exact: true })).toHaveValue("23:15");
  await page.getByRole("button", { name: "保存通知偏好" }).click();
  await expect(page.getByRole("status")).toContainText("通知偏好已保存");
  await page.getByRole("button", { name: "打开模式与导航" }).click();
  await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "学习模式" }).click();
  await expect(page).toHaveURL(/\/study$/);
  expect(writes).toBe(1);
});

test("mode entry needs confirmation and long math/code stay within a full-width mobile answer", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  let mode = "professional"; let writes = 0;
  const messages = [{ id: "u", parentMessageId: null, role: "user", content: "解释", createdAt: "2026-10-01T00:00:00Z" }, { id: "a", parentMessageId: "u", role: "assistant", content: `分数：$\\frac{a+b}{c+d}$\n\n$$\n${"x_1+".repeat(60)}x_2\n$$\n\n\`\`\`js\n${"long_code_".repeat(60)}\n\`\`\``, createdAt: "2026-10-01T00:00:00Z" }];
  const conversation = () => ({ id: "session-ui", title: "UI 测试", mode, activeLeafMessageId: "a", version: writes + 1, updatedAt: "2026-10-01T00:00:00Z", messages });
  await page.route("**/api/v1/**", (route) => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith("/knowledge")) return route.fulfill({ json: { data: [] } });
    if (request.method() !== "GET") { writes++; mode = request.postDataJSON().mode; }
    return route.fulfill({ json: { data: pathname.endsWith("/conversations") ? [conversation()] : conversation() } });
  });
  await page.goto("/chat?mode=companion");
  await expect(page.getByLabel("对话模式")).toHaveValue("professional");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "切换当前会话为陪伴" }).click();
  await expect(page.getByLabel("对话模式")).toHaveValue("companion");
  expect(writes).toBe(1);
  await expect(page.locator(".katex-display")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
  expect((await page.locator(".chat-markdown").last().boundingBox())!.width).toBeGreaterThan(270);
  const input = page.getByLabel("消息输入");
  await input.fill("第一行"); await input.press("Shift+Enter"); await input.pressSequentially("第二行");
  await expect(input).toHaveValue("第一行\n第二行");
  expect(writes).toBe(1);
});
