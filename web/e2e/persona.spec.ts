import { expect, test } from "@playwright/test";

test("edits a structured Persona Profile on mobile", async ({ page }) => {
  let profile = {
    userId: "local-user",
    name: "知伴",
    preferredAddress: null as string | null,
    warmth: 70,
    humor: 20,
    directness: 60,
    verbosity: 50,
    initiative: 40,
    version: 1,
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/persona-profile", async (route) => {
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

  await page.goto("/persona");
  await expect(page.getByRole("heading", { name: "她怎样与你说话" })).toBeVisible();
  await page.getByLabel("助手称呼").fill("小知");
  await page.getByLabel("希望她怎样称呼你（可选）").fill("小林");
  await page.getByRole("slider", { name: "温暖度" }).fill("90");
  await page.getByRole("slider", { name: "直接度" }).fill("80");

  await expect(page.getByTestId("persona-preview")).toContainText("小知");
  await expect(page.getByTestId("persona-preview")).toContainText("小林");
  await expect(page.getByTestId("persona-preview")).toContainText("不能改变事实");

  await page.getByRole("button", { name: "保存人格设置" }).click();
  await expect(page.getByRole("status")).toContainText("下一次模型回答会使用新设置");
  await expect(page.getByLabel("助手称呼")).toHaveValue("小知");
  await page.getByRole("button", { name: "打开模式与导航" }).click();
  await expect(page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "对话", exact: true })).toHaveAttribute("href", "/chat");
});
