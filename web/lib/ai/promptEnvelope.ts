import {
  toChatCompletionMessages,
  type ModelRequestMetadata,
  type PromptMessage,
} from "@/lib/ai/messages";
import type { GenerationBudget } from "@/lib/ai/server/tokenBudget";
import { CORE_MODE_PROMPT_VERSION } from "@/lib/agent/modeRegistry";
import { PERSONA_PROMPT_VERSION } from "@/lib/persona/personaProfile";
import type { SummaryUse } from "@/lib/conversation/summary";
import { SUMMARY_POLICY } from "@/lib/conversation/summary";

export const PROMPT_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const PROMPT_COMPOSER_VERSION = "r3.2/mode-prompts-v1" as const;

export type PromptTrigger = "send" | "retry";

export type PromptEnvelope = {
  format: "ai-study-companion.prompt-envelope";
  schemaVersion: typeof PROMPT_ENVELOPE_SCHEMA_VERSION;
  runId: string;
  createdAt: string;
  trigger: PromptTrigger;
  conversation: {
    id: string;
    title: string;
    activeLeafId: string | null;
  };
  composer: {
    version: typeof PROMPT_COMPOSER_VERSION | "r1/cache-friendly-v1" | "phase-5.2/v1" | "phase-5.3/v1" | "r5.3/knowledge-context-v1" | "r5.4/branch-summary-v1";
    layerOrder: Array<PromptMessage["source"]>;
  };
  provider: ModelRequestMetadata;
  request: {
    transport: "openai-compatible-chat-completions";
    stream: true;
    messages: ReturnType<typeof toChatCompletionMessages>;
    generation: {
      temperature: null;
      tools: [];
      maxOutputTokens?: number | null;
      tokenParameter?: GenerationBudget["tokenParameter"];
    };
  };
  promptLayers: Array<
    PromptMessage & {
      position: number;
      version: string;
    }
  >;
  context: {
    truncated: false;
    compressed: boolean;
    notes: string[];
    summary?: SummaryUse;
  };
  privacy: {
    containsMemory: boolean;
    persistedPromptContent: false;
    alwaysExcluded: string[];
  };
  integrity: {
    algorithm: "SHA-256";
    canonicalization: "JSON.stringify/v1";
    scope: "prompt-envelope-without-integrity";
    contentHash: string;
  };
};

const LAYER_VERSIONS: Record<PromptMessage["source"], string> = {
  policy: "core-policy/v1",
  mode: CORE_MODE_PROMPT_VERSION,
  citation: "citation-policy/v1",
  persona: PERSONA_PROMPT_VERSION,
  memory: "memory-context/v2",
  "web-search": "web-search-context/v2",
  knowledge: "knowledge-context/r5.3-v1",
  summary: SUMMARY_POLICY,
  conversation: "conversation-tree/v2",
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function promptEnvelopeContent(
  envelope: PromptEnvelope,
): Omit<PromptEnvelope, "integrity"> {
  const { integrity, ...content } = envelope;
  void integrity;
  return content;
}

export async function hashPromptEnvelopeContent(
  envelope: PromptEnvelope,
): Promise<string> {
  return sha256(JSON.stringify(promptEnvelopeContent(envelope)));
}

export async function verifyPromptEnvelope(
  envelope: PromptEnvelope,
): Promise<boolean> {
  return (await hashPromptEnvelopeContent(envelope)) === envelope.integrity.contentHash;
}

export function isPromptEnvelope(value: unknown): value is PromptEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<PromptEnvelope>;
  return (
    envelope.format === "ai-study-companion.prompt-envelope" &&
    envelope.schemaVersion === PROMPT_ENVELOPE_SCHEMA_VERSION &&
    typeof envelope.runId === "string" &&
    typeof envelope.createdAt === "string" &&
    (envelope.trigger === "send" || envelope.trigger === "retry") &&
    Boolean(envelope.conversation) &&
    typeof envelope.conversation?.id === "string" &&
    Boolean(envelope.provider) &&
    envelope.provider?.requestId === envelope.runId &&
    Array.isArray(envelope.request?.messages) &&
    Array.isArray(envelope.promptLayers) &&
    typeof envelope.integrity?.contentHash === "string"
  );
}

export async function createPromptEnvelope(input: {
  runId: string;
  createdAt?: string;
  trigger: PromptTrigger;
  conversation: PromptEnvelope["conversation"];
  prompt: readonly PromptMessage[];
  provider: Omit<ModelRequestMetadata, "requestId">;
  generationBudget?: GenerationBudget;
  summary?: { usage: SummaryUse | null; note: string };
}): Promise<PromptEnvelope> {
  const promptLayers = input.prompt.map((message, index) => ({
    ...message,
    position: index,
    version: LAYER_VERSIONS[message.source],
  }));
  const envelope = {
    format: "ai-study-companion.prompt-envelope" as const,
    schemaVersion: PROMPT_ENVELOPE_SCHEMA_VERSION,
    runId: input.runId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    trigger: input.trigger,
    conversation: { ...input.conversation },
    composer: {
      version: input.summary?.usage ? "r5.4/branch-summary-v1" as const : input.prompt.some((layer) => layer.source === "knowledge") ? "r5.3/knowledge-context-v1" as const : PROMPT_COMPOSER_VERSION,
      layerOrder: promptLayers.map((layer) => layer.source),
    },
    provider: { requestId: input.runId, ...input.provider },
    request: {
      transport: "openai-compatible-chat-completions" as const,
      stream: true as const,
      messages: toChatCompletionMessages([...input.prompt]),
      generation: { temperature: null, tools: [] as [], ...(input.generationBudget ? { maxOutputTokens: input.generationBudget.maxOutputTokens, tokenParameter: input.generationBudget.tokenParameter } : {}) },
    },
    promptLayers,
    context: { truncated: false as const, compressed: Boolean(input.summary?.usage), notes: input.summary ? [input.summary.note] : [], ...(input.summary?.usage ? { summary: input.summary.usage } : {}) },
    privacy: {
      containsMemory: input.prompt.some((message) => message.source === "memory" || message.source === "knowledge" || message.source === "summary"),
      persistedPromptContent: false as const,
      alwaysExcluded: [
        "model API key",
        "database credentials",
        "push tokens",
        "internal error stacks",
        "non-exportable plugin private data",
      ],
    },
  };
  const contentHash = await sha256(JSON.stringify(envelope));
  return {
    ...envelope,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "JSON.stringify/v1",
      scope: "prompt-envelope-without-integrity",
      contentHash,
    },
  };
}
