import { z, ZodError } from "zod";
import { createPromptEnvelope } from "@/lib/ai/promptEnvelope";
import {
  ModelConfigError,
  type ModelProviderConfig,
  type ModelProviderStatus,
} from "@/lib/ai/server/modelConfig";
import {
  resolveModelProviderConfig,
  resolveModelProviderStatus,
} from "@/lib/ai/server/modelCredentialService";
import {
  ModelProviderError,
  type ModelProvider,
} from "@/lib/ai/server/modelProvider";
import { createMeasuredProvider } from "@/lib/ai/server/measuredProvider";
import { inputTextCharacters, resolveGenerationBudget, type GenerationBudget } from "@/lib/ai/server/tokenBudget";
import { getDatabase } from "@/lib/db/client";
import {
  createPromptRunRepository,
  PromptRunRepositoryError,
  type PromptRunRepositoryPort,
} from "@/lib/repositories/promptRunRepository";
import {
  citedSources,
  retrieveWebEvidence,
  SEARCH_MODES,
  type WebSearchProvider,
} from "@/lib/search/webSearch";
import { createConfiguredWebSearchProvider } from "@/lib/search/searxngProvider";
import { verifyResponse } from "@/lib/ai/responseVerifier";
import {
  addMemoryContext,
  type RetrievedMemory,
} from "@/lib/memory/memoryRetrieval";
import {
  createMemoryRepository,
  type MemoryRepositoryPort,
} from "@/lib/repositories/memoryRepository";
import {
  applyPersonaProfile,
  DEFAULT_PERSONA_PROFILE,
  type PersonaProfileValues,
} from "@/lib/persona/personaProfile";
import {
  createPersonaProfileRepository,
  type PersonaProfileRepositoryPort,
} from "@/lib/repositories/personaProfileRepository";
import type { PromptMessage } from "@/lib/ai/messages";
import { createKnowledgeRetrievalRepository } from "@/lib/repositories/knowledgeRetrievalRepository";
import { KnowledgeError } from "@/lib/repositories/knowledgeRepository";
import { addKnowledgeEvidence, knowledgeCitations } from "@/lib/knowledge/retrieval";
import type { KnowledgeRunContext } from "@/lib/knowledge/audit";
import { createConversationSummaryRepository, summaryModelKey } from "@/lib/repositories/conversationSummaryRepository";
import { SummaryError, type SummaryUse } from "@/lib/conversation/summary";

type ModelApiDependencies = {
  getConfig: () => ModelProviderConfig | Promise<ModelProviderConfig>;
  getStatus: () => ModelProviderStatus | Promise<ModelProviderStatus>;
  createProvider: (config: ModelProviderConfig) => ModelProvider;
  runs: PromptRunRepositoryPort;
  memories?: Pick<MemoryRepositoryPort, "retrieveForMessage">;
  persona?: Pick<PersonaProfileRepositoryPort, "get">;
  search?: WebSearchProvider;
  knowledge?: Pick<ReturnType<typeof createKnowledgeRetrievalRepository>, "forConversation">;
  summaries?: Pick<ReturnType<typeof createConversationSummaryRepository>, "prepare">;
};

const instructionPromptSchema = z
  .object({
    kind: z.literal("instruction"),
    source: z.enum(["policy", "mode", "persona"]),
    role: z.literal("system"),
    content: z.string().min(1).max(1_000_000),
  })
  .strict();
const conversationPromptSchema = z
  .object({
    kind: z.literal("conversation"),
    source: z.literal("conversation"),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(1_000_000),
  })
  .strict();

const modelRequestSchema = z
  .object({
    trigger: z.enum(["send", "retry"]),
    conversation: z
      .object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(200),
        activeLeafId: z.uuid().nullable(),
      })
      .strict(),
    prompt: z
      .array(
        z.union([
          instructionPromptSchema,
          conversationPromptSchema,
        ]),
      )
      .min(1)
      .max(500),
    searchMode: z.enum(SEARCH_MODES).default("auto"),
    useSummary: z.boolean().default(false),
    knowledgeCollectionIds: z.array(z.uuid()).max(10).refine((values) => new Set(values).size === values.length).default([]),
  })
  .strict()
  .refine(
    (input) =>
      input.prompt.reduce((total, message) => total + message.content.length, 0) <=
      2_000_000,
    { message: "Combined message content is too large." },
  );

const encoder = new TextEncoder();

function headers(requestId: string, contentType: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "x-request-id": requestId,
  };
}

function apiError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        retryable,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    {
      status,
      headers: headers(requestId, "application/json"),
    },
  );
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function parseRequest(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new SyntaxError("Request body must be valid JSON.");
  }
  return modelRequestSchema.parse(input);
}

export function createModelApi(dependencies: ModelApiDependencies) {
  return {
    async status(): Promise<Response> {
      const requestId = crypto.randomUUID();
      try {
        return Response.json(
          { data: await dependencies.getStatus() },
          { headers: headers(requestId, "application/json") },
        );
      } catch (error) {
        console.error(`[model-config:${requestId}] Status check failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        return apiError(
          requestId,
          500,
          "INTERNAL_ERROR",
          "The server could not read the model configuration.",
          true,
        );
      }
    },

    async stream(request: Request): Promise<Response> {
      const requestId = crypto.randomUUID();
      let input: z.infer<typeof modelRequestSchema>;
      let config: ModelProviderConfig;
      let envelope: Awaited<ReturnType<typeof createPromptEnvelope>>;
      let retrieval: Awaited<ReturnType<typeof retrieveWebEvidence>>["retrieval"];
      let usedMemories: RetrievedMemory[] = [];
      let generationBudget: GenerationBudget;
      let knowledge: KnowledgeRunContext | undefined;
      let summaryUse: SummaryUse | null = null;
      let summaryNote: string | undefined;

      try {
        input = await parseRequest(request);
        config = await dependencies.getConfig();
        let requestPrompt: PromptMessage[] = input.prompt;
        if (input.useSummary) {
          if (!dependencies.summaries) throw new SummaryError("摘要服务不可用；请关闭摘要后重试，历史未丢失。");
          const compacted = await dependencies.summaries.prepare(input.conversation.id, input.conversation.activeLeafId, summaryModelKey(config), input.prompt);
          requestPrompt = compacted.prompt;
          summaryUse = compacted.usage;
          summaryNote = compacted.note;
        }
        generationBudget = resolveGenerationBudget(config, "chat");
        if (inputTextCharacters(requestPrompt) > generationBudget.inputCharacterLimit) {
          throw new ModelProviderError("PROVIDER_CONTEXT_TOO_LARGE", "上下文超过本机输入预算，尚未调用模型。请新建对话或调整预算；原历史仍保留。", false);
        }
        const persona: PersonaProfileValues = dependencies.persona
          ? await dependencies.persona.get()
          : DEFAULT_PERSONA_PROFILE;
        if (input.conversation.activeLeafId && dependencies.memories) {
          usedMemories = await dependencies.memories.retrieveForMessage(
            input.conversation.id,
            input.conversation.activeLeafId,
            new Date(),
          );
        }
        const promptWithPersona = applyPersonaProfile(
          requestPrompt,
          persona,
          (content): PromptMessage => ({
            kind: "instruction",
            source: "persona",
            role: "system",
            content,
          }),
        );
        const promptWithMemory = addMemoryContext(promptWithPersona, usedMemories);
        let prepared: Awaited<ReturnType<typeof retrieveWebEvidence>>;
        if (input.knowledgeCollectionIds.length) {
          if (!dependencies.knowledge) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "资料库检索暂不可用；未将私人问题发送给搜索服务。");
          const found = await dependencies.knowledge.forConversation(input.conversation.id, input.conversation.activeLeafId, input.knowledgeCollectionIds);
          if (found.result.status === "too-broad") throw new KnowledgeError("KNOWLEDGE_LIMIT", "匹配候选超过 1,000 段，请缩小集合或增加具体关键词；尚未调用模型。");
          knowledge = { consumer: found.consumer, collectionIds: input.knowledgeCollectionIds, result: found.result };
          prepared = { prompt: addKnowledgeEvidence(promptWithMemory, found.result), retrieval: { kind: "knowledge", query: found.query, status: "completed", reason: "completed", citations: knowledgeCitations(found.result.hits) } };
        } else prepared = await retrieveWebEvidence({ prompt: promptWithMemory, mode: input.searchMode, provider: dependencies.search, signal: request.signal });
        retrieval = prepared.retrieval;
        envelope = await createPromptEnvelope({
          runId: requestId,
          trigger: input.trigger,
          conversation: input.conversation,
          prompt: prepared.prompt,
          generationBudget,
          ...(summaryNote ? { summary: { usage: summaryUse, note: summaryNote } } : {}),
          provider: {
            provider: "openai-compatible",
            baseUrl: config.baseUrl,
            model: config.model,
          },
        });
        if (inputTextCharacters(prepared.prompt) > generationBudget.inputCharacterLimit) throw new ModelProviderError("PROVIDER_CONTEXT_TOO_LARGE", "含检索资料的上下文超过输入预算，尚未调用模型。", false);
        if (summaryUse) await dependencies.runs.start(envelope, usedMemories, knowledge, summaryUse);
        else if (knowledge) await dependencies.runs.start(envelope, usedMemories, knowledge);
        else await dependencies.runs.start(envelope, usedMemories);
      } catch (error) {
        if (error instanceof SummaryError) return apiError(requestId, error.status, "SUMMARY_CONFLICT", error.message, false);
        if (error instanceof KnowledgeError) return apiError(requestId, 409, error.code, error.message, false);
        if (error instanceof ModelProviderError) return apiError(requestId, 413, error.code, error.message, false);
        if (error instanceof SyntaxError) {
          return apiError(
            requestId,
            400,
            "INVALID_JSON",
            error.message,
            false,
          );
        }
        if (error instanceof ZodError) {
          return apiError(
            requestId,
            400,
            "INVALID_REQUEST",
            "Request validation failed.",
            false,
            error.issues,
          );
        }
        if (error instanceof ModelConfigError) {
          return apiError(
            requestId,
            503,
            error.code,
            "Server model provider is not configured.",
            false,
            { missing: error.missing },
          );
        }
        if (error instanceof PromptRunRepositoryError) {
          return apiError(
            requestId,
            error.code === "CONVERSATION_NOT_FOUND" ? 404 : 409,
            error.code,
            error.message,
            false,
          );
        }
        return apiError(
          requestId,
          500,
          "INTERNAL_ERROR",
          "The server could not prepare the model request.",
          true,
        );
      }

      const abortController = new AbortController();
      const abortUpstream = () => abortController.abort(request.signal.reason);
      if (request.signal.aborted) abortUpstream();
      else request.signal.addEventListener("abort", abortUpstream, { once: true });

      const provider = dependencies.createProvider(config);
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(
              sse("meta", {
                requestId,
                provider: "openai-compatible",
                baseUrl: config.baseUrl,
                model: config.model,
                envelope,
                retrieval: knowledge ? { ...retrieval, citations: retrieval.citations.map(({ snippet, ...citation }) => { void snippet; return { ...citation, snippet: "" }; }) } : retrieval,
                ...(knowledge ? { knowledgeRetrieval: { ...(knowledge.result.fallback ? { fallback: knowledge.result.fallback } : {}), status: knowledge.result.status, count: knowledge.result.hits.length, candidateCount: knowledge.result.candidateCount, estimatedTokens: knowledge.result.estimatedTokens, durationMs: knowledge.result.durationMs, version: knowledge.result.version } } : {}),
                memoryRetrieval: {
                  count: usedMemories.length,
                  estimatedTokens: usedMemories.reduce(
                    (total, memory) => total + memory.estimatedTokens,
                    0,
                  ),
                },
              }),
            );
            let sawDone = false;
            let answer = "";
            for await (const event of provider.stream(
              { messages: envelope.request.messages, generationBudget },
              abortController.signal,
            )) {
              if (event.type === "delta") {
                answer += event.text;
                controller.enqueue(sse("delta", { text: event.text }));
              } else {
                await dependencies.runs.finish(envelope.runId, "completed");
                sawDone = true;
                const citations = citedSources(answer, retrieval.citations);
                const verification = verifyResponse({
                  answer,
                  query: retrieval.query,
                  retrieval,
                });
                controller.enqueue(
                  sse("done", {
                    citations: knowledge ? citations.map(({ snippet, ...citation }) => { void snippet; return { ...citation, snippet: "" }; }) : citations,
                    verification,
                  }),
                );
              }
            }
            if (!sawDone) {
              if (abortController.signal.aborted) {
                await dependencies.runs.finish(envelope.runId, "cancelled");
              } else {
                throw new ModelProviderError(
                  "PROVIDER_INVALID_RESPONSE",
                  "Model stream ended without a completion event.",
                  false,
                );
              }
            }
          } catch (error) {
            if (abortController.signal.aborted) {
              await dependencies.runs.finish(envelope.runId, "cancelled");
            } else {
              const providerError =
                error instanceof ModelProviderError
                  ? error
                  : new ModelProviderError(
                      "PROVIDER_UNAVAILABLE",
                      "Model stream failed.",
                      true,
                    );
              await dependencies.runs.finish(
                envelope.runId,
                "failed",
                providerError.code,
              );
              controller.enqueue(
                sse("error", {
                  code: providerError.code,
                  message: providerError.message,
                  retryable: providerError.retryable,
                  requestId,
                }),
              );
            }
          } finally {
            request.signal.removeEventListener("abort", abortUpstream);
            controller.close();
          }
        },
        cancel() {
          abortController.abort("Client cancelled the response stream.");
          void dependencies.runs.finish(envelope.runId, "cancelled");
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          ...headers(requestId, "text/event-stream; charset=utf-8"),
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    },
  };
}

export function getModelApi() {
  const database = getDatabase();
  return createModelApi({
    getConfig: resolveModelProviderConfig,
    getStatus: resolveModelProviderStatus,
    createProvider: createMeasuredProvider,
    runs: createPromptRunRepository(database),
    memories: createMemoryRepository(database),
    persona: createPersonaProfileRepository(database),
    search: createConfiguredWebSearchProvider(),
    knowledge: createKnowledgeRetrievalRepository(database),
    summaries: createConversationSummaryRepository(database),
  });
}
