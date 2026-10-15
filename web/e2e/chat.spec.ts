import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createPromptEnvelope } from "../lib/ai/promptEnvelope";
import { createPromptExportArtifact } from "../lib/ai/promptExport";
import { verifyResponse } from "../lib/ai/responseVerifier";
import type {
  MessageCitation,
  ResponseVerification,
  PromptMessage,
} from "../lib/ai/messages";

type MockMessage = {
  id: string;
  parentMessageId: string | null;
  role: "user" | "assistant";
  content: string;
  status: "complete";
  model: null;
  citations: MessageCitation[];
  verification?: ResponseVerification | null;
  createdAt: string;
};

type MockConversation = {
  id: string;
  userId: string;
  title: string;
  mode: "auto" | "professional" | "companion" | "reflection" | "entertainment";
  summary: null;
  activeLeafMessageId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  messages: MockMessage[];
};

async function installServerDataMock(page: Page) {
  const conversations = new Map<string, MockConversation>();
  const importedSourceIds = new Set<string>();
  const respond = (route: Parameters<Parameters<Page["route"]>[1]>[0], data: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data }) });

  await page.route("**/api/v1/imports/local-storage", async (route) => {
    const body = route.request().postDataJSON() as {
      action: "preview" | "import";
      sessions: Array<{
        id: string;
        title: string;
        activeLeafId: string | null;
        updatedAt: number;
        messages: Array<{
          id: string;
          parentId: string | null;
          role: "user" | "assistant";
          content: string;
          createdAt: number;
        }>;
      }>;
    };
    const pending = body.sessions.filter((session) => !importedSourceIds.has(session.id));
    if (body.action === "preview") {
      return respond(route, {
        total: body.sessions.length,
        importable: pending.length,
        alreadyImported: body.sessions.length - pending.length,
        existingSourceIds: body.sessions
          .filter((session) => importedSourceIds.has(session.id))
          .map((session) => session.id),
      });
    }

    const conversationIds: string[] = [];
    for (const session of pending) {
      const id = crypto.randomUUID();
      const idMap = new Map(session.messages.map((message) => [message.id, crypto.randomUUID()]));
      const timestamp = new Date(session.updatedAt).toISOString();
      conversations.set(id, {
        id,
        userId: "00000000-0000-4000-8000-000000000001",
        title: session.title,
        mode: "auto",
        summary: null,
        activeLeafMessageId: session.activeLeafId ? idMap.get(session.activeLeafId)! : null,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: session.messages.map((message) => ({
          id: idMap.get(message.id)!,
          parentMessageId: message.parentId ? idMap.get(message.parentId)! : null,
          role: message.role,
          content: message.content,
          status: "complete",
          model: null,
          citations: [],
          verification: null,
          createdAt: new Date(message.createdAt).toISOString(),
        })),
      });
      importedSourceIds.add(session.id);
      conversationIds.push(id);
    }
    return respond(route, {
      total: body.sessions.length,
      importable: pending.length,
      alreadyImported: body.sessions.length - pending.length,
      existingSourceIds: [],
      imported: pending.length,
      conversationIds,
    }, 201);
  });

  await page.route("**/api/v1/conversations**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const conversationIndex = parts.indexOf("conversations");
    const id = parts[conversationIndex + 1];
    const child = parts[conversationIndex + 2];

    if (!id && request.method() === "GET") {
      return respond(
        route,
        Array.from(conversations.values()).map((conversation) => ({
          id: conversation.id,
          userId: conversation.userId,
          title: conversation.title,
          mode: conversation.mode,
          summary: conversation.summary,
          activeLeafMessageId: conversation.activeLeafMessageId,
          version: conversation.version,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        })),
      );
    }
    if (!id && request.method() === "POST") {
      const now = new Date().toISOString();
      const created: MockConversation = {
        id: crypto.randomUUID(),
        userId: "00000000-0000-4000-8000-000000000001",
        title: "新对话",
        mode: "auto",
        summary: null,
        activeLeafMessageId: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      conversations.set(created.id, created);
      return respond(route, created, 201);
    }

    const conversation = conversations.get(id);
    if (!conversation) return route.fulfill({ status: 404, body: "{}" });
    if (!child && request.method() === "GET") return respond(route, conversation);
    if (!child && request.method() === "DELETE") {
      conversations.delete(id);
      return route.fulfill({ status: 204, body: "" });
    }
    if (!child && request.method() === "PATCH") {
      const body = request.postDataJSON() as {
        title?: string;
        mode?: MockConversation["mode"];
        expectedVersion: number;
      };
      if (body.expectedVersion !== conversation.version) {
        return route.fulfill({ status: 409, body: "{}" });
      }
      if (body.title !== undefined) conversation.title = body.title;
      if (body.mode !== undefined) conversation.mode = body.mode;
      conversation.version += 1;
      conversation.updatedAt = new Date().toISOString();
      return respond(route, conversation);
    }
    if (child === "messages" && request.method() === "POST") {
      const body = request.postDataJSON() as Pick<
        MockMessage,
        "parentMessageId" | "role" | "content" | "citations" | "verification"
      >;
      const message: MockMessage = {
        ...body,
        id: crypto.randomUUID(),
        status: "complete",
        model: null,
        citations: body.citations ?? [],
        verification: body.verification ?? null,
        createdAt: new Date().toISOString(),
      };
      conversation.messages.push(message);
      conversation.activeLeafMessageId = message.id;
      conversation.version += 1;
      conversation.updatedAt = new Date().toISOString();
      return respond(route, { conversation, message }, 201);
    }
    if (child === "active-leaf" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { messageId: string | null };
      conversation.activeLeafMessageId = body.messageId;
      conversation.version += 1;
      conversation.updatedAt = new Date().toISOString();
      return respond(route, conversation);
    }
    return route.fulfill({ status: 405, body: "{}" });
  });

  await page.route("**/api/v1/memory-candidates/extract", async (route) => {
    const input = route.request().postDataJSON() as {
      conversationId: string;
      messageId: string;
    };
    const source = conversations
      .get(input.conversationId)
      ?.messages.find((message) => message.id === input.messageId);
    const isExplicit = source?.content.startsWith("请记住：") ?? false;
    return respond(
      route,
      isExplicit
        ? {
            candidate: {
              id: crypto.randomUUID(),
              status: "pending",
              content: source!.content.slice(4),
            },
            created: true,
          }
        : { candidate: null, created: false },
      isExplicit ? 201 : 200,
    );
  });
}

test("chat session lifecycle survives reloads", async ({ page }) => {
  await installServerDataMock(page);
  await page.route("**/api/v1/model/stream", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Server model provider is not configured." },
      }),
    }),
  );
  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem("agent_api_key", "must-be-removed");
    window.localStorage.setItem("agent_api_base_url", "https://legacy.example");
    window.localStorage.setItem("agent_api_model", "legacy-model");
  });
  await page.reload();

  await expect
    .poll(() =>
      page.evaluate(() => ({
        key: window.localStorage.getItem("agent_api_key"),
        baseUrl: window.localStorage.getItem("agent_api_base_url"),
        model: window.localStorage.getItem("agent_api_model"),
      })),
    )
    .toEqual({ key: null, baseUrl: null, model: null });

  await expect(page.getByRole("heading", { name: "AI 对话" })).toBeVisible();
  await expect(page.getByText("暂无对话，点击上方按钮开始")).toBeVisible();
  await expect(
    page.getByText("打开对话列表并点击「新建对话」开始"),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ 新建对话" }).click();
  await expect(page.getByPlaceholder("请输入你的问题")).toBeVisible();
  await expect(page.getByText("输入问题，AI 将为你提供帮助")).toBeVisible();

  await page.reload();
  await expect(page.getByText("新对话", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("请输入你的问题")).toBeVisible();

  await page.getByPlaceholder("请输入你的问题").fill("不会发送到模型");
  await page.getByPlaceholder("请输入你的问题").press("Enter");
  const providerError = page.getByText(
    "Server model provider is not configured.",
  );
  await expect(providerError).toBeVisible();
  await providerError.locator("..").getByRole("button", { name: "关闭" }).click();
  await expect(
    page.getByText("Server model provider is not configured."),
  ).toBeHidden();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("删除对话").click({ force: true });
  await expect(page.getByText("暂无对话，点击上方按钮开始")).toBeVisible();

  await page.reload();
  await expect(page.getByText("暂无对话，点击上方按钮开始")).toBeVisible();
  await expect(page.getByPlaceholder("请输入你的问题")).toHaveCount(0);
});

test("mobile chat uses a collapsible conversation drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installServerDataMock(page);
  await page.goto("/chat");

  const openDrawer = page.getByRole("button", { name: "打开对话列表" });
  await expect(openDrawer).toBeVisible();
  await expect(page.getByRole("dialog", { name: "对话列表" })).toHaveCount(0);

  const mainBox = await page.locator("main").boundingBox();
  expect(mainBox?.width).toBeGreaterThanOrEqual(380);

  await openDrawer.click();
  const drawer = page.getByRole("dialog", { name: "对话列表" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "+ 新建对话" }).click();

  await expect(drawer).toHaveCount(0);
  await expect(page.getByPlaceholder("请输入你的问题")).toBeVisible();

  await openDrawer.click();
  await expect(page.getByRole("dialog", { name: "对话列表" })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "对话列表" }).getByText("新对话", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "关闭对话列表", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "对话列表" })).toHaveCount(0);
  await page.getByRole("button", { name: "打开模式与导航" }).click();
  await expect(page.getByRole("dialog", { name: "模式与导航" }).getByRole("link", { name: "娱乐模式" })).toHaveAttribute("href", "/entertainment");
  await page.getByRole("button", { name: "关闭模式与导航" }).click();
});

test("persists the selected conversation mode across reloads", async ({ page }) => {
  await installServerDataMock(page);
  await page.goto("/chat");
  await page.getByRole("button", { name: "+ 新建对话" }).click();

  const selector = page.getByRole("combobox", { name: "对话模式" });
  await expect(selector).toHaveValue("auto");
  await selector.selectOption("entertainment");
  await expect(selector).toHaveValue("entertainment");

  await page.reload();
  await expect(page.getByRole("combobox", { name: "对话模式" })).toHaveValue(
    "entertainment",
  );
});

test("sends revised mode and shared Persona instructions for four modes", async ({ page }) => {
  await installServerDataMock(page);
  const captured: PromptMessage[][] = [];
  await page.route("**/api/v1/model/stream", (route) => {
    captured.push(route.request().postDataJSON().prompt);
    return route.fulfill({ contentType: "text/event-stream", body: 'event: delta\ndata: {"text":"合成回归回答。"}\n\nevent: done\ndata: {}\n\n' });
  });
  await page.goto("/chat");
  for (const [mode, rule] of [["auto", "不把普通问题强行心理分析"], ["professional", "先给直接结论"], ["companion", "不急着列计划"], ["reflection", "一次提出一到两个"]]) {
    await page.getByRole("button", { name: "+ 新建对话" }).click();
    const selector = page.getByRole("combobox", { name: "对话模式" });
    await selector.selectOption(mode);
    await expect(selector).toHaveValue(mode);
    await page.getByLabel("消息输入").fill("请直接回答：2+2等于几？不要追问。");
    await page.getByLabel("消息输入").press("Enter");
    await expect(page.getByText("合成回归回答。", { exact: true })).toBeVisible();
    await expect(selector).toBeEnabled();
    expect(captured.at(-1)?.find((message) => message.source === "mode")?.content).toContain(rule);
    expect(captured.at(-1)?.find((message) => message.source === "persona")?.content).toContain("不必每轮以问题结束");
  }
  expect(captured).toHaveLength(4);
  expect(new Set(captured.map((prompt) => prompt[0].content)).size).toBe(1);
});

test("offers review instead of silently saving an explicit memory", async ({ page }) => {
  await installServerDataMock(page);
  await page.route("**/api/v1/model/stream", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: meta\ndata: {"model":"e2e-model"}\n\n',
        'event: delta\ndata: {"text":"好的，我会先请你确认。"}\n\n',
        "event: done\ndata: {}\n\n",
      ].join(""),
    }),
  );
  await page.goto("/chat");
  await page.getByRole("button", { name: "+ 新建对话" }).click();
  const composer = page.getByPlaceholder("请输入你的问题");
  await composer.fill("请记住：我更喜欢先看例题再学理论");
  await composer.press("Enter");

  await expect(page.getByText("尚未保存", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看并确认" })).toHaveAttribute(
    "href",
    "/memory",
  );
});

test("exports the exact latest model Prompt as JSON", async ({ page }) => {
  await installServerDataMock(page);
  await page.route("**/api/v1/model/prompt-export", async (route) => {
    const body = route.request().postDataJSON() as {
      envelope: Awaited<ReturnType<typeof createPromptEnvelope>>;
      format: "json" | "markdown";
      includeMemory: boolean;
    };
    const artifact = await createPromptExportArtifact(
      body.envelope,
      body.format,
      { includeMemory: body.includeMemory },
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: artifact }),
    });
  });
  await page.route("**/api/v1/model/stream", async (route) => {
    const body = route.request().postDataJSON() as {
      trigger: "send" | "retry";
      conversation: {
        id: string;
        title: string;
        activeLeafId: string | null;
      };
      prompt: Parameters<typeof createPromptEnvelope>[0]["prompt"];
    };
    const envelope = await createPromptEnvelope({
      runId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      createdAt: "2026-09-26T02:03:04.000Z",
      trigger: body.trigger,
      conversation: body.conversation,
      prompt: body.prompt,
      provider: {
        provider: "openai-compatible",
        baseUrl: "https://provider.example/v1",
        model: "e2e-model",
      },
    });
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        `event: meta\ndata: ${JSON.stringify({
          requestId: envelope.runId,
          provider: envelope.provider.provider,
          baseUrl: envelope.provider.baseUrl,
          model: envelope.provider.model,
          envelope,
        })}\n\n`,
        'event: delta\ndata: {"text":"导出测试回答"}\n\n',
        "event: done\ndata: {}\n\n",
      ].join(""),
    });
  });

  await page.goto("/chat");
  await page.getByRole("button", { name: "+ 新建对话" }).click();
  const exportButton = page.getByRole("button", { name: "导出 Prompt" });
  await expect(exportButton).toBeDisabled();

  const composer = page.getByPlaceholder("请输入你的问题");
  await composer.fill("请导出这一条实际请求");
  await composer.press("Enter");
  await expect(page.getByText("导出测试回答", { exact: true })).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  const dialog = page.getByRole("dialog", { name: "导出最近一次 Prompt" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("e2e-model", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, "utf8"));

  expect(exported.provider).toMatchObject({
    requestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    model: "e2e-model",
  });
  expect(exported.envelope).toMatchObject({
    schemaVersion: 1,
    composerVersion: "r3.2/mode-prompts-v1",
  });
  expect(exported.integrity.auditContentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(exported.request.messages.at(-1)).toEqual({
    role: "user",
    content: "请导出这一条实际请求",
  });
  expect(exported.promptLayers.slice(0, 3).map((layer: { source: string }) => layer.source)).toEqual([
    "policy",
    "mode",
    "persona",
  ]);
  expect(exported.request.messages[0].content).toContain("核心策略");
  expect(JSON.stringify(exported)).not.toContain("apiKey");
});

test("regenerating an earlier answer creates and restores branches", async ({
  page,
}) => {
  await installServerDataMock(page);
  const replies = ["第一版回答", "第二轮回答", "第一版回答的新分支"];
  await page.route("**/api/v1/model/stream", async (route) => {
    const reply = replies.shift();
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: meta\ndata: {"model":"e2e-model"}\n\n',
        `event: delta\ndata: ${JSON.stringify({ text: reply ?? "意外请求" })}\n\n`,
        "event: done\ndata: {}\n\n",
      ].join(""),
    });
  });

  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();

  await page.getByRole("button", { name: "+ 新建对话" }).click();
  const composer = page.getByPlaceholder("请输入你的问题");
  await composer.fill("第一问");
  await composer.press("Enter");
  await expect(page.getByText("第一版回答", { exact: true })).toBeVisible();

  await composer.fill("第二问");
  await composer.press("Enter");
  await expect(page.getByText("第二轮回答", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "重新生成" }).first().click();
  await expect(
    page.getByText("第一版回答的新分支", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2/2", { exact: true })).toBeVisible();
  await expect(page.getByText("第二问", { exact: true })).toHaveCount(0);
  await expect(page.getByText("第二轮回答", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "上一个回答版本" }).click();
  await expect(page.getByText("第一版回答", { exact: true })).toBeVisible();
  await expect(page.getByText("第二问", { exact: true })).toBeVisible();
  await expect(page.getByText("第二轮回答", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "下一个回答版本" }).first().click();
  await expect(
    page.getByText("第一版回答的新分支", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("第二问", { exact: true })).toHaveCount(0);
});

test("persists and restores visible response verification", async ({ page }) => {
  await installServerDataMock(page);
  const citation = {
    id: "S1",
    title: "人工智能产业最新报告",
    url: "https://example.com/ai-report",
    snippet: "人工智能产业在 2026 年继续增长，研究机构发布了最新数据。",
    source: "example.com",
    publishedAt: "2026-09-25T00:00:00.000Z",
    fetchedAt: "2026-09-26T00:00:00.000Z",
  };
  const answer =
    "截至 2026年9月，人工智能产业继续增长，研究机构发布了最新数据。[S1]";
  const verification = verifyResponse({
    answer,
    query: "今天人工智能产业有什么最新消息？",
    retrieval: {
      status: "completed",
      reason: "completed",
      query: "今天人工智能产业有什么最新消息？",
      citations: [citation],
    },
    checkedAt: "2026-09-26T01:00:00.000Z",
  });
  await page.route("**/api/v1/model/stream", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: meta\ndata: {"model":"e2e-model"}\n\n',
        `event: delta\ndata: ${JSON.stringify({ text: answer })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          citations: [citation],
          verification,
        })}\n\n`,
      ].join(""),
    }),
  );

  await page.goto("/chat");
  await page.getByRole("button", { name: "+ 新建对话" }).click();
  const composer = page.getByPlaceholder("请输入你的问题");
  await composer.fill("今天人工智能产业有什么最新消息？");
  await composer.press("Enter");

  await page.getByText("参考来源（1）", { exact: true }).click();
  await expect(page.getByText("人工智能产业最新报告", { exact: false })).toBeVisible();
  await expect(
    page.getByText("回答规则检查：规则检查未发现明显问题", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByText("参考来源（1）", { exact: true }).click();
  await expect(page.getByText("人工智能产业最新报告", { exact: false })).toBeVisible();
  await expect(
    page.getByText("回答规则检查：规则检查未发现明显问题", { exact: true }),
  ).toBeVisible();
});

test("renders dollar and slash-delimited math in the chat page", async ({
  page,
}) => {
  await installServerDataMock(page);
  await page.goto("/chat");
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "agent_chat_sessions",
      JSON.stringify([
        {
          id: "math-session",
          title: "公式测试",
          schemaVersion: 2,
          activeLeafId: "math-answer",
          updatedAt: Date.now(),
          messages: [
            {
              id: "math-question",
              parentId: null,
              role: "user",
              content: "展示公式",
            },
            {
              id: "math-answer",
              parentId: "math-question",
              role: "assistant",
              content:
                "行内：\\(x^2\\) 与 $\\frac{a+b}{c+d}$\n\n\\[\\frac{1}{1 + \\frac{1}{x}}\\]\n\n以及 $z^2$",
            },
          ],
        },
      ]),
    );
  });
  await page.reload();

  await page.getByRole("button", { name: "确认导入" }).click();

  await expect(page.locator(".katex")).toHaveCount(4);
  await expect(page.locator(".katex-display")).toHaveCount(1);
  await expect(page.locator(".mfrac")).toHaveCount(3);
  await expect(page.getByText("公式测试", { exact: true })).toBeVisible();
});
