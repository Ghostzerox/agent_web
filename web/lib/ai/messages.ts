/**
 * 会被持久化并展示给用户的真实会话消息。
 * 系统指令、记忆上下文和工具过程不得写入这个类型。
 */
export type MessageCitation = {
  knowledge?: import("@/lib/knowledge/citations").KnowledgeCitationMetadata;
  id?: string;
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  publishedAt?: string | null;
  fetchedAt?: string;
};

export type VerificationCheckId =
  | "citation-integrity"
  | "citation-support"
  | "freshness"
  | "inference-boundary";

export type VerificationCheckStatus =
  | "pass"
  | "warning"
  | "fail"
  | "not-applicable";

export type ResponseVerification = {
  schemaVersion: 1;
  verifierVersion: "core-3.4/rule-v1";
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  summary: string;
  checks: Array<{
    id: VerificationCheckId;
    label: string;
    status: VerificationCheckStatus;
    detail: string;
    citationIds?: string[];
  }>;
  limitations: string[];
};

export type ChatMessage = {
  id?: string;
  parentId?: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  versions?: string[];
  activeVersion?: number;
  citations?: MessageCitation[];
  verification?: ResponseVerification | null;
};

export type PromptMessage =
  | {
      kind: "instruction";
      source: "policy" | "mode" | "citation" | "persona";
      role: "system";
      content: string;
    }
  | {
      kind: "context";
      source: "memory" | "web-search" | "knowledge" | "summary";
      role: "system";
      content: string;
    }
  | {
      kind: "conversation";
      source: "conversation";
      role: ChatMessage["role"];
      content: string;
    };

/**
 * 当前 OpenAI-compatible Chat Completions 的最小传输格式。
 * Prompt 的 kind/source 只供内部策略与审计使用，不发送给 Provider。
 */
export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelRequestMetadata = {
  requestId: string;
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
};

export function toChatCompletionMessages(
  messages: PromptMessage[],
): ChatCompletionMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}
