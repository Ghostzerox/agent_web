import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";

export type PromptExportFormat = "json" | "markdown";

export type PromptExportDocument = {
  format: "ai-study-companion.prompt-export";
  schemaVersion: 2;
  exportedAt: string;
  envelope: {
    runId: string;
    createdAt: string;
    schemaVersion: number;
    composerVersion: string;
  };
  trigger: PromptEnvelope["trigger"];
  conversation: PromptEnvelope["conversation"];
  provider: PromptEnvelope["provider"];
  request: PromptEnvelope["request"];
  promptLayers: PromptEnvelope["promptLayers"];
  context: PromptEnvelope["context"];
  privacy: {
    exactRequestContent: boolean;
    memoryIncluded: boolean;
    redactedSources: Array<"memory" | "knowledge">;
    alwaysExcluded: string[];
  };
  integrity: {
    algorithm: "SHA-256";
    scope: "exported-request-and-layers";
    contentHash: string;
    auditContentHash: string;
  };
};

const REDACTED_MEMORY = "[记忆上下文已从导出文件中移除；勾选“包含记忆上下文”可导出完整内容。]";

function exportedPrompt(
  prompt: readonly PromptEnvelope["promptLayers"][number][],
  includeMemory: boolean,
): PromptEnvelope["promptLayers"] {
  return prompt.map((message) =>
    (message.source === "memory" || message.source === "knowledge") && !includeMemory
      ? { ...message, content: REDACTED_MEMORY }
      : { ...message },
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function filenamePart(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "conversation";
}

function timestampPart(value: string): string {
  return value.replace(/[-:.]/g, "");
}

function fenced(content: string): string {
  let longest = 2;
  for (const match of content.matchAll(/`+/g)) {
    longest = Math.max(longest, match[0].length);
  }
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${content}\n${fence}`;
}

export async function createPromptExportDocument(
  envelope: PromptEnvelope,
  options: { includeMemory: boolean; exportedAt?: string },
): Promise<PromptExportDocument> {
  const promptLayers = exportedPrompt(envelope.promptLayers, options.includeMemory);
  const hasMemory = envelope.privacy.containsMemory;
  const request = {
    ...envelope.request,
    messages: promptLayers.map(({ role, content }) => ({ role, content })),
  };
  const integrityInput = JSON.stringify({
    provider: envelope.provider,
    request,
    promptLayers,
  });

  return {
    format: "ai-study-companion.prompt-export",
    schemaVersion: 2,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    envelope: {
      runId: envelope.runId,
      createdAt: envelope.createdAt,
      schemaVersion: envelope.schemaVersion,
      composerVersion: envelope.composer.version,
    },
    trigger: envelope.trigger,
    conversation: { ...envelope.conversation },
    provider: { ...envelope.provider },
    request,
    promptLayers,
    context: { ...envelope.context },
    privacy: {
      exactRequestContent: !hasMemory || options.includeMemory,
      memoryIncluded: hasMemory && options.includeMemory,
      redactedSources: hasMemory && !options.includeMemory ? [...new Set(envelope.promptLayers.filter((layer) => layer.source === "memory" || layer.source === "knowledge").map((layer) => layer.source as "memory" | "knowledge"))] : [],
      alwaysExcluded: [
        "model API key",
        "database credentials",
        "push tokens",
        "internal error stacks",
      ],
    },
    integrity: {
      algorithm: "SHA-256",
      scope: "exported-request-and-layers",
      contentHash: await sha256(integrityInput),
      auditContentHash: envelope.integrity.contentHash,
    },
  };
}

export function serializePromptExportMarkdown(
  document: PromptExportDocument,
): string {
  const provider = document.provider;
  const lines = [
    "# Prompt 导出",
    "",
    `- 对话：${document.conversation.title}`,
    `- Run ID：${document.envelope.runId}`,
    `- Envelope：v${document.envelope.schemaVersion} / ${document.envelope.composerVersion}`,
    `- 创建时间：${document.envelope.createdAt}`,
    `- 导出时间：${document.exportedAt}`,
    `- 触发方式：${document.trigger === "retry" ? "重新生成" : "发送消息"}`,
    `- Provider：${provider.provider}`,
    `- Base URL：${provider.baseUrl}`,
    `- Model：${provider.model}`,
    `- Request ID：${provider.requestId}`,
    `- 记忆上下文：${document.privacy.memoryIncluded ? "已包含" : document.privacy.redactedSources.length ? "已脱敏" : "本次请求没有记忆层"}`,
    `- 内容哈希：${document.integrity.contentHash}`,
    `- 审计哈希：${document.integrity.auditContentHash}`,
    "",
    "> API Key、数据库凭据、Push Token 与内部错误栈始终不会进入导出文件。",
    "",
    "## Prompt 层",
    "",
  ];

  document.promptLayers.forEach((message, index) => {
    lines.push(
      `### ${index + 1}. ${message.kind} / ${message.source} / ${message.role}`,
      "",
      fenced(message.content),
      "",
    );
  });

  return `${lines.join("\n").trimEnd()}\n`;
}

export async function createPromptExportArtifact(
  envelope: PromptEnvelope,
  format: PromptExportFormat,
  options: { includeMemory: boolean; exportedAt?: string },
): Promise<PromptExportArtifact> {
  const document = await createPromptExportDocument(envelope, options);
  const extension = format === "json" ? "json" : "md";
  const content =
    format === "json"
      ? `${JSON.stringify(document, null, 2)}\n`
      : serializePromptExportMarkdown(document);
  return {
    filename: `prompt-${filenamePart(envelope.conversation.title)}-${timestampPart(document.exportedAt)}.${extension}`,
    mediaType: format === "json" ? "application/json" : "text/markdown",
    content,
  };
}
