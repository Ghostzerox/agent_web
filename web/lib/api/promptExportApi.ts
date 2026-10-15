import { z, ZodError } from "zod";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import { verifyPromptEnvelope } from "@/lib/ai/promptEnvelope";
import {
  createPromptExportArtifact,
  type PromptExportFormat,
} from "@/lib/ai/promptExport";
import { getDatabase } from "@/lib/db/client";
import {
  createPromptRunRepository,
  type PromptRunRepositoryPort,
} from "@/lib/repositories/promptRunRepository";

const sourceSchema = z.enum([
  "policy",
  "mode",
  "citation",
  "persona",
  "memory",
  "web-search",
  "conversation",
]);
const promptLayerSchema = z
  .object({
    kind: z.enum(["instruction", "context", "conversation"]),
    source: sourceSchema,
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1).max(1_000_000),
    position: z.number().int().nonnegative(),
    version: z.string().min(1).max(100),
  })
  .strict();
const envelopeSchema = z
  .object({
    format: z.literal("ai-study-companion.prompt-envelope"),
    schemaVersion: z.literal(1),
    runId: z.uuid(),
    createdAt: z.iso.datetime(),
    trigger: z.enum(["send", "retry"]),
    conversation: z
      .object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(200),
        activeLeafId: z.uuid().nullable(),
      })
      .strict(),
    composer: z
      .object({
        version: z.enum(["phase-5.2/v1", "phase-5.3/v1", "r1/cache-friendly-v1", "r3.2/mode-prompts-v1"]),
        layerOrder: z.array(sourceSchema).min(1).max(500),
      })
      .strict(),
    provider: z
      .object({
        requestId: z.uuid(),
        provider: z.literal("openai-compatible"),
        baseUrl: z.url(),
        model: z.string().trim().min(1).max(200),
      })
      .strict(),
    request: z
      .object({
        transport: z.literal("openai-compatible-chat-completions"),
        stream: z.literal(true),
        messages: z
          .array(
            z
              .object({
                role: z.enum(["system", "user", "assistant"]),
                content: z.string().min(1).max(1_000_000),
              })
              .strict(),
          )
          .min(1)
          .max(500),
        generation: z
          .object({
            temperature: z.null(),
            tools: z.tuple([]),
            maxOutputTokens: z.number().int().positive().nullable().optional(),
            tokenParameter: z.enum(["max_tokens", "max_completion_tokens"]).nullable().optional(),
          })
          .strict(),
      })
      .strict(),
    promptLayers: z.array(promptLayerSchema).min(1).max(500),
    context: z
      .object({
        truncated: z.literal(false),
        compressed: z.literal(false),
        notes: z.tuple([]),
      })
      .strict(),
    privacy: z
      .object({
        containsMemory: z.boolean(),
        persistedPromptContent: z.literal(false),
        alwaysExcluded: z.array(z.string().min(1).max(200)).max(20),
      })
      .strict(),
    integrity: z
      .object({
        algorithm: z.literal("SHA-256"),
        canonicalization: z.literal("JSON.stringify/v1"),
        scope: z.literal("prompt-envelope-without-integrity"),
        contentHash: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
  })
  .strict();

const exportRequestSchema = z
  .object({
    envelope: envelopeSchema,
    format: z.enum(["json", "markdown"]),
    includeMemory: z.boolean().default(false),
  })
  .strict();

function headers(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        retryable: false,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status, headers: headers(requestId) },
  );
}

function matchesAudit(
  envelope: PromptEnvelope,
  run: Awaited<ReturnType<PromptRunRepositoryPort["get"]>>,
): boolean {
  return Boolean(
    run &&
      run.id === envelope.runId &&
      run.conversationId === envelope.conversation.id &&
      run.activeLeafMessageId === envelope.conversation.activeLeafId &&
      run.envelopeSchemaVersion === envelope.schemaVersion &&
      run.composerVersion === envelope.composer.version &&
      run.contentHash === envelope.integrity.contentHash &&
      run.provider === envelope.provider.provider &&
      run.baseUrl === envelope.provider.baseUrl &&
      run.model === envelope.provider.model &&
      run.messageCount === envelope.request.messages.length &&
      run.containsMemory === envelope.privacy.containsMemory,
  );
}

export function createPromptExportApi(repository: PromptRunRepositoryPort) {
  return {
    async create(request: Request): Promise<Response> {
      const requestId = crypto.randomUUID();
      try {
        let input: unknown;
        try {
          input = await request.json();
        } catch {
          return errorResponse(
            requestId,
            400,
            "INVALID_JSON",
            "Request body must be valid JSON.",
          );
        }
        const parsed = exportRequestSchema.parse(input);
        const envelope = parsed.envelope as PromptEnvelope;
        const run = await repository.get(envelope.runId);
        if (!run) {
          return errorResponse(
            requestId,
            404,
            "PROMPT_RUN_NOT_FOUND",
            "Prompt run was not found.",
          );
        }
        if (!(await verifyPromptEnvelope(envelope)) || !matchesAudit(envelope, run)) {
          return errorResponse(
            requestId,
            409,
            "PROMPT_ENVELOPE_MISMATCH",
            "Prompt envelope does not match its audit record.",
          );
        }

        const artifact = await createPromptExportArtifact(
          envelope,
          parsed.format as PromptExportFormat,
          { includeMemory: parsed.includeMemory },
        );
        return Response.json(
          { data: artifact },
          { headers: headers(requestId) },
        );
      } catch (error) {
        if (error instanceof ZodError) {
          return errorResponse(
            requestId,
            400,
            "INVALID_REQUEST",
            "Request validation failed.",
            error.issues,
          );
        }
        console.error(`[prompt-export:${requestId}] Export failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        return errorResponse(
          requestId,
          500,
          "INTERNAL_ERROR",
          "The server could not export the Prompt envelope.",
        );
      }
    },
  };
}

export function getPromptExportApi() {
  return createPromptExportApi(createPromptRunRepository(getDatabase()));
}
