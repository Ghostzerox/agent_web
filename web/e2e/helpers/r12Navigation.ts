import { type Page, expect } from "@playwright/test";

export async function selectWorldSection(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "世界创作局部导航" });
  await expect(nav).toBeVisible();
  const select = nav.getByRole("combobox", { name: "当前分区", exact: true });
  if ((page.viewportSize()?.width ?? 1440) < 768) await select.selectOption({ label });
  else {
    const link = nav.getByRole("link", { name: label, exact: true, includeHidden: true });
    const group = link.locator("xpath=../..");
    if (await group.getAttribute("open") === null) await group.locator("summary").click();
    await link.click();
  }
}
export async function confirmNewJourney(page: Page) {
  await page.getByRole("button", { name: "开始新旅程", exact: true }).click();
  await page.getByRole("dialog", { name: "开始新旅程", exact: true }).getByRole("button", { name: "创建新旅程", exact: true }).click();
  await expect(page.getByRole("link", { name: "打开新旅程 →", exact: true })).toBeVisible();
}
