import { expect, test } from "@playwright/test";
import { applyGameTool } from "../lib/game/toolkit";
import { initialGameState } from "../lib/game/state";

test("mobile deck controls save host-only turns without model requests", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = "11111111-1111-4111-8111-111111111111";
  const session = { id, title: "工具测试局", userId: id, kind: "tabletop", status: "active", worldName: "雾港", worldPremise: "测试世界", worldTone: "克制", worldRules: [], safetyBoundaries: [], activeLeafTurnId: null as string | null, version: 1, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", characters: [], turns: [] as unknown[], events: [], checkpoints: [] };
  let state = initialGameState("雾港", "测试世界"); let calls = 0;
  await page.route("**/api/v1/game-sessions", (route) => route.fulfill({ json: { data: [session] } }));
  await page.route(`**/api/v1/game-sessions/${id}`, (route) => route.fulfill({ json: { data: session } }));
  await page.route(`**/api/v1/game-sessions/${id}/turns`, async (route) => {
    const request = route.request().postDataJSON(); calls++;
    expect(request.toolOnly).toBe(true); expect(request.requestId).toMatch(/^[a-f0-9-]{36}$/u);
    state = { ...state, toolkit: applyGameTool(state.toolkit, request.toolRequest, request.requestId) };
    session.version++; session.activeLeafTurnId = crypto.randomUUID();
    session.turns.push({ id: session.activeLeafTurnId, sessionId: id, parentTurnId: request.parentTurnId, playerContent: request.content, assistantContent: state.toolkit!.lastResult!.labels.join("\n"), model: "host-tools/r4-v1", statePatch: {}, stateSnapshot: state, createdAt: "2026-10-16T00:00:00Z" });
    await route.fulfill({ status: 201, json: { data: session } });
  });
  await page.route("**/api/v1/model/**", () => { throw new Error("Unexpected model request"); });
  await page.goto("/entertainment");
  await expect(page.getByRole("heading", { name: "剧情回合" })).toBeVisible();
  await page.getByText("牌堆与随机表（随所选剧情分支保存）", { exact: true }).click();
  await page.getByLabel("卡牌或事件列表").fill("A\nB\nC");
  await page.getByRole("button", { name: "运行并保存工具回合（不调用 AI）" }).click();
  await expect(page.getByRole("status")).toContainText("没有调用 AI");
  await page.getByLabel("游戏工具操作").selectOption("deck-draw");
  await page.getByRole("button", { name: "运行并保存工具回合（不调用 AI）" }).click();
  await expect(page.getByText("剩余 2 / 手牌 1 / 弃牌 0", { exact: false })).toBeVisible();
  expect(calls).toBe(2);
});
