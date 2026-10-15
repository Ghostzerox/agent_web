import { expect, test } from "@playwright/test";

test("shared tools work offline on a narrow screen and require confirmation for writes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  let writes = 0;
  await page.route("**/api/v1/**", async (route) => {
    if (route.request().method() !== "GET") {
      expect(route.request().url()).toContain("/tasks"); writes++;
      return route.fulfill({ status: 201, json: { data: { id: "synthetic-task" } } });
    }
    return route.fulfill({ status: 503, json: { error: { message: "模拟离线" } } });
  });
  await page.goto("/tools");
  await page.getByLabel("选择工具").selectOption("professional.calculate");
  await page.getByLabel("工具输入").fill('{"expression":"(1+2)*3"}');
  await page.getByRole("button", { name: "运行工具", exact: true }).click();
  await expect(page.getByRole("status")).toContainText('"value": 9');
  await page.getByLabel("选择工具").selectOption("professional.locate-evidence");
  await page.getByRole("button", { name: "运行工具", exact: true }).click();
  await expect(page.getByRole("status")).toContainText('"line": 2');
  await page.getByLabel("选择工具").selectOption("reflection.action-draft");
  const input = JSON.parse(await page.getByLabel("工具输入").inputValue());
  input.after = new Date().toISOString(); input.steps[0].runAt = new Date(Date.now() + 86400000).toISOString();
  await page.getByLabel("工具输入").fill(JSON.stringify(input));
  await page.getByRole("button", { name: "运行工具", exact: true }).click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "确认创建此提醒" }).click();
  await expect(page.getByRole("button", { name: "提醒已创建" })).toBeDisabled();
  expect(writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
