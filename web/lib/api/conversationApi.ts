import { z, ZodError, type ZodType } from "zod";
import { CORE_MODE_IDS } from "@/lib/agent/modeRegistry";
import { getDatabase } from "@/lib/db/client";
import { isLocalKnowledgeUrl, knowledgeCitationUrl } from "@/lib/knowledge/citations";
import { knowledgeCitationMetadataSchema } from "@/lib/knowledge/citationMetadata";
import {
  createConversationRepository,
  RepositoryError,
  type ConversationRepositoryPort,
} from "@/lib/repositories/conversationRepository";

type ApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "CONVERSATION_NOT_FOUND"
  | "MESSAGE_NOT_FOUND"
  | "INVALID_MESSAGE_PARENT"
  | "INVALID_ACTIVE_LEAF"
  | "VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class ApiInputError extends Error {
  constructor(
    readonly code: Extract<ApiErrorCode, "INVALID_JSON" | "INVALID_REQUEST">,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

const conversationIdSchema = z.uuid();
const conversationModeSchema = z.enum(CORE_MODE_IDS);
const createConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).default("新对话"),
    mode: conversationModeSchema.default("auto"),
  })
  .strict();

const verificationCheckSchema = z
  .object({
    id: z.enum([
      "citation-integrity",
      "citation-support",
      "freshness",
      "inference-boundary",
    ]),
    label: z.string().trim().min(1).max(100),
    status: z.enum(["pass", "warning", "fail", "not-applicable"]),
    detail: z.string().trim().min(1).max(2_000),
    citationIds: z
      .array(z.string().regex(/^S[1-9]\d*$/u))
      .max(100)
      .optional(),
  })
  .strict();

const responseVerificationSchema = z
  .object({
    schemaVersion: z.literal(1),
    verifierVersion: z.literal("core-3.4/rule-v1"),
    status: z.enum(["pass", "warning", "fail"]),
    checkedAt: z.iso.datetime(),
    summary: z.string().trim().min(1).max(500),
    checks: z.array(verificationCheckSchema).length(4),
    limitations: z.array(z.string().trim().min(1).max(500)).max(10),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.checks.map((check) => check.id)).size === 4,
    { message: "Verification checks must contain each check exactly once." },
  );

const appendMessageSchema = z
  .object({
    parentMessageId: z.uuid().nullable().default(null),
    role: z.enum(["system", "developer", "user", "assistant", "tool"]),
    content: z.string().min(1).max(1_000_000),
    status: z
      .enum(["pending", "streaming", "complete", "failed"])
      .default("complete"),
    model: z.string().trim().min(1).max(200).nullable().default(null),
    citations: z
      .array(
        z
          .object({
            id: z.string().regex(/^S[1-9]\d*$/u).optional(),
            title: z.string().trim().min(1).max(500),
            url: z.string().max(3000).refine((value) => { if (isLocalKnowledgeUrl(value)) return true; try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }),
            knowledge: knowledgeCitationMetadataSchema.optional(),
            snippet: z.string().trim().max(2_000).optional(),
            source: z.string().trim().min(1).max(255).optional(),
            publishedAt: z.iso.datetime().nullable().optional(),
            fetchedAt: z.iso.datetime().optional(),
          })
          .strict().refine((citation) => citation.knowledge ? citation.url === knowledgeCitationUrl(citation.knowledge) && !citation.snippet : !isLocalKnowledgeUrl(citation.url), { message: "Local references must carry matching source metadata without a private excerpt." }),
      )
      .max(100)
      .default([]),
    verification: responseVerificationSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (input) => input.role === "assistant" || input.verification === null,
    { message: "Only assistant messages may include verification results." },
  );

const setActiveLeafSchema = z
  .object({
    messageId: z.uuid().nullable(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

const updateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    mode: conversationModeSchema.optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine((input) => input.title !== undefined || input.mode !== undefined, {
    message: "At least one conversation field must be provided.",
  });

function responseHeaders(requestId: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-request-id": requestId,
  };
}

function jsonResponse(
  requestId: string,
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { ...responseHeaders(requestId), ...headers },
  });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return jsonResponse(
    requestId,
    {
      error: {
        code,
        message,
        retryable,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiInputError("INVALID_JSON", "Request body must be valid JSON.");
  }

  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parseConversationId(id: string): string {
  const result = conversationIdSchema.safeParse(id);
  if (!result.success) {
    throw new ApiInputError(
      "INVALID_REQUEST",
      "Conversation id must be a UUID.",
      result.error.issues,
    );
  }
  return result.data;
}

async function handleRequest(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof ApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        false,
        error.details,
      );
    }

    if (error instanceof RepositoryError) {
      const status =
        error.code === "CONVERSATION_NOT_FOUND" ||
        error.code === "MESSAGE_NOT_FOUND"
          ? 404
          : 409;
      return errorResponse(
        requestId,
        status,
        error.code,
        error.message,
        false,
      );
    }

    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Conversation API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createConversationApi(
  repositoryOrFactory:
    | ConversationRepositoryPort
    | (() => ConversationRepositoryPort),
) {
  const repository = (): ConversationRepositoryPort =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    list(): Promise<Response> {
      return handleRequest(async (requestId) =>
        jsonResponse(requestId, {
          data: await repository().listConversations(),
        }),
      );
    },

    create(request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const input = await parseBody(request, createConversationSchema);
        const conversation = await repository().createConversation(input);
        return jsonResponse(
          requestId,
          { data: conversation },
          201,
          { location: `/api/v1/conversations/${conversation.id}` },
        );
      });
    },

    get(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversation = await repository().getConversation(
          parseConversationId(id),
        );
        if (!conversation) {
          return errorResponse(
            requestId,
            404,
            "CONVERSATION_NOT_FOUND",
            "Conversation was not found.",
            false,
          );
        }
        return jsonResponse(requestId, { data: conversation });
      });
    },

    delete(id: string, request?: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const raw = request ? await request.text() : "";
        let options: { deleteRelatedMemories: boolean } | undefined;
        if (raw) {
          let parsed: unknown;
          try { parsed = JSON.parse(raw); } catch { throw new ApiInputError("INVALID_JSON", "Request body must be valid JSON."); }
          const validated = z.object({ deleteRelatedMemories: z.boolean() }).strict().safeParse(parsed);
          if (!validated.success) throw new ApiInputError("INVALID_REQUEST", "Invalid deletion options.", validated.error.issues);
          options = validated.data;
        }
        const deleted = await repository().deleteConversation(
          parseConversationId(id),
          ...(options ? [options] : []),
        );
        if (!deleted) {
          return errorResponse(
            requestId,
            404,
            "CONVERSATION_NOT_FOUND",
            "Conversation was not found.",
            false,
          );
        }
        return new Response(null, {
          status: 204,
          headers: responseHeaders(requestId),
        });
      });
    },

    update(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversationId = parseConversationId(id);
        const input = await parseBody(request, updateConversationSchema);
        const conversation = await repository().updateConversation(
          conversationId,
          input,
        );
        return jsonResponse(requestId, { data: conversation });
      });
    },

    appendMessage(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversationId = parseConversationId(id);
        const input = await parseBody(request, appendMessageSchema);
        const result = await repository().appendMessage(conversationId, input);
        return jsonResponse(requestId, { data: result }, 201, {
          location: `/api/v1/conversations/${conversationId}#message-${result.message.id}`,
        });
      });
    },

    setActiveLeaf(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversationId = parseConversationId(id);
        const input = await parseBody(request, setActiveLeafSchema);
        const conversation = await repository().setActiveLeaf(
          conversationId,
          input.messageId,
          input.expectedVersion,
        );
        return jsonResponse(requestId, { data: conversation });
      });
    },
  };
}

export function getConversationApi() {
  return createConversationApi(() =>
    createConversationRepository(getDatabase()),
  );
}
