import { z, ZodError, type ZodType } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createGameCharacterSchema,
  createGameSessionSchema,
  deleteGameCharacterSchema,
  deleteGameSessionSchema,
  updateGameCharacterSchema,
  updateGameSessionSchema,
} from "@/lib/game/contracts";
import { createGameSessionRepository, type GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";
import { GameSessionRepositoryError } from "@/lib/game/errors";

type GameSessionApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "GAME_SESSION_NOT_FOUND"
  | "GAME_CHARACTER_NOT_FOUND"
  | "GAME_TURN_NOT_FOUND"
  | "GAME_CHECKPOINT_NOT_FOUND"
  | "GAME_SESSION_VERSION_CONFLICT"
  | "GAME_CHARACTER_VERSION_CONFLICT"
  | "GAME_SESSION_INVALID_STATUS"
  | "INTERNAL_ERROR";

class GameSessionApiInputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GameSessionApiInputError";
  }
}

const idSchema = z.uuid();

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  });
}

async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new GameSessionApiInputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new GameSessionApiInputError(
        "INVALID_REQUEST",
        "Game session request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parseId(id: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    throw new GameSessionApiInputError(
      "INVALID_REQUEST",
      "Game session and character ids must be UUIDs.",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

function publicError(error: unknown): {
  code: GameSessionApiErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
} {
  if (error instanceof GameSessionApiInputError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      details: error.details,
    };
  }
  if (error instanceof GameSessionRepositoryError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The server could not complete the game session request.",
    retryable: true,
  };
}

function statusFor(error: unknown): number {
  if (error instanceof GameSessionApiInputError) return 400;
  if (error instanceof GameSessionRepositoryError) {
    return error.code.endsWith("NOT_FOUND") ? 404 : 409;
  }
  return 500;
}

export function createGameSessionApi(
  repositoryOrFactory:
    | GameSessionRepositoryPort
    | (() => GameSessionRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  const handle = async (operation: (requestId: string) => Promise<Response>) => {
    const requestId = crypto.randomUUID();
    try {
      return await operation(requestId);
    } catch (error) {
      const status = statusFor(error);
      if (status === 500) {
        console.error(`[api:${requestId}] Game session API failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return response(requestId, { error: { ...publicError(error), requestId } }, status);
    }
  };

  return {
    list: () => handle(async (requestId) =>
      response(requestId, { data: await repository().list() })),
    create: (request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, createGameSessionSchema);
      return response(
        requestId,
        { data: await repository().create({ ...input, now: now() }) },
        201,
      );
    }),
    get: (id: string) => handle(async (requestId) => {
      const detail = await repository().get(parseId(id));
      if (!detail) {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_NOT_FOUND",
          "Game session was not found.",
        );
      }
      return response(requestId, { data: detail });
    }),
    update: (id: string, request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, updateGameSessionSchema);
      return response(requestId, {
        data: await repository().update(parseId(id), { ...input, now: now() }),
      });
    }),
    delete: (id: string, request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, deleteGameSessionSchema);
      await repository().delete(parseId(id), input.expectedVersion);
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      });
    }),
    createCharacter: (id: string, request: Request) =>
      handle(async (requestId) => {
        const input = await parseBody(request, createGameCharacterSchema);
        return response(
          requestId,
          {
            data: await repository().createCharacter(parseId(id), {
              ...input,
              now: now(),
            }),
          },
          201,
        );
      }),
    updateCharacter: (
      id: string,
      characterId: string,
      request: Request,
    ) => handle(async (requestId) => {
      const input = await parseBody(request, updateGameCharacterSchema);
      return response(requestId, {
        data: await repository().updateCharacter(
          parseId(id),
          parseId(characterId),
          { ...input, now: now() },
        ),
      });
    }),
    deleteCharacter: (
      id: string,
      characterId: string,
      request: Request,
    ) => handle(async (requestId) => {
      const input = await parseBody(request, deleteGameCharacterSchema);
      return response(requestId, {
        data: await repository().deleteCharacter(
          parseId(id),
          parseId(characterId),
          { ...input, now: now() },
        ),
      });
    }),
  };
}

export function getGameSessionApi() {
  return createGameSessionApi(() => createGameSessionRepository(getDatabase()));
}
