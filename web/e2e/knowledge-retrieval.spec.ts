import { expect, test } from "@playwright/test";
import { knowledgeCitationUrl } from "../lib/knowledge/citations";
import { rankKnowledge } from "../lib/knowledge/retrieval";
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const mobile = process.env.KNOWLEDGE_MOBILE_BUNDLE === "true";
const pageUrl = (path: string) => mobile ? `/#${path}` : path;
const metadata = { collectionId: id(2), documentId: id(3), chunkId: id(4), version: 1, contentHash: "a".repeat(64), startLine: 1, endLine: 2 };
const collection = { id: id(2), title: "我的专业资料", description: "", module: "professional", version: 1 };
const candidate = { ownerId: id(1), collectionId: id(2), module: "professional" as const, documentId: id(3), chunkId: id(4), version: 1, title: "缓存规范", heading: "缓存", content: "# 缓存\n缓存有效期为三十分钟。", contentHash: "a".repeat(64), chunkHash: "b".repeat(64), startLine: 1, endLine: 2 };

test("selects knowledge for chat, saves versioned citations across reloads, and refuses an obsolete source link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let version = 1; let modelCalls = 0; let nextMessage = 100;
  const messages: Array<{ id: string; parentMessageId: string | null; role: string; content: string; citations: unknown[]; createdAt: string }> = [];
  const conversation = { id: id(10), title: "资料问答", mode: "professional", activeLeafMessageId: null as string | null, version: 1, updatedAt: new Date().toISOString() };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith("/model/stream")) {
      expect(request.postDataJSON().knowledgeCollectionIds).toEqual([id(2)]); modelCalls++;
      const citation = { id: "S1", title: "缓存规范", url: knowledgeCitationUrl(metadata), source: "个人资料库 · v1 · 行 1–2", snippet: "", knowledge: metadata };
      return route.fulfill({ contentType: "text/event-stream", body: `event: delta\ndata: ${JSON.stringify({ text: "缓存有效期为三十分钟。[S1]" })}\n\nevent: done\ndata: ${JSON.stringify({ citations: [citation] })}\n\n` });
    }
    if (path.endsWith("/messages")) {
      const body = request.postDataJSON(); const message = { ...body, id: id(nextMessage++), createdAt: new Date().toISOString(), citations: body.citations ?? [] };
      messages.push(message); conversation.version++; conversation.activeLeafMessageId = message.id;
      return route.fulfill({ status: 201, json: { data: { conversation, message } } });
    }
    if (path.endsWith("/conversations")) return route.fulfill({ json: { data: [conversation] } });
    if (path.endsWith(`/conversations/${id(10)}`)) return route.fulfill({ json: { data: { ...conversation, messages } } });
    if (path.endsWith("/knowledge")) return route.fulfill({ json: { data: [collection] } });
    if (path.endsWith(`/documents/${id(3)}`)) {
      const requested = new URL(request.url()).searchParams.get("version");
      if (requested && Number(requested) !== version) return route.fulfill({ status: 404, json: { error: { message: "该版本已更正或删除，不会以新版本冒充旧引用" } } });
      return route.fulfill({ json: { data: { ...candidate, id: id(3), version, content: version === 1 ? candidate.content : "新版缓存正文，不应冒充旧来源", sourceKey: "cache", format: "markdown", sourceUrl: "", fileName: "", chunks: [{ id: id(4), ordinal: 0, content: candidate.content, startLine: 1, endLine: 2, heading: "缓存", documentVersion: version }] } } });
    }
    if (path.endsWith("/documents")) return route.fulfill({ json: { data: [{ id: id(3), title: "缓存规范", collectionId: id(2), sourceKey: "cache", version }] } });
    if (path.endsWith("/model/config")) return route.fulfill({ json: { data: { configured: true, missing: [], baseUrl: "https://example.test", model: "mock" } } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto(pageUrl("/chat"));
  await page.getByText("本次使用资料库（已选 0）", { exact: false }).click();
  await page.getByLabel("我的专业资料", { exact: true }).check();
  await expect(page.getByText("本地检索，关闭联网搜索", { exact: false })).toBeVisible();
  await page.getByLabel("消息输入").fill("缓存的 TTL 是多久？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("缓存有效期为三十分钟。[S1]", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByText("参考来源（1）").click();
  const source = page.getByRole("link", { name: "[S1] 缓存规范 个人资料库 · v1 · 行 1–2", exact: true });
  await expect(source).toHaveAttribute("href", mobile ? `#${knowledgeCitationUrl(metadata)}` : knowledgeCitationUrl(metadata));
  await source.click();
  await expect(page.getByLabel("文档正文")).toHaveValue(candidate.content);
  await expect(page.getByText("缓存 · 原文行 1–2 · v1", { exact: true })).toBeVisible();
  version = 2;
  await page.goto(pageUrl(knowledgeCitationUrl(metadata)));
  // The same hash URL in the local client is not a navigation; explicitly refresh the source.
  if (mobile) await page.reload();
  await expect(page.getByRole("region", { name: "知识资料库" }).getByRole("alert")).toContainText("已更正或删除");
  await expect(page.getByLabel("文档正文")).toHaveCount(0);
  expect(modelCalls).toBe(1);
});

test("searches the explicitly selected collection without generating an answer", async ({ page }) => {
  let modelCalls = 0; let searches = 0;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/model/stream")) modelCalls++;
    if (path.endsWith("/knowledge")) return route.fulfill({ json: { data: [collection] } });
    if (path.endsWith(`/documents/${id(3)}`)) return route.fulfill({ json: { data: { ...candidate, id: id(3), sourceKey: "cache", format: "markdown", sourceUrl: "", fileName: "", chunks: [{ id: id(4), ordinal: 0, content: candidate.content, startLine: 1, endLine: 2, heading: "缓存", documentVersion: 1 }] } } });
    if (path.endsWith("/knowledge/search")) {
      expect(route.request().postDataJSON()).toEqual({ consumer: "professional", collectionIds: [id(2)], query: "缓存 TTL" }); searches++;
      return route.fulfill({ json: { data: { ...rankKnowledge([candidate], "缓存 TTL", { maxItems: 5, maxEstimatedTokens: 1800 }), durationMs: 5 } } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto(pageUrl("/memory"));
  await page.getByLabel("检索本集合").fill("缓存 TTL");
  await page.getByRole("button", { name: "检索资料（不调用模型）" }).click();
  await expect(page.getByRole("status")).toContainText("命中 1 段");
  await expect(page.getByRole("link", { name: "缓存规范 · v1 · 行 1–2" })).toBeVisible();
  await page.getByRole("link", { name: "缓存规范 · v1 · 行 1–2" }).click();
  await expect(page.getByLabel("文档正文")).toHaveValue(candidate.content);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 360)).toBe(true);
  expect(searches).toBe(1); expect(modelCalls).toBe(0);
});
