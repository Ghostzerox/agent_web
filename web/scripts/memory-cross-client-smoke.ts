// Web and packaged React pages share the real local API. Only this script's synthetic sources/layout mutate.
import { chromium, expect, type Page } from "@playwright/test";
import { strict as assert } from "node:assert";
import type { PalaceView } from "../lib/memory/palace";
const api = "http://127.0.0.1:3000/api/v1";
async function data<T>(path: string, method = "GET", body?: unknown): Promise<T> { const result = await fetch(`${api}${path}`, { method, signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }); if (!result.ok) throw new Error(`Cross-client synthetic API ${method} ${result.status}`); return result.status === 204 ? undefined as T : (await result.json()).data; }
async function main() {
  const browser = await chromium.launch({ channel: "msedge" }); let collectionId: string | null = null; let palaceId: string | null = null; let learningPalaceId: string | null = null; let materialId: string | null = null;
  try {
    const collection = await data<{ id: string }>("/knowledge", "POST", { title: `R5.6 cross-client ${crypto.randomUUID()}`, description: "Synthetic only", module: "professional" }); collectionId = collection.id;
    const input = { title: "跨端合成资料", sourceKey: "cross-client", format: "text", content: "跨端原文第一版", sourceUrl: "", fileName: "" };
    const document = await data<{ id: string }>(`/knowledge/collections/${collectionId}/documents`, "POST", input);
    let p = await data<PalaceView>("/memory-palaces", "POST", { title: "跨端合成宫殿", purpose: "navigation" }); palaceId = p.id;
    p = await data(`/memory-palaces/${p.id}`, "PATCH", { operation: "add-room", title: "书房", module: "professional", expectedVersion: p.version });
    p = await data(`/memory-palaces/${p.id}`, "PATCH", { operation: "add-locus", roomId: p.rooms[0].id, label: "书桌", association: "合成联想", source: { kind: "knowledge", id: document.id }, expectedVersion: p.version });
    const configure = async (page: Page) => {
      await page.route("**/api/v1/**", async (route) => {
        const req = route.request(); const target = new URL(req.url()); const path = target.pathname.replace("/api/v1", "");
        // Do not render or change the user's unrelated memories, credentials or plugin state.
        const ownMaterial = materialId && (path === "/memorization" || path === `/memorization/${materialId}`);
        if (!path.startsWith("/memory-palaces") && !ownMaterial) return route.fulfill({ json: { data: [] } });
        const result = await fetch(`${api}${path}${target.search}`, { method: req.method(), signal: AbortSignal.timeout(15000), ...(req.postData() ? { headers: { "content-type": "application/json" }, body: req.postData()! } : {}) });
        const payload = await result.json(); if (path === "/memory-palaces") payload.data = payload.data.filter((row: { id: string }) => row.id === palaceId || row.id === learningPalaceId);
        if (path === "/memorization") payload.data = payload.data.filter((row: { id: string }) => row.id === materialId);
        await route.fulfill({ status: result.status, json: payload });
      });
    };
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const mobile = await browser.newPage({ viewport: { width: 360, height: 844 } });
    await configure(desktop); await configure(mobile);
    await desktop.goto("http://127.0.0.1:3000/memory"); await mobile.goto(`${process.env.MOBILE_UI_BASE_URL ?? "http://127.0.0.1:4174"}/#/memory`);
    for (const page of [desktop, mobile]) { await page.getByText("打开记忆导航与学习助记", { exact: true }).click(); await expect(page.getByRole("button", { name: "编辑 书桌", exact: true })).toBeVisible(); }
    const d = desktop.getByRole("region", { name: "记忆宫殿", exact: true }); const m = mobile.getByRole("region", { name: "记忆宫殿", exact: true });
    await m.getByRole("button", { name: "编辑 书桌", exact: true }).click(); await m.getByLabel("位置名称", { exact: true }).fill("手机保留草稿");
    await d.getByRole("button", { name: "编辑 书桌", exact: true }).click(); await d.getByLabel("位置名称", { exact: true }).fill("电脑新版书桌"); await d.getByRole("button", { name: "保存位置与联想", exact: true }).click();
    await m.getByRole("button", { name: "保存位置与联想", exact: true }).click(); await expect(m.getByRole("alert")).toContainText("布局已变化"); await expect(m.getByLabel("位置名称", { exact: true })).toHaveValue("手机保留草稿");
    await m.getByRole("button", { name: "取消编辑", exact: true }).click(); await m.getByRole("button", { name: "刷新宫殿", exact: true }).click(); await expect(m.getByText("1. 电脑新版书桌", { exact: true })).toBeVisible();
    await data(`/knowledge/documents/${document.id}`, "PATCH", { ...input, content: "跨端原文第二版", expectedVersion: 1 });
    await m.getByRole("button", { name: "查看 电脑新版书桌 的来源与状态", exact: true }).click(); await expect(m.getByText(/没有读取旧正文/)).toBeVisible();
    assert(await mobile.evaluate(() => window.document.documentElement.scrollWidth <= 360));
    console.log("Real Web + local React Bundle → same Docker API/PG passed: shared layout, stale-version refusal, draft retention, explicit refresh and changed-source refusal. Zero model calls. Not a Huawei hardware test.");
    const eligibility = await fetch(`${api}/memorization`, { signal: AbortSignal.timeout(15000) });
    if (eligibility.status === 403) console.log("Learning round-trip skipped: existing plugin grant/availability does not permit it; no grants changed. Requires user-authorized hardware follow-up.");
    else {
      if (!eligibility.ok) throw new Error("Learning eligibility unavailable");
      const listing = (await eligibility.json()).data as { id: string }[];
      if (listing.length >= 12) console.log("Learning round-trip skipped: material capacity full; no user materials removed.");
      else {
        const created = await data<{ material: { id: string; units: { id: string }[] }; storageVersion: number }>("/memorization", "POST", { title: "R5.6 synthetic learning", sourceText: "alpha beta", units: [{ cue: "合成提示", content: "alpha beta" }] }); materialId = created.material.id;
        let learning = await data<PalaceView>("/memory-palaces", "POST", { title: "跨端合成学习宫殿", purpose: "learning" }); learningPalaceId = learning.id;
        learning = await data(`/memory-palaces/${learning.id}`, "PATCH", { operation: "add-room", title: "学习房间", module: "memorization", expectedVersion: learning.version });
        learning = await data(`/memory-palaces/${learning.id}`, "PATCH", { operation: "add-locus", roomId: learning.rooms[0].id, label: "学习书桌", association: "字母联想", source: { kind: "unit", id: materialId, unitId: created.material.units[0].id }, expectedVersion: learning.version });
        await m.getByRole("button", { name: "刷新宫殿", exact: true }).click(); await m.getByRole("combobox", { name: "当前宫殿", exact: true }).selectOption(learning.id);
        await m.getByRole("button", { name: "开始路线/抽测", exact: true }).click(); await m.getByLabel("本题回忆", { exact: true }).fill("alpha beta"); await m.getByRole("button", { name: "提交逐字检查并记录", exact: true }).click(); await expect(m.getByText(/100 分/)).toBeVisible();
        await desktop.goto("http://127.0.0.1:3000/study/memorization"); await expect(desktop.getByText(/1\/1 已复习/)).toBeVisible();
        const after = await data<{ material: { attempts: unknown[]; units: { reviewCount: number; nextReviewAt: string | null }[] } }>(`/memorization/${materialId}`);
        assert.equal(after.material.attempts.length, 1); assert.equal(after.material.units[0].reviewCount, 1); assert(after.material.units[0].nextReviewAt);
        console.log("Real authorized learning round-trip passed: synthetic material → local React palace recitation → original Gateway review record → Web 1/1 reviewed. Deterministic grading, zero model calls, no task created.");
      }
    }
  } finally {
    await browser.close();
    if (learningPalaceId) { const p = await data<PalaceView>(`/memory-palaces/${learningPalaceId}`); await data(`/memory-palaces/${learningPalaceId}`, "DELETE", { expectedVersion: p.version }); }
    if (materialId) { const current = await data<{ storageVersion: number }>(`/memorization/${materialId}`); await data(`/memorization/${materialId}`, "DELETE", { expectedVersion: current.storageVersion }); }
    if (palaceId) { const p = await data<PalaceView>(`/memory-palaces/${palaceId}`); await data(`/memory-palaces/${palaceId}`, "DELETE", { expectedVersion: p.version }); }
    if (collectionId) { const rows = await data<{ id: string; version: number }[]>("/knowledge"); const own = rows.find((r) => r.id === collectionId); if (own) await data(`/knowledge/collections/${collectionId}`, "DELETE", { expectedVersion: own.version }); }
    console.log("Removed only this run's synthetic palace/source collection; no user preferences changed.");
  }
}
void main().catch(() => { console.error("Cross-client synthetic smoke failed; check its own cleanup before retrying."); process.exitCode = 1; });
