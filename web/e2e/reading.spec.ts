import { expect, test } from "@playwright/test";

test("edits the server-side reading profile on mobile", async ({ page }) => {
  let profile = {
    userId: "local-user",
    topics: ["认知科学"],
    readBooks: [],
    wantToReadBooks: [],
    dislikedBooks: [],
    difficulty: "intermediate",
    weeklyMinutes: 120,
    goal: "systematic",
    version: 1,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/reading-profile", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      profile = {
        ...profile,
        ...input,
        version: profile.version + 1,
        updatedAt: "2026-09-27T01:00:00.000Z",
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: profile }),
    });
  });

  await page.goto("/reading");
  await expect(page.getByRole("heading", { name: "你想怎样读书" })).toBeVisible();
  await page.getByLabel("当前学习与兴趣方向").fill("认知科学\n世界史");
  await page.getByLabel("当前难度").selectOption("advanced");
  await page.getByLabel("推荐目标").selectOption("broaden");
  await page.getByLabel("每周可投入分钟").fill("240");
  await page.getByLabel("想读清单").fill("枪炮、病菌与钢铁 — 贾雷德·戴蒙德");
  await page.getByRole("button", { name: "保存阅读画像" }).click();

  await expect(page.getByRole("status")).toContainText("下一次书籍推荐会使用新设置");
  await expect(page.getByLabel("当前学习与兴趣方向")).toHaveValue("认知科学\n世界史");
  await expect(page.getByRole("link", { name: "去创建书籍推荐" })).toHaveAttribute("href", "/tasks?section=scheduled");
});
