import { test, expect } from "@playwright/test";
import { createPromptEnvelope } from "../lib/ai/promptEnvelope";
import { summaryLayer } from "../lib/conversation/summary";
const uuid = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const mobile = process.env.SUMMARY_MOBILE_BUNDLE === "true";
test("reviews and enables a branch summary, sends the flag, displays truthful compression and clears only derived data", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const payload = { points: [{ kind: "constraint" as const, text: "用户预算最多30元。", evidence: [{ messageId: uuid(1), quote: "预算最多30元" }] }] };
  let state = "draft"; let version = 2; let summaryCalls = 0; let modelCalls = 0; let clears = 0; let messageId = 30;
  const messages = Array.from({ length: 20 }, (_, n) => ({ id: uuid(n + 1), parentMessageId: n ? uuid(n) : null, role: n % 2 ? "assistant" : "user", content: `第${n}条：预算最多30元。`, createdAt: new Date().toISOString() }));
  const conversation = { id: uuid(100), title: "摘要演示", mode: "professional", activeLeafMessageId: uuid(20), version: 1, updatedAt: new Date().toISOString() };
  const record = () => ({ id: uuid(200), fingerprint: "a".repeat(64), policy: "branch-summary/r5.4-v1", status: state, version, payload, sources: Array.from({ length: 14 }, (_, n) => ({ id: uuid(n + 1), hash: "b".repeat(64) })) });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path.endsWith("/summary")) {
      summaryCalls++;
      if (req.method() === "GET") return route.fulfill({ json: { data: { summary: null, messageCount: 20, reason: "尚无摘要", settings: { threshold: 16, recent: 6, maxCharacters: 5000 } } } });
      if (req.method() === "PATCH") { expect(req.postDataJSON()).toEqual({ leafId: uuid(20), summaryId: uuid(200), expectedVersion: 2 }); state = "approved"; version++; }
      if (req.method() === "DELETE") { clears++; return route.fulfill({ json: { data: { cleared: true } } }); }
      return route.fulfill({ json: { data: record() } });
    }
    if (path.endsWith("/model/stream")) {
      modelCalls++; const request = req.postDataJSON(); expect(request.useSummary).toBe(true);
      const usage = { id: uuid(200), fingerprint: "a".repeat(64), sourceCount: 14, originalEstimatedTokens: 6000, compactEstimatedTokens: 1500 };
      const envelope = await createPromptEnvelope({ runId: uuid(300), trigger: "send", conversation: { id: conversation.id, title: conversation.title, activeLeafId: conversation.activeLeafMessageId }, provider: { provider: "openai-compatible", baseUrl: "https://example.test", model: "mock" }, prompt: [summaryLayer(payload), { kind: "conversation", source: "conversation", role: "user", content: "继续计划" }], summary: { usage, note: "使用已审核分支摘要 + 近期原文" } });
      return route.fulfill({ contentType: "text/event-stream", body: `event: meta\ndata: ${JSON.stringify({ envelope })}\n\nevent: delta\ndata: {"text":"继续保留预算约束。"}\n\nevent: done\ndata: {}\n\n` });
    }
    if (path.endsWith("/messages")) { const body = req.postDataJSON(); const message = { ...body, id: uuid(messageId++), createdAt: new Date().toISOString() }; messages.push(message); conversation.activeLeafMessageId = message.id; conversation.version++; return route.fulfill({ json: { data: { conversation, message } } }); }
    if (path.endsWith("/conversations")) return route.fulfill({ json: { data: [conversation] } });
    if (path.endsWith(`/conversations/${conversation.id}`)) return route.fulfill({ json: { data: { ...conversation, messages } } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto(mobile ? "/#/chat" : "/chat");
  await page.getByText("本次对话的资料与上下文", { exact: true }).click();
  await expect(page.getByText("分支摘要 · 默认关闭", { exact: true })).toBeVisible();
  expect(summaryCalls).toBe(0);
  await page.getByText("分支摘要 · 默认关闭", { exact: true }).click();
  await page.getByRole("button", { name: "查看当前分支摘要", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("尚无摘要");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "生成/更新摘要（收费）", exact: true }).click();
  await expect(page.getByText("约束：用户预算最多30元。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("本页允许复用已审核摘要（无有效摘要时用完整历史）")).not.toBeChecked();
  await page.getByRole("button", { name: "已核对，允许本页使用", exact: true }).click();
  await expect(page.getByLabel("本页允许复用已审核摘要（无有效摘要时用完整历史）")).toBeChecked();
  await page.getByLabel("消息输入").fill("继续计划"); await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("继续保留预算约束。", { exact: true })).toBeVisible();
  await page.getByText("分支摘要 · 已允许复用", { exact: true }).click();
  await expect(page.getByText("最近请求：使用已审核分支摘要 + 近期原文", { exact: true })).toBeVisible();
  await expect(page.getByText("历史上下文估算 6000 → 1500 Token", { exact: false })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "清除摘要", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("原始历史保留"); expect(messages).toHaveLength(22); expect(clears).toBe(1); expect(modelCalls).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
});

test("summary errors keep the raw chat and require an explicit retry", async ({ page }) => {
  let writes = 0;
  const conversation = { id: uuid(100), title: "错误回退", mode: "professional", activeLeafMessageId: uuid(1), version: 1, messages: [{ id: uuid(1), parentMessageId: null, role: "user", content: "原始历史不能丢失", createdAt: new Date().toISOString() }] };
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/summary")) { writes++; return route.fulfill({ status: 503, json: { error: { message: "摘要暂不可用；完整历史保留" } } }); }
    if (path.endsWith("/conversations")) return route.fulfill({ json: { data: [conversation] } });
    if (path.endsWith(`/conversations/${uuid(100)}`)) return route.fulfill({ json: { data: conversation } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto(mobile ? "/#/chat" : "/chat"); await page.getByText("本次对话的资料与上下文", { exact: true }).click(); await page.getByText("分支摘要 · 默认关闭", { exact: true }).click();
  await page.getByRole("button", { name: "查看当前分支摘要", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("完整历史保留");
  await expect(page.getByText("原始历史不能丢失", { exact: true })).toBeVisible(); expect(writes).toBe(1);
});
