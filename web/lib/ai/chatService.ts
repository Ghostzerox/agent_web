import {
  type ChatMessage,
  type Session,
} from "@/lib/conversation/session";
import type { PromptMessage } from "@/lib/ai/messages";
import type { MessageCitation } from "@/lib/ai/messages";
import type { ResponseVerification } from "@/lib/ai/messages";
import { isResponseVerification } from "@/lib/ai/responseVerifier";
import type { SearchMode } from "@/lib/search/webSearch";
import {
  isPromptEnvelope,
  type PromptEnvelope,
  type PromptTrigger,
} from "@/lib/ai/promptEnvelope";
import {
  appendAssistantBranch,
  appendMessage,
} from "@/lib/conversation/tree";
import { apiFetch } from "@/lib/api/clientRuntime";
import { finishModelResponse } from "./modelOperations";

/**
 * 纯 API 调用。signal 直接传入 fetch，支持 AbortController。
 */
export async function sendChatMessage(
  messages: PromptMessage[],
  context: {
    trigger: PromptTrigger;
    conversation: PromptEnvelope["conversation"];
    searchMode?: SearchMode;
    knowledgeCollectionIds?: string[];
    useSummary?: boolean;
  },
  signal?: AbortSignal,
  onDelta?: (text: string, accumulated: string) => void,
  onEnvelope?: (envelope: PromptEnvelope) => void,
  onCitations?: (citations: MessageCitation[]) => void,
  onVerification?: (verification: ResponseVerification) => void,
): Promise<string> {
  const response = await apiFetch("/api/v1/model/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      trigger: context.trigger,
      conversation: context.conversation,
      prompt: messages,
      searchMode: context.searchMode ?? "auto",
      ...(context.knowledgeCollectionIds?.length ? { knowledgeCollectionIds: context.knowledgeCollectionIds } : {}),
      ...(context.useSummary ? { useSummary: true } : {}),
    }),
    signal,
  });

  try {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message;
    throw new Error(
      typeof message === "string" ? message : `服务端返回错误：${response.status}`,
    );
  }
  if (!response.body) throw new Error("服务端没有返回可读取的响应流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    if (done && buffer.trim()) {
      frames.push(buffer);
      buffer = "";
    }

    for (const frame of frames) {
      const event = frame
        .split(/\r?\n/)
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const dataText = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!dataText) continue;

      const data = JSON.parse(dataText);
      if (event === "meta" && isPromptEnvelope(data.envelope)) {
        onEnvelope?.(data.envelope);
      } else if (event === "delta" && typeof data.text === "string") {
        result += data.text;
        onDelta?.(data.text, result);
      } else if (event === "error") {
        throw new Error(
          typeof data.message === "string" ? data.message : "模型生成失败",
        );
      } else if (event === "done") {
        if (Array.isArray(data.citations)) {
          onCitations?.(data.citations as MessageCitation[]);
        }
        if (isResponseVerification(data.verification)) {
          onVerification?.(data.verification);
        }
      }
    }

    if (done) break;
  }

  return result || "（AI 未返回内容）";
  } catch (error) { finishModelResponse(response, true); throw error; }
  finally { finishModelResponse(response); }
}

// ── 领域 Action（纯计算，只算不写）──

/**
 * 纯函数：将 AI 回复追加为新 assistant 消息，返回新 Session。
 * 不写 localStorage，不产生副作用。
 */
export function applySendReply(
  session: Session,
  reply: string,
  messageId = crypto.randomUUID(),
): Session {
  const assistant: ChatMessage = {
    id: messageId,
    role: "assistant",
    content: reply,
    createdAt: Date.now(),
  };

  return {
    ...appendMessage(session, assistant),
    updatedAt: Date.now(),
  };
}

/**
 * 纯函数：为指定 assistant 的回复创建兄弟分支，返回新 Session。
 * 不写 localStorage，不产生副作用。
 */
export function applyRetryReply(
  session: Session,
  reply: string,
  targetMessageId: string,
  messageId = crypto.randomUUID(),
): Session {
  const target = session.messages.find(
    (message) => message.id === targetMessageId,
  );
  if (!target || target.role !== "assistant") return session;

  const branch: ChatMessage = {
    id: messageId,
    role: "assistant",
    content: reply,
    createdAt: Date.now(),
  };

  const updated = appendAssistantBranch(session, targetMessageId, branch);
  return { ...updated, updatedAt: Date.now() };
}
