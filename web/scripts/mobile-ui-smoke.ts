import { chromium, expect } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 844 } });
    let mode = "professional"; let writes = 0;
    const conversation = () => ({ id: "mobile-ui", title: "移动 UI 测试", mode, activeLeafMessageId: null, version: writes + 1, updatedAt: "2026-10-01T00:00:00Z", messages: [] });
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(); const url = new URL(request.url());
      let data: unknown = [];
      if (url.pathname.includes("conversations")) {
        if (request.method() !== "GET") { writes++; mode = request.postDataJSON().mode; }
        data = url.pathname.endsWith("/conversations") ? [conversation()] : conversation();
      }
      return route.fulfill({ json: { data } });
    });
    await page.goto(`${process.env.MOBILE_UI_BASE_URL ?? "http://127.0.0.1:4174"}/#/chat`);
    const menu = page.getByRole("button", { name: "打开模式与导航" });
    await expect(page.getByLabel("对话模式")).toHaveValue("professional");
    const skip = page.getByRole("link", { name: "跳至主要内容" });
    await skip.focus(); await skip.press("Enter");
    await expect(page).toHaveURL(/#\/chat$/);
    await menu.click();
    await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "陪伴", exact: true }).click();
    await expect(page).toHaveURL(/#\/chat\?mode=companion$/);
    await expect(page.getByRole("button", { name: "切换当前会话为陪伴" })).toBeVisible();
    // A same-page hash change must update intent and close the menu, not silently mutate the session.
    expect(writes).toBe(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "切换当前会话为陪伴" }).click();
    await expect(page.getByLabel("对话模式")).toHaveValue("companion");
    const input = page.getByLabel("消息输入");
    await input.fill("尚未发送的草稿");
    await menu.click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "学习模式" }).click();
    await expect(page).toHaveURL(/#\/chat\?mode=companion$/);
    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("尚未发送的草稿");
    await input.fill("");
    await menu.click();
    await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "学习模式" }).click();
    await expect(page.locator("h1")).toHaveText("学习模式");
    await page.goBack();
    await expect(page.locator("h1")).toHaveText("AI 对话");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
    expect(writes).toBe(1);
    await menu.click();
    await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "工具工作台" }).click();
    await expect(page.locator("h1")).toHaveText("工具工作台");
    await page.getByLabel("选择工具").selectOption("professional.calculate");
    await page.getByLabel("工具输入").fill('{"expression":"2+3*4"}');
    await page.getByRole("button", { name: "运行工具", exact: true }).click();
    await expect(page.getByRole("status")).toContainText('"value": 14');
    expect(writes).toBe(1);
    await menu.click();
    await page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "知伴" }).click();
    await expect(page.locator("h1")).toHaveText("AI 学习伴侣");
    console.log("Local React bundle UI smoke passed: hash mode intent, explicit update, draft cancellation, learning route, browser back, 360px width. No model calls.");
  } finally { await browser.close(); }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
