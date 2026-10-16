import { expect, test, type Page } from "@playwright/test";
import type { PalaceView } from "../lib/memory/palace";
const id = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const url = process.env.PALACE_MOBILE_BUNDLE === "true" ? "/#/memory" : "/memory";
async function setup(page: Page) {
  let palace: PalaceView | null = null; let changed = false; let reviews = 0; let modelCalls = 0;
  const unit = { id: id(9), cue: "第一词", content: "alpha", reviewCount: 0, lastScore: null, lastReviewedAt: null, nextReviewAt: null };
  const material = { id: id(8), title: "合成单词", sourceText: "alpha", units: [unit], attempts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await page.setViewportSize({ width: 360, height: 844 });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method(); const input = method === "GET" ? null : req.postDataJSON();
    if (path.includes("/model/")) { modelCalls++; return route.abort(); }
    if (path.includes("/memorization/")) return route.fulfill({ json: { data: { material, storageVersion: 1 } } });
    if (!path.includes("/memory-palaces")) return route.fulfill({ json: { data: [] } });
    let data: unknown = null;
    if (path.endsWith("/catalog")) data = { memories: [{ id: id(7), title: "数学偏好" }], documents: [], materials: [{ id: material.id, title: material.title }], truncated: false };
    else if (path.includes("/loci/")) data = changed ? { status: "changed" } : palace?.purpose === "learning" ? { status: "ready", text: "alpha", unit, storageVersion: 1 } : { status: "ready", title: "preference · v1", text: "喜欢数学", useCount: 3, lastUsedAt: null, url: "/memory" };
    else if (path.endsWith("/route")) data = { version: palace!.version, steps: [{ locusId: id(3), label: "门口", association: "一棵字母树", cue: unit.cue, reason: "路线" }], blocked: [] };
    else if (path.endsWith("/review")) { expect(input.expectedStorageVersion).toBe(1); expect(input.recitation).toBe("alpah"); reviews++; data = { material: { ...material, units: [{ ...unit, nextReviewAt: "2026-10-17T08:00:00Z" }] }, storageVersion: 2, evaluation: { score: 60, localScore: 60, source: "deterministic", model: null, feedback: "请核对拼写", missedPoints: [], spelling: { changes: [{ targetStart: 3, kind: "replace", expected: "ha", actual: "ah" }] } }, taskDraft: null, taskDraftUnavailable: true }; }
    else if (method === "POST") { palace = { id: id(1), title: input.title, purpose: input.purpose, version: 1, rooms: [] }; data = palace; }
    else if (method === "PATCH") {
      expect(input.expectedVersion).toBe(palace!.version);
      palace!.version++;
      if (input.operation === "add-room") palace!.rooms.push({ id: id(2), title: input.title, module: input.module, loci: [] });
      if (input.operation === "add-locus") palace!.rooms[0].loci.push({ id: id(3), label: input.label, association: input.association, binding: { source: input.source, revision: "a".repeat(64) } });
      if (input.operation === "edit-locus") Object.assign(palace!.rooms[0].loci[0], { label: input.label, association: input.association });
      if (input.operation === "delete-locus") palace!.rooms[0].loci = [];
      data = palace;
    } else data = palace ? [palace] : [];
    return route.fulfill({ json: { data } });
  });
  await page.goto(url); await page.getByText("打开记忆导航与学习助记", { exact: true }).click();
  return { change: () => { changed = true; }, reviews: () => reviews, calls: () => modelCalls };
}
async function create(page: Page, learning = false) {
  const region = page.getByRole("region", { name: "记忆宫殿", exact: true });
  await region.getByLabel("宫殿名称", { exact: true }).fill("我的宫殿");
  if (learning) await region.getByLabel("宫殿用途").selectOption("learning");
  await region.getByRole("button", { name: "创建宫殿", exact: true }).click();
  await region.getByLabel("房间名称", { exact: true }).fill("书房");
  await region.getByRole("button", { name: "添加房间", exact: true }).click();
  await region.getByRole("button", { name: "读取本房间来源目录" }).click();
  if (learning) { await region.getByRole("combobox", { name: "背书材料", exact: true }).selectOption(id(8)); await region.getByRole("combobox", { name: "关联来源", exact: true }).selectOption(`unit:${id(8)}:${id(9)}`); }
  else await region.getByRole("combobox", { name: "关联来源", exact: true }).selectOption(`memory:${id(7)}`);
  await region.getByLabel("位置名称", { exact: true }).fill("门口"); await region.getByLabel("联想说明", { exact: true }).fill("一棵字母树");
  await region.getByRole("button", { name: "添加来源位置" }).click();
  await expect(region.getByText("1. 门口", { exact: true })).toBeVisible();
  return region;
}
test("memory palace links sources, persists layout, reports usage/staleness and unlinks without source deletion", async ({ page }) => {
  const state = await setup(page); let region = await create(page);
  await region.getByRole("button", { name: "查看 门口 的来源与状态" }).click(); await expect(region.getByText("喜欢数学", { exact: true })).toBeVisible();
  await expect(region.getByText(/实际用于回答 3 次/)).toBeVisible();
  await page.reload(); await page.getByText("打开记忆导航与学习助记", { exact: true }).click(); region = page.getByRole("region", { name: "记忆宫殿", exact: true });
  await expect(region.getByText("1. 门口", { exact: true })).toBeVisible();
  state.change(); await region.getByRole("button", { name: "查看 门口 的来源与状态" }).click(); await expect(region.getByText(/没有读取旧正文/)).toBeVisible();
  await expect(region.getByText("喜欢数学", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept()); await region.getByRole("button", { name: "移除 门口", exact: true }).click(); await expect(region.getByText("1. 门口", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true); expect(state.calls()).toBe(0);
});
test("learning palace hides answers, checks spelling once and displays the existing review schedule", async ({ page }) => {
  const state = await setup(page); const region = await create(page, true);
  await region.getByRole("button", { name: "开始路线/抽测" }).click(); await expect(region.getByText("提示：第一词", { exact: true })).toBeVisible();
  await expect(region.getByText("alpha", { exact: true })).toHaveCount(0);
  await region.getByLabel("本题回忆", { exact: true }).fill("alpah"); await region.getByRole("button", { name: "提交逐字检查并记录" }).click();
  await expect(region.getByText(/60 分 · 请核对拼写/)).toBeVisible(); await expect(region.getByText(/原文位置 3/)).toBeVisible();
  await expect(region.getByText(/下次复习：2026-10-17/)).toBeVisible(); await expect(region.getByText("本路线完成，复习记录保存在背书材料。", { exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: "提交逐字检查并记录" })).toBeDisabled(); expect(state.reviews()).toBe(1); expect(state.calls()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
});
