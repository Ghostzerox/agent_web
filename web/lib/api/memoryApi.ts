import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createMemoryRepository,
  MemoryRepositoryError,
  type MemoryRepositoryPort,
} from "@/lib/repositories/memoryRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "MEMORY_NOT_FOUND"
  | "MEMORY_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class InputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MemoryApiInputError";
  }
}

const idSchema = z.uuid();
const updateSchema = z
  .object({
    content: z.string().trim().min(1).max(500),
    kind: z.enum(["preference", "goal", "profile", "fact"]),
    pinned: z.boolean(),
    validUntil: z.iso.datetime({ offset: true }).nullable(),
    expectedVersion: z.number().int().positive(),
    clearSourceEvidence: z.boolean().optional(),
  })
  .strict();
const deleteSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

function headers(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: headers(requestId) });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return response(
    requestId,
    { error: { code, message, retryable, requestId, ...(details === undefined ? {} : { details }) } },
    status,
  );
}

function parseId(id: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    throw new InputError("INVALID_REQUEST", "Memory id must be a UUID.", parsed.error.issues);
  }
  return parsed.data;
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InputError("INVALID_REQUEST", "Request validation failed.", error.issues);
    }
    throw error;
  }
}

async function handle(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(requestId, 400, error.code, error.message, false, error.details);
    }
    if (error instanceof MemoryRepositoryError) {
      return errorResponse(
        requestId,
        error.code === "MEMORY_NOT_FOUND" ? 404 : 409,
        error.code,
        error.message,
        false,
      );
    }
    console.error(`[api:${requestId}] Memory API failed`, {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createMemoryApi(
  repositoryOrFactory: MemoryRepositoryPort | (() => MemoryRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function" ? repositoryOrFactory() : repositoryOrFactory;
  return {
    list(): Promise<Response> {
      return handle(async (requestId) =>
        response(requestId, { data: await repository().list() }),
      );
    },
    update(id: string, request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const memoryId = parseId(id);
        const input = await parseBody(request, updateSchema);
        return response(requestId, {
          data: await repository().update({
            ...input,
            id: memoryId,
            validUntil: input.validUntil ? new Date(input.validUntil) : null,
            now: now(),
          }),
        });
      });
    },
    delete(id: string, request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const memoryId = parseId(id);
        const input = await parseBody(request, deleteSchema);
        await repository().delete(memoryId, input.expectedVersion);
        return response(requestId, { data: { deleted: true } });
      });
    },
  };
}

export function getMemoryApi() {
  return createMemoryApi(() => createMemoryRepository(getDatabase()));
}
