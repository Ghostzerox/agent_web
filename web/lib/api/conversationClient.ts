import type {
  ChatMessage,
  MessageCitation,
  ResponseVerification,
} from "@/lib/ai/messages";
import { isResponseVerification } from "@/lib/ai/responseVerifier";
import { isCoreModeId, type CoreModeId } from "@/lib/agent/modeRegistry";
import type { Session } from "@/lib/config";
import { CONVERSATION_SCHEMA_VERSION } from "@/lib/conversation/tree";
import { apiFetch } from "@/lib/api/clientRuntime";

type ConversationRecord = {
  id: string;
  title: string;
  mode?: string;
  activeLeafMessageId: string | null;
  version: number;
  updatedAt: string;
};

type MessageRecord = {
  id: string;
  parentMessageId: string | null;
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: string;
  citations?: MessageCitation[];
  verification?: ResponseVerification | null;
  createdAt: string;
};

type ConversationDetail = ConversationRecord & { messages: MessageRecord[] };

export type ServerSession = Session & { serverVersion: number };

type ApiEnvelope<T> = { data: T };

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error?.message;
    throw new Error(
      typeof message === "string" ? message : `服务端请求失败：${response.status}`,
    );
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as ApiEnvelope<T>;
  return body.data;
}

function toTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function safeCitations(value: MessageCitation[] | undefined): MessageCitation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((citation) => {
    if (!citation || typeof citation.title !== "string" || typeof citation.url !== "string") {
      return false;
    }
    try {
      return ["http:", "https:"].includes(new URL(citation.url).protocol);
    } catch {
      return false;
    }
  });
}

function toChatMessage(record: MessageRecord): ChatMessage | null {
  if (record.role !== "user" && record.role !== "assistant") return null;
  return {
    id: record.id,
    parentId: record.parentMessageId,
    role: record.role,
    content: record.content,
    createdAt: toTimestamp(record.createdAt),
    citations: safeCitations(record.citations),
    verification: isResponseVerification(record.verification)
      ? record.verification
      : null,
  };
}

export function toServerSession(detail: ConversationDetail): ServerSession {
  const messages = detail.messages
    .map(toChatMessage)
    .filter((message): message is ChatMessage => message !== null);
  const visibleIds = new Set(messages.map((message) => message.id));
  return {
    id: detail.id,
    title: detail.title,
    messages,
    updatedAt: toTimestamp(detail.updatedAt),
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    activeLeafId:
      detail.activeLeafMessageId && visibleIds.has(detail.activeLeafMessageId)
        ? detail.activeLeafMessageId
        : null,
    mode: isCoreModeId(detail.mode) ? detail.mode : "auto",
    serverVersion: detail.version,
  };
}

export async function listServerSessions(): Promise<ServerSession[]> {
  const summaries = await apiRequest<ConversationRecord[]>(
    "/api/v1/conversations",
  );
  return Promise.all(
    summaries.map(async (summary) =>
      toServerSession(
        await apiRequest<ConversationDetail>(
          `/api/v1/conversations/${summary.id}`,
        ),
      ),
    ),
  );
}

export async function getServerSession(id: string): Promise<ServerSession> {
  return toServerSession(
    await apiRequest<ConversationDetail>(`/api/v1/conversations/${id}`),
  );
}

export async function createServerSession(): Promise<ServerSession> {
  const conversation = await apiRequest<ConversationRecord>(
    "/api/v1/conversations",
    {
      method: "POST",
      body: JSON.stringify({ title: "新对话", mode: "auto" }),
    },
  );
  return {
    id: conversation.id,
    title: conversation.title,
    messages: [],
    updatedAt: toTimestamp(conversation.updatedAt),
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    activeLeafId: null,
    mode: isCoreModeId(conversation.mode) ? conversation.mode : "auto",
    serverVersion: conversation.version,
  };
}

export async function deleteServerSession(id: string, options?: { deleteRelatedMemories: boolean }): Promise<void> {
  await apiRequest<void>(`/api/v1/conversations/${id}`, { method: "DELETE", ...(options ? { headers: { "content-type": "application/json" }, body: JSON.stringify(options) } : {}) });
}

export async function updateServerSession(
  id: string,
  input: {
    title?: string;
    mode?: CoreModeId;
    expectedVersion: number;
  },
): Promise<ConversationRecord> {
  return apiRequest(`/api/v1/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function renameServerSession(
  id: string,
  title: string,
  expectedVersion: number,
): Promise<ConversationRecord> {
  return updateServerSession(id, { title, expectedVersion });
}

export async function appendServerMessage(
  conversationId: string,
  input: {
    parentMessageId: string | null;
    role: "user" | "assistant";
    content: string;
    citations?: MessageCitation[];
    verification?: ResponseVerification | null;
  },
): Promise<{ conversation: ConversationRecord; message: MessageRecord }> {
  return apiRequest(`/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      ...input,
      status: "complete",
      model: null,
      citations: input.citations ?? [],
      verification: input.verification ?? null,
    }),
  });
}

export async function setServerActiveLeaf(
  conversationId: string,
  messageId: string | null,
  expectedVersion: number,
): Promise<ConversationRecord> {
  return apiRequest(`/api/v1/conversations/${conversationId}/active-leaf`, {
    method: "PATCH",
    body: JSON.stringify({ messageId, expectedVersion }),
  });
}

export function serverRecordToMessage(record: MessageRecord): ChatMessage {
  const message = toChatMessage(record);
  if (!message) throw new Error("服务端返回了不可展示的消息角色");
  return message;
}
