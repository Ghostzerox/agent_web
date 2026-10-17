import { z, ZodError, type ZodType } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createGameCheckpointSchema,
  createGameTurnSchema,
  exportGameSessionSchema,
  mutateGameCheckpointSchema,
  updateGameSessionStatusSchema,
} from "@/lib/game/contracts";
import { GameRuleCheckError } from "@/lib/game/checks";
import {
  GameNarrativeGenerationError,
} from "@/lib/game/gameNarrativeGenerator";
import { exportGameSessionArtifact } from "@/lib/game/gameSessionExport";
import { createGameTurnService, type GameTurnService } from "@/lib/game/gameTurnService";
import { GameStateValidationError } from "@/lib/game/state";
import { ExplorationError } from "@/lib/game/exploration/contracts";
import { explorationHistoryQuerySchema, searchWorldHistory } from "@/lib/game/exploration/history";
import { gameTurnPath } from "@/lib/game/gameTurnService";
import {
  createGameSessionRepository,
  GameSessionRepositoryError,
  type GameSessionRepositoryPort,
} from "@/lib/repositories/gameSessionRepository";

class GamePlayInputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GamePlayInputError";
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new GamePlayInputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new GamePlayInputError(
        "INVALID_REQUEST",
        "Game play request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new GamePlayInputError(
      "INVALID_REQUEST",
      "Game session id must be a UUID.",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

function errorStatus(error: unknown): number {
  if (error instanceof ExplorationError) return 422;
  if (error instanceof GamePlayInputError) return 400;
  if (error instanceof GameSessionRepositoryError) {
    return error.code.endsWith("NOT_FOUND") ? 404 : 409;
  }
  if (error instanceof GameNarrativeGenerationError) {
    if (error.code === "MODEL_CONFIGURATION_ERROR") return 503;
    if (
      error.code === "PROVIDER_AUTHENTICATION_FAILED" ||
      error.code === "PROVIDER_MODEL_NOT_FOUND" ||
      error.code === "PROVIDER_REQUEST_REJECTED"
    ) return 422;
    return 502;
  }
  if (error instanceof GameStateValidationError) return 502;
  if (error instanceof GameRuleCheckError) return 422;
  return 500;
}

function publicError(error: unknown) {
  if (error instanceof ExplorationError) return { code: error.code, message: error.message, retryable: false };
  if (error instanceof GamePlayInputError) {
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
  if (error instanceof GameNarrativeGenerationError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof GameStateValidationError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.code === "GAME_OUTPUT_INVALID",
      details: error.details,
    };
  }
  if (error instanceof GameRuleCheckError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The server could not complete the game play request.",
    retryable: true,
  };
}

export function createGamePlayApi(
  repository: GameSessionRepositoryPort,
  turnService: GameTurnService,
  now: () => Date = () => new Date(),
) {
  const handle = async (operation: (requestId: string) => Promise<Response>) => {
    const requestId = crypto.randomUUID();
    try {
      return await operation(requestId);
    } catch (error) {
      const status = errorStatus(error);
      if (status === 500) {
        console.error(`[game-play-api:${requestId}] Request failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return response(requestId, { error: { ...publicError(error), requestId } }, status);
    }
  };

  return {
    updateStatus: (id: string, request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, updateGameSessionStatusSchema);
      return response(requestId, {
        data: await repository.updateStatus(parseId(id), { ...input, now: now() }),
      });
    }),
    searchHistory: (id: string, request: Request) => handle(async (requestId) => {
      const query = await parseBody(request, explorationHistoryQuerySchema);
      const session = await repository.get(parseId(id));
      if (!session) throw new GameSessionRepositoryError("GAME_SESSION_NOT_FOUND", "Game session was not found.");
      return response(requestId, { data: searchWorldHistory(gameTurnPath(session.turns, query.parentTurnId), query) });
    }),
    createTurn: (id: string, request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, createGameTurnSchema);
      return response(
        requestId,
        { data: await turnService.create(parseId(id), input, request.signal) },
        201,
      );
    }),
    createCheckpoint: (id: string, request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, createGameCheckpointSchema);
      return response(
        requestId,
        {
          data: await repository.createCheckpoint(parseId(id), {
            ...input,
            now: now(),
          }),
        },
        201,
      );
    }),
    restoreCheckpoint: (
      id: string,
      checkpointId: string,
      request: Request,
    ) => handle(async (requestId) => {
      const input = await parseBody(request, mutateGameCheckpointSchema);
      return response(requestId, {
        data: await repository.restoreCheckpoint(
          parseId(id),
          parseId(checkpointId),
          { ...input, now: now() },
        ),
      });
    }),
    deleteCheckpoint: (
      id: string,
      checkpointId: string,
      request: Request,
    ) => handle(async (requestId) => {
      const input = await parseBody(request, mutateGameCheckpointSchema);
      return response(requestId, {
        data: await repository.deleteCheckpoint(
          parseId(id),
          parseId(checkpointId),
          { ...input, now: now() },
        ),
      });
    }),
    export: (id: string, request: Request) => handle(async (requestId) => {
      const input = await parseBody(request, exportGameSessionSchema);
      const session = await repository.get(parseId(id));
      if (!session) {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_NOT_FOUND",
          "Game session was not found.",
        );
      }
      return response(requestId, {
        data: exportGameSessionArtifact(session, input.format, now()),
      });
    }),
  };
}

export function getGamePlayApi() {
  const repository = createGameSessionRepository(getDatabase());
  return createGamePlayApi(repository, createGameTurnService(repository));
}
