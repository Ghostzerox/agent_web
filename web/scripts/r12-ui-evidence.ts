import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { blankWorldBlueprint } from "../lib/game/worlds/blueprint";

// Explicit visual evidence only: every API is intercepted; no personal data / paid calls.
async function main() {
  const stage = process.argv[2];
  if (stage !== "before" && stage !== "after") throw new Error("Choose before or after explicitly.");
  const output = path.resolve("..", "docs/ui/r12", stage);
  await mkdir(output, { recursive: true });
  const input = { brief: "一座没有魔法的海边城市，人们以手艺和航海为生。", constraints: [], magic: "forbidden" as const, numericPolicy: "qualitative" as const };
  const content = blankWorldBlueprint(input); content.overview.name = "潮汐港";
  const id = "00000000-0000-4000-8000-000000000012";
  const draft = { id, input, content, origins: {}, lockedSections: [], version: 1, revisions: [], issues: [], createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z" };
  const browser = await chromium.launch({ channel: "msedge" });
  const observations: unknown[] = [];
  try {
    for (const width of [360, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 960 }, colorScheme: "light" });
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() !== "GET") return route.fulfill({ status: 409, json: { error: { message: "视觉采样禁止写入" } } });
        const data = url.pathname === `/api/v1/game-worlds/${id}` ? draft : url.pathname === "/api/v1/game-worlds" ? [{ id, name: "潮汐港", brief: input.brief, version: 1 }]
          : url.pathname.includes("/actions") ? { today: "2026-10-21", items: [], entries: [] } : [];
        return route.fulfill({ json: { data } });
      });
      for (const [name, route] of [["world", `/entertainment?view=creator&world=${id}&section=overview`], ["tasks", "/tasks"], ["settings", "/settings"]]) {
        await page.goto(`${process.env.UI_BASE_URL ?? "http://127.0.0.1:3000"}${route}`);
        await page.getByRole("heading", { level: 1 }).waitFor();
        if (name === "world") await page.getByRole("textbox", { name: "名称", exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
        observations.push({ name, width, ...await page.evaluate(() => ({ buttons: document.querySelectorAll("button").length, links: document.querySelectorAll("a").length, overflow: document.documentElement.scrollWidth > innerWidth + 1 })) });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  await writeFile(path.join(output, "observations.json"), JSON.stringify({ source: process.env.UI_SOURCE_REVISION ?? "working tree", capturedAt: new Date().toISOString(), synthetic: true, observations }, null, 2));
  console.log(`Synthetic UI evidence: ${output}`);
}
void main().catch((reason: unknown) => { console.error(reason); process.exitCode = 1; });
