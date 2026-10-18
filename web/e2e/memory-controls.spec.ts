import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { DEFAULT_MEMORY_CONTROLS } from "../lib/memory/controls";
const uuid = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`;
const url = process.env.MEMORY_DATA_MOBILE_BUNDLE === "true" ? "/#/memory?view=controls" : "/memory?view=controls";
test("memory controls preserve drafts on a cross-device conflict and distinguish an offline refresh", async ({ page }) => {
  let version = 0; let settings = structuredClone(DEFAULT_MEMORY_CONTROLS); let offline = false; let writes = 0;
  await page.setViewportSize({ width: 360, height: 844 });
  await page.route("**/api/v1/**", (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (!path.includes("/memory-data/")) return route.fulfill({ json: { data: [] } });
    if (offline) return route.fulfill({ status: 503, json: { error: { message: "服务端暂不可用" } } });
    if (req.method() === "PATCH") { const input = req.postDataJSON(); writes++; if (input.expectedVersion !== version) return route.fulfill({ status: 409, json: { error: { message: "另一端已修改，请刷新；草稿保留" } } }); settings = input.settings; version++; }
    return route.fulfill({ json: { data: path.endsWith("/controls") ? { settings, version } : { memories: [], collections: [], documents: [], palaces: [] } } });
  });
  await page.goto(url); const region = page.getByRole("region", { name: "数据控制与迁移" }); await region.getByText("打开用户控制与跨端检查").click();
  await region.getByRole("button", { name: "刷新服务端数据与开关" }).click(); await region.getByLabel("陪伴读取长期记忆", { exact: true }).uncheck();
  version = 1; // Another device saved while this editor still has v0.
  await region.getByRole("button", { name: "保存记忆读取开关" }).click(); await expect(region.getByRole("alert")).toContainText("另一端");
  await expect(region.getByLabel("陪伴读取长期记忆", { exact: true })).not.toBeChecked(); expect(writes).toBe(1);
  page.once("dialog", (dialog) => dialog.dismiss()); await region.getByRole("button", { name: "刷新服务端数据与开关" }).click(); await expect(region.getByLabel("陪伴读取长期记忆", { exact: true })).not.toBeChecked();
  page.once("dialog", (dialog) => dialog.accept()); await region.getByRole("button", { name: "刷新服务端数据与开关" }).click(); await expect(region.getByLabel("陪伴读取长期记忆", { exact: true })).toBeChecked();
  await region.getByLabel("专业读取敏感记忆", { exact: true }).uncheck(); await region.getByRole("button", { name: "保存记忆读取开关" }).click(); await expect(region.getByRole("status")).toContainText("已保存");
  offline = true; await region.getByRole("button", { name: "刷新服务端数据与开关" }).click(); await expect(region.getByRole("alert")).toContainText("暂不可用");
  await expect(region.getByLabel("专业读取敏感记忆", { exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
});
test("exports only selected data and previews a local package without uploading its contents or restoring", async ({ page }) => {
  let exports = 0; let unexpectedWrites = 0; let manifestCalls = 0;
  const file = { format: "ai-study-companion.memory-package", schemaVersion: 1, exportedAt: "2026-10-17T00:00:00Z", memories: [], collections: [{ id: uuid(1), title: "数学资料", description: "", module: "professional", version: 1, documents: [{ id: uuid(2), version: 1, title: "数学", sourceKey: "math", format: "text", content: "LOCAL-PRIVATE-CONTENT", sourceUrl: "", fileName: "" }] }], palaces: [] };
  await page.route("**/api/v1/**", (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path.endsWith("/export")) { exports++; expect(req.postDataJSON()).toEqual({ memories: false, palaces: false, collectionIds: [uuid(1)] }); return route.fulfill({ json: { data: file } }); }
    if (req.method() !== "GET") unexpectedWrites++;
    if (!path.includes("/memory-data/")) return route.fulfill({ json: { data: [] } });
    if (path.endsWith("/controls")) return route.fulfill({ json: { data: { settings: DEFAULT_MEMORY_CONTROLS, version: 0 } } });
    manifestCalls++; return route.fulfill({ json: { data: { memories: [], palaces: [], collections: [{ id: uuid(1), title: "数学资料", module: "professional", version: 2 }], documents: [{ id: uuid(2), version: 2 }] } } });
  });
  await page.goto(url); const region = page.getByRole("region", { name: "数据控制与迁移" }); await region.getByText("打开用户控制与跨端检查").click(); await region.getByRole("button", { name: "刷新服务端数据与开关" }).click();
  await expect(region.getByRole("button", { name: "导出所选记忆包" })).toBeDisabled(); await region.getByLabel("导出集合：数学资料", { exact: false }).check(); await region.getByLabel("我确认导出包含私人内容", { exact: false }).check();
  const download = page.waitForEvent("download"); await region.getByRole("button", { name: "导出所选记忆包" }).click();
  const artifact = await download; expect(JSON.parse(await readFile((await artifact.path())!, "utf8"))).toEqual(file);
  await region.getByLabel("选择记忆包进行本地预演").setInputFiles({ name: "package.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await expect(region.getByText(/待核对引用：0 · 实际写入：0/)).toBeVisible(); await expect(region.getByText(/资料：1项.*版本冲突 1/)).toBeVisible();
  expect(exports).toBe(1); expect(unexpectedWrites).toBe(0); expect(manifestCalls).toBe(2);
  await region.getByLabel("选择记忆包进行本地预演").setInputFiles({ name: "wrong.json", mimeType: "application/json", buffer: Buffer.from('{"apiKey":"synthetic"}') });
  await expect(region.getByRole("alert")).toContainText("未上传、未写入");
});
test("an existing memory edit retains its unsaved body when another device has changed the version", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  let reads = 0; let content = "数学目标"; let version = 1;
  const record = () => ({ id: uuid(3), candidateId: uuid(4), sourceConversationId: null, sourceMessageId: null, kind: "goal", content, evidenceQuote: "", sensitivity: "low", pinned: false, validUntil: null, lastUsedAt: null, useCount: 0, version, createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z" });
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.includes("/memories")) return route.fulfill({ json: { data: [] } });
    if (route.request().method() === "PATCH") return route.fulfill({ status: 409, json: { error: { message: "记忆已被另一端更改" } } });
    reads++; return route.fulfill({ json: { data: [record(), { ...record(), id: uuid(5), candidateId: uuid(6), content: "过期合成记忆", validUntil: "2020-01-01T00:00:00Z" }] } });
  });
  await page.goto(process.env.MEMORY_DATA_MOBILE_BUNDLE === "true" ? "/#/memory" : "/memory"); const region = page.getByRole("region", { name: "已确认的长期记忆" });
  await region.getByRole("textbox", { name: "编辑记忆：数学目标" }).fill("手机未保存的草稿"); content = "电脑已经保存的新版"; version++;
  await region.getByRole("button", { name: "保存修改", exact: true }).click(); await expect(region.getByRole("alert")).toContainText("另一端"); await expect(region.getByRole("textbox", { name: "编辑记忆：数学目标" })).toHaveValue("手机未保存的草稿"); expect(reads).toBe(1);
  page.once("dialog", (dialog) => dialog.dismiss()); await region.getByRole("button", { name: "刷新已确认记忆" }).click(); await expect(region.getByRole("textbox", { name: "编辑记忆：数学目标" })).toHaveValue("手机未保存的草稿");
  page.once("dialog", (dialog) => dialog.accept()); await region.getByRole("button", { name: "刷新已确认记忆" }).click(); await expect(region.getByRole("textbox", { name: "编辑记忆：电脑已经保存的新版" })).toHaveValue(content);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
});
