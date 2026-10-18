import { expect, test } from "@playwright/test";
import { splitDocument, type DocumentInput } from "../lib/knowledge/documents";
import type { KnowledgeCollection, KnowledgeDocument } from "../lib/api/knowledgeClient";
const memoryUrl = process.env.KNOWLEDGE_MOBILE_BUNDLE === "true" ? "/#/memory?view=knowledge" : "/memory?view=knowledge";

test("mobile knowledge workflow imports locally, retains a conflicting draft, replaces sources and deletes derived data", async ({ page }) => {
  const collectionId = "11111111-1111-4111-8111-111111111111";
  const documentId = "22222222-2222-4222-8222-222222222222";
  let collection: KnowledgeCollection | null = null;
  let document: KnowledgeDocument | null = null;
  let conflict = true; let writes = 0; let modelCalls = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname; const method = request.method();
    if (path.includes("/model/stream")) { modelCalls++; return route.abort(); }
    if (!path.startsWith("/api/v1/knowledge")) return route.fulfill({ json: { data: [] } });
    if (method !== "GET") writes++;
    const input = method === "GET" ? null : request.postDataJSON();
    if (path.endsWith("/knowledge") && method === "POST") { collection = { ...input, id: collectionId, version: 1, updatedAt: new Date().toISOString() }; return route.fulfill({ json: { data: collection } }); }
    if (path.endsWith("/documents") && method === "POST" || path.endsWith(`/documents/${documentId}`) && method === "PATCH") {
      if (method === "PATCH" && conflict) { conflict = false; return route.fulfill({ status: 409, json: { error: { message: "文档已变更，请刷新" } } }); }
      const values = input as DocumentInput;
      const version = (document?.version ?? 0) + 1;
      document = { ...values, id: documentId, collectionId, version, contentHash: "a".repeat(64), chunkStrategy: "lines/r5.2-v1", updatedAt: new Date().toISOString(), chunks: splitDocument(values.content).map((part) => ({ ...part, id: `segment-${part.ordinal}-v${version}`, documentVersion: version })) };
      if (collection) collection.version++;
      return route.fulfill({ json: { data: { id: documentId, version, duplicate: false } } });
    }
    if (path.endsWith(`/documents/${documentId}`) && method === "DELETE") { document = null; if (collection) collection.version++; return route.fulfill({ json: { data: { deleted: true } } }); }
    if (path.endsWith(`/collections/${collectionId}`) && method === "DELETE") { collection = null; document = null; return route.fulfill({ json: { data: { deleted: true } } }); }
    const data = path.endsWith("/knowledge") ? collection ? [collection] : [] : path.endsWith("/documents") ? document ? [document] : [] : document;
    return route.fulfill({ json: { data } });
  });
  await page.goto(memoryUrl);
  await page.getByLabel("新集合名称").fill("我的学习资料");
  await page.getByRole("button", { name: "创建知识集合", exact: true }).click();
  await expect(page.getByLabel("当前知识集合")).toHaveValue(collectionId);
  await page.getByLabel("选择本地文本文件").setInputFiles({ name: "chapter.md", mimeType: "text/markdown", buffer: Buffer.from("# 第一章\n旧资料正文\n## 第二节\n补充知识") });
  await expect(page.getByLabel("文档正文")).toHaveValue(/旧资料/);
  expect(writes).toBe(1); // Reading a local file is not an upload until explicit save.
  await page.getByRole("button", { name: "保存导入", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文档与来源分段已保存");
  await page.getByText("查看已保存版本与来源定位", { exact: false }).click();
  await expect(page.getByText("第一章 · 原文行 1–2 · v1")).toBeVisible();
  await page.getByLabel("文档正文").fill("# 新版\n修订后的证据");
  await page.getByRole("button", { name: "保存文档更正", exact: true }).click();
  await expect(page.getByRole("region", { name: "知识资料库" }).getByRole("alert")).toContainText("文档已变更");
  await expect(page.getByLabel("文档正文")).toHaveValue("# 新版\n修订后的证据");
  await page.getByRole("button", { name: "保存文档更正", exact: true }).click();
  await expect(page.getByText("新版 · 原文行 1–2 · v2")).toBeVisible();
  expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= 390)).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除文档", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文档及全部分段已删除");
  await expect(page.getByText("查看已保存版本与来源定位", { exact: false })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除整个集合", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("集合及全部文档/分段已删除");
  expect(modelCalls).toBe(0);
});

test("invalid file is not uploaded and an offline library remains retryable", async ({ page }) => {
  let writes = 0; let offline = true;
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes++;
    if (!path.includes("/knowledge")) return route.fulfill({ json: { data: [] } });
    if (offline) return route.fulfill({ status: 503, json: { error: { message: "知识库暂时离线" } } });
    return route.fulfill({ json: { data: path.endsWith("/knowledge") ? [{ id: "11111111-1111-4111-8111-111111111111", title: "测试集合", module: "professional", description: "", version: 1 }] : [] } });
  });
  await page.goto(memoryUrl);
  await expect(page.getByRole("region", { name: "知识资料库" }).getByRole("alert")).toContainText("暂时离线");
  offline = false;
  await page.getByRole("button", { name: "刷新集合与列表" }).click();
  await expect(page.getByLabel("当前知识集合")).toHaveValue("11111111-1111-4111-8111-111111111111");
  await page.getByLabel("选择本地文本文件").setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from([0xff, 0xfe, 0xff]) });
  await expect(page.getByRole("region", { name: "知识资料库" }).getByRole("alert")).toContainText("不是有效 UTF-8");
  expect(writes).toBe(0);
});

test("memory source controls require explicit confirmation and send the intended deletion scope", async ({ page }) => {
  const memoryId = "11111111-1111-4111-8111-111111111111";
  const conversationId = "22222222-2222-4222-8222-222222222222";
  let items = [{ id: memoryId, candidateId: "candidate", sourceConversationId: conversationId, sourceMessageId: "message", kind: "goal", content: "完成作品集", evidenceQuote: "原始证据", sensitivity: "low", pinned: false, validUntil: null, lastUsedAt: null, useCount: 0, version: 1, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z" }];
  let sourceDeleteCalls = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/conversations/${conversationId}`) && route.request().method() === "DELETE") { expect(route.request().postDataJSON()).toEqual({ deleteRelatedMemories: true }); sourceDeleteCalls++; items = []; return route.fulfill({ status: 204 }); }
    return route.fulfill({ json: { data: path.endsWith("/memories") ? items : [] } });
  });
  await page.goto(process.env.KNOWLEDGE_MOBILE_BUNDLE === "true" ? "/#/memory" : "/memory");
  await expect(page.getByRole("button", { name: "删除原对话及关联记忆" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "删除原对话及关联记忆" }).click();
  expect(sourceDeleteCalls).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除原对话及关联记忆" }).click();
  await expect(page.getByRole("status")).toContainText("原对话、关联记忆及候选证据已删除");
  expect(sourceDeleteCalls).toBe(1);
});
