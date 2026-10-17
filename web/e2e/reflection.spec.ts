import { expect, test } from "@playwright/test";

test("edits reflection quality controls on mobile", async ({ page }) => {
  let preferences = {
    userId: "local-user",
    enabled: true,
    goals: ["完成作品集"],
    avoidTopics: [],
    style: "balanced",
    maxQuestions: 1,
    version: 1,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/reflection-preferences", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      preferences = {
        ...preferences,
        ...input,
        version: preferences.version + 1,
        updatedAt: "2026-09-27T01:00:00.000Z",
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: preferences }),
    });
  });

  await page.goto("/reflection");
  await expect(page.getByRole("heading", { name: "让问题真正值得想" })).toBeVisible();
  await expect(page.getByText("系统先生成 3–5 个候选")).toBeVisible();
  await page.getByLabel("当前目标").fill("完成作品集\n稳定学习节奏");
  await page.getByLabel("暂不触碰的话题").fill("家庭隐私");
  await page.getByLabel("提问风格").selectOption("gentle");
  await page.getByLabel("每次最多展示").selectOption("2");
  await page.getByRole("button", { name: "保存设置" }).click();

  await expect(page.getByRole("status")).toContainText("下一次生成立即生效");
  await expect(page.getByLabel("当前目标")).toHaveValue("完成作品集\n稳定学习节奏");
  await expect(page.getByRole("link", { name: "创建思考问题任务" })).toHaveAttribute("href", "/tasks?section=scheduled");
});
