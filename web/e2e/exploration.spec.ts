import { expect, test, type Page } from "@playwright/test";
import { applyExplorationAction } from "../lib/game/exploration/engine";
import type { ExplorationAction } from "../lib/game/exploration/contracts";
import { initialGameState } from "../lib/game/state";
import type { GameSessionDetail } from "../lib/api/gameSessionClient";
import { PUBLIC_JOURNEY } from "../tests/helpers/explorationJourney";
import { searchWorldHistory } from "../lib/game/exploration/history";

const path = process.env.EXPLORATION_MOBILE_BUNDLE === "true" ? "/#/entertainment?view=worlds" : "/entertainment?view=worlds";
async function mockWorld(page: Page) {
  let exists = false; let rejectAI = false; let modelCalls = 0;
  const detail: GameSessionDetail = { id: crypto.randomUUID(), userId: crypto.randomUUID(), title: "雾港与旧灯岬", kind: "interactive-story", status: "setup",
    worldName: "潮汐群岛 · 雾港", worldPremise: "合成测试区域", worldTone: "行旅", worldRules: ["exploration.v1 / fog-harbor@1.0.0"], safetyBoundaries: [],
    version: 1, activeLeafTurnId: null, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z", characters: [], turns: [], events: [], checkpoints: [] };
  const state = () => detail.turns.find((turn) => turn.id === detail.activeLeafTurnId)?.stateSnapshot.exploration;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (!url.pathname.startsWith("/api/v1/game-sessions")) return route.fulfill({ json: { data: [] } });
    if (url.pathname === "/api/v1/game-sessions") {
      if (req.method() === "GET") return route.fulfill({ json: { data: exists ? [detail] : [] } });
      const input = req.postDataJSON(); expect(input.world.rules).toContain("exploration.v1 / fog-harbor@1.0.0"); exists = true;
      return route.fulfill({ status: 201, json: { data: detail } });
    }
    if (url.pathname.endsWith("/exploration/history")) {
      const input = req.postDataJSON(); const ids = new Set<string>(); let id = input.parentTurnId;
      while (id) { ids.add(id); id = detail.turns.find((turn) => turn.id === id)?.parentTurnId; }
      return route.fulfill({ json: { data: searchWorldHistory(detail.turns.filter((turn) => ids.has(turn.id)), input) } });
    }
    if (url.pathname.endsWith("/status")) { detail.status = req.postDataJSON().status; detail.version++; return route.fulfill({ json: { data: detail } }); }
    if (url.pathname.endsWith("/turns")) {
      const input = req.postDataJSON(); expect(input.expectedVersion).toBe(detail.version); expect(input.requestId).toMatch(/^[a-f0-9-]{36}$/u);
      if (input.explorationAction.action === "start") expect(input.explorationAction).toMatchObject({ templateId: "fog-harbor", templateVersion: "1.0.0" });
      if (input.narrate) { modelCalls++; if (rejectAI) return route.fulfill({ status: 503, json: { error: { code: "MODEL_CONFIGURATION_ERROR", message: "合成模型暂不可用，草稿保留" } } }); }
      const parent = detail.turns.find((turn) => turn.id === input.parentTurnId);
      const exploration = applyExplorationAction(parent?.stateSnapshot.exploration, input.explorationAction, input.requestId);
      detail.activeLeafTurnId = crypto.randomUUID(); detail.version++;
      detail.turns.push({ id: detail.activeLeafTurnId, sessionId: detail.id, parentTurnId: input.parentTurnId, playerContent: input.content,
        assistantContent: exploration.lastResult, model: input.narrate ? "mock-model" : "host-exploration/v1", statePatch: {}, stateSnapshot: { ...initialGameState("雾港", "合成区域"), exploration }, createdAt: "2026-10-18T00:00:00Z" });
      return route.fulfill({ status: 201, json: { data: detail } });
    }
    if (url.pathname.endsWith("/export")) return route.fulfill({ json: { data: { filename: "synthetic-exploration.json", mediaType: "application/json", content: JSON.stringify({ schemaVersion: 3, session: detail }), directory: "game-exports", shareTitle: "合成导出", shareText: "合成记录", dialogTitle: "导出" } } });
    return route.fulfill({ json: { data: detail } });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "大世界探索 · 选择模板", exact: true }).click();
  const picker = page.getByRole("region", { name: "探索模板选择" });
  await expect(picker.getByRole("article", { name: "所选模板简介" })).toContainText("世界背景");
  await expect(picker).toContainText("自由行旅者");
  await expect(picker).not.toContainText("守望者盟约：");
  await page.getByLabel("探索模板", { exact: true }).selectOption("fog-harbor@1.0.0");
  expect(exists).toBe(false); // Reading/selecting an introduction must not create a session.
  await page.getByRole("button", { name: "确认创建探索存档", exact: true }).click();
  await page.getByRole("button", { name: "开启探索世界", exact: true }).click();
  await expect(page.getByRole("region", { name: "大世界探索工作区" })).toBeVisible();
  return { detail, state, modelCalls: () => modelCalls, rejectAI: (value: boolean) => { rejectAI = value; } };
}

for (const width of [360, 1440]) test(`complete exploration region, ending, history and export at ${width}px`, async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: 900 }); page.on("dialog", (dialog) => dialog.accept());
  const game = await mockWorld(page); const workspace = page.getByRole("region", { name: "大世界探索工作区" });
  await expect(workspace).not.toContainText("潮石祭坛");
  const run = async (action: ExplorationAction) => {
    const before = game.detail.turns.length;
    if (action.action === "move" || action.action === "investigate") {
      await page.getByRole("tab", { name: "地图", exact: true }).click();
      const name = action.action === "move" ? game.state()!.view.locations.find((location) => location.id === action.targetId)!.name : game.state()!.view.locations.find((location) => location.id === game.state()!.locationId)!.points.find((point) => point.id === action.targetId)!.name;
      await workspace.getByRole("button", { name: `${action.action === "move" ? "前往" : "调查"}${name}`, exact: true }).click();
    } else if (action.action === "choose") {
      await page.getByRole("tab", { name: "事件与史诗", exact: true }).click();
      const choice = game.state()!.view.events.find((event) => event.id === action.eventId)!.choices.find((item) => item.id === action.choiceId)!;
      await workspace.getByRole("button", { name: choice.label, exact: true }).click();
    } else if (["ask", "help", "negotiate", "promise"].includes(action.action) && "targetId" in action) {
      await page.getByRole("tab", { name: "人物", exact: true }).click();
      const person = game.state()!.characters[action.targetId];
      const label = action.action === "ask" ? person.topics.find((topic) => topic.id === action.topicId)!.label : action.action === "help" ? "提出协助" : action.action === "negotiate" ? "据理交涉" : "明确作出承诺";
      await workspace.getByRole("button", { name: label, exact: true }).click();
    }
    await expect.poll(() => game.detail.turns.length).toBe(before + 1);
    await expect(workspace.getByRole("status")).toHaveText(game.state()!.lastResult);
  };
  await page.getByRole("tab", { name: "背包与装备", exact: true }).click();
  await workspace.getByRole("button", { name: "装备铜提灯", exact: true }).click(); await expect(workspace.getByRole("button", { name: "卸下铜提灯", exact: true })).toBeVisible();
  for (const action of PUBLIC_JOURNEY) await run(action);
  await run({ action: "choose", eventId: "lantern-accord", choiceId: "public" });
  await expect(workspace).toContainText("本分支结局：开放的灯火");
  await page.getByRole("tab", { name: "历史与传记", exact: true }).click();
  await page.getByLabel("历史关键词", { exact: true }).fill("盟约"); await page.getByRole("button", { name: "查询所选剧情线", exact: true }).click();
  await expect(workspace).toContainText("既往设定"); await expect(workspace).toContainText("祭坛碑文");
  await page.getByRole("tab", { name: "地图", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (width === 360 && !process.env.EXPLORATION_MOBILE_BUNDLE) await workspace.screenshot({ path: "test-results/exploration-360.png", style: ".workspace-header { visibility: hidden !important; }" });
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "导出 JSON", exact: true }).click(); expect((await download).suggestedFilename()).toBe("synthetic-exploration.json");
  expect(game.modelCalls()).toBe(0);
});

test("NPC AI failure preserves drafts and canceled local navigation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 }); let allowNavigation = true;
  page.on("dialog", (dialog) => allowNavigation ? dialog.accept() : dialog.dismiss());
  const game = await mockWorld(page); const workspace = page.getByRole("region", { name: "大世界探索工作区" });
  await workspace.getByRole("button", { name: "前往盐风集市", exact: true }).click();
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await workspace.getByText("自由 AI 对话（点击发送才调用模型）", { exact: true }).click();
  await page.getByRole("textbox", { name: "对阿岚说", exact: true }).fill("这座港口对你意味着什么？");
  game.rejectAI(true); await workspace.getByRole("button", { name: "发送给阿岚 · 调用 AI", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "合成模型暂不可用" })).toContainText("草稿保留"); await expect(page.getByRole("textbox", { name: "对阿岚说", exact: true })).toHaveValue("这座港口对你意味着什么？");
  allowNavigation = false; await page.getByRole("tab", { name: "地图", exact: true }).click(); await expect(page.getByRole("textbox", { name: "对阿岚说", exact: true })).toBeVisible();
  expect(game.modelCalls()).toBe(1);
});
