import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyRetryReply,
  applySendReply,
  sendChatMessage,
} from "../lib/ai/chatService";
import type { PromptMessage } from "../lib/ai/messages";
import { verifyResponse } from "../lib/ai/responseVerifier";
import type { Session } from "../lib/conversation/session";
import {
  getActiveMessages,
  getAssistantSiblings,
} from "../lib/conversation/tree";
import {
  installBrowserStorage,
  uninstallBrowserStorage,
} from "./helpers/browserStorage";
import {
  createTestPromptEnvelope,
  TEST_CONVERSATION_ID,
  TEST_LEAF_ID,
} from "./helpers/promptEnvelope";

const requestContext = {
  trigger: "send" as const,
  conversation: {
    id: TEST_CONVERSATION_ID,
    title: "测试会话",
    activeLeafId: TEST_LEAF_ID,
  },
};

beforeEach(() => {
  installBrowserStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallBrowserStorage();
});

describe("sendChatMessage", () => {
  it("streams through the server without browser provider credentials", async () => {
    const envelope = await createTestPromptEnvelope();
    const verification = verifyResponse({
      answer: "回答",
      query: "问题",
      retrieval: {
        status: "skipped",
        reason: "not-needed",
        query: "问题",
        citations: [],
      },
      checkedAt: "2026-09-26T00:00:00.000Z",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        [
          `event: meta\ndata: ${JSON.stringify({ envelope })}\n\n`,
          'event: delta\ndata: {"text":"回"}\n\n',
          'event: delta\ndata: {"text":"答"}\n\n',
          `event: done\ndata: ${JSON.stringify({
            citations: [
              { id: "S1", title: "来源", url: "https://example.com/" },
            ],
            verification,
          })}\n\n`,
        ].join(""),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onDelta = vi.fn();
    const onEnvelope = vi.fn();
    const onCitations = vi.fn();
    const onVerification = vi.fn();

    const prompt: PromptMessage[] = [
      {
        kind: "instruction",
        source: "persona",
        role: "system",
        content: "保持专业",
      },
      {
        kind: "context",
        source: "memory",
        role: "system",
        content: "历史参考",
      },
      {
        kind: "conversation",
        source: "conversation",
        role: "user",
        content: "问题",
      },
    ];

    await expect(
      sendChatMessage(
        prompt,
        requestContext,
        undefined,
        onDelta,
        onEnvelope,
        onCitations,
        onVerification,
      ),
    ).resolves.toBe("回答");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/model/stream");

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      trigger: "send",
      conversation: requestContext.conversation,
      prompt,
      searchMode: "auto",
    });
    expect(init.headers).not.toHaveProperty("authorization");
    expect(onDelta.mock.calls).toEqual([
      ["回", "回"],
      ["答", "回答"],
    ]);
    expect(onEnvelope).toHaveBeenCalledWith(envelope);
    expect(onCitations).toHaveBeenCalledWith([
      { id: "S1", title: "来源", url: "https://example.com/" },
    ]);
    expect(onVerification).toHaveBeenCalledWith(verification);
  });

  it("maps a non-successful server response to its safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { message: "Server model provider is not configured." } },
          { status: 503 },
        ),
      ),
    );

    await expect(sendChatMessage([], requestContext)).rejects.toThrow(
      "Server model provider is not configured.",
    );
  });

  it("uses a visible fallback when the stream has no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("event: done\ndata: {}\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    await expect(sendChatMessage([], requestContext)).resolves.toBe(
      "（AI 未返回内容）",
    );
  });
});

describe("chat reply actions", () => {
  const session: Session = {
    id: "session-1",
    title: "测试",
    updatedAt: 1,
    schemaVersion: 2,
    activeLeafId: "user-1",
    messages: [{ id: "user-1", parentId: null, role: "user", content: "问题" }],
  };

  it("appends a versioned assistant reply without mutating the source", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));

    const result = applySendReply(session, "回答");

    expect(result).not.toBe(session);
    expect(session.messages).toHaveLength(1);
    expect(getActiveMessages(result)).toHaveLength(2);
    expect(getActiveMessages(result)[1]).toMatchObject({
      role: "assistant",
      content: "回答",
      parentId: "user-1",
      createdAt: Date.parse("2026-09-05T00:00:00Z"),
    });
  });

  it("adds a retry version without mutating previous versions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
    const withAssistant: Session = {
      ...session,
      activeLeafId: "assistant-1",
      messages: [
        ...session.messages,
        {
          id: "assistant-1",
          parentId: "user-1",
          role: "assistant",
          content: "旧回答",
        },
      ],
    };

    const result = applyRetryReply(withAssistant, "新回答", "assistant-1");

    expect(getActiveMessages(withAssistant).at(-1)?.content).toBe("旧回答");
    expect(getActiveMessages(result).at(-1)).toMatchObject({
      content: "新回答",
      parentId: "user-1",
    });
    expect(getAssistantSiblings(result, result.activeLeafId!)).toHaveLength(2);
  });

  it("returns the same session when the retry target is not an assistant", () => {
    expect(applyRetryReply(session, "无效回答", "user-1")).toBe(session);
    expect(applyRetryReply(session, "越界", "missing")).toBe(session);
  });
});
