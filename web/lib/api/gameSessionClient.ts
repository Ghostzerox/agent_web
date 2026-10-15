import { apiFetch } from "@/lib/api/clientRuntime";
import type { GameToolRequest } from "@/lib/game/toolkit";
import type {
  GameCharacterController,
  GameCharacterInput,
  GameSessionKind,
  GameSessionStatus,
  GameSessionExportFormat,
  GameWorldInput,
} from "@/lib/game/contracts";
import type { GameRuleCheck, GameRuleCheckRequest } from "@/lib/game/checks";
import type { GameDiceRequest, GameDiceRoll } from "@/lib/game/dice";
import type {
  GameCharacterAttributes,
  GameState,
  GameStatePatch,
} from "@/lib/game/state";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";

export type GameSessionSummary = {
  id: string;
  userId: string;
  title: string;
  kind: GameSessionKind;
  status: GameSessionStatus;
  worldName: string;
  worldPremise: string;
  worldTone: string;
  worldRules: string[];
  safetyBoundaries: string[];
  activeLeafTurnId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type GameTurn = {
  id: string;
  sessionId: string;
  parentTurnId: string | null;
  playerContent: string;
  assistantContent: string;
  model: string;
  statePatch: GameStatePatch;
  stateSnapshot: GameState;
  createdAt: string;
};

type GameEventBase = {
  id: string;
  sessionId: string;
  turnId: string;
  sequence: number;
  createdAt: string;
};

export type GameEvent = GameEventBase & (
  | { kind: "dice_roll"; payload: GameDiceRoll }
  | { kind: "rule_check"; payload: GameRuleCheck }
);

export type GameCharacter = {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  controller: GameCharacterController;
  description: string;
  personality: string;
  goals: string[];
  boundaries: string[];
  attributes: GameCharacterAttributes;
  maxHealth: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type GameCheckpoint = {
  id: string;
  sessionId: string;
  turnId: string;
  name: string;
  note: string;
  stateSnapshot: GameState;
  createdAt: string;
};

export type GameSessionDetail = GameSessionSummary & {
  characters: GameCharacter[];
  turns: GameTurn[];
  events: GameEvent[];
  checkpoints: GameCheckpoint[];
};

export class GameSessionClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GameSessionClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GameSessionClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (body as { data: T }).data;
}

export function listGameSessions(): Promise<GameSessionSummary[]> {
  return request("/api/v1/game-sessions");
}

export function getGameSession(id: string): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(id)}`);
}

export function createGameSession(input: {
  title: string;
  kind: GameSessionKind;
  world: GameWorldInput;
  initialCharacter: GameCharacterInput | null;
}): Promise<GameSessionDetail> {
  return request("/api/v1/game-sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGameSession(
  id: string,
  input: {
    title: string;
    kind: GameSessionKind;
    world: GameWorldInput;
    expectedVersion: number;
  },
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteGameSession(id: string, expectedVersion: number): Promise<void> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function createGameCharacter(
  sessionId: string,
  input: GameCharacterInput & { expectedSessionVersion: number },
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(sessionId)}/characters`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGameCharacter(
  sessionId: string,
  characterId: string,
  input: GameCharacterInput & {
    expectedSessionVersion: number;
    expectedCharacterVersion: number;
  },
): Promise<GameSessionDetail> {
  return request(
    `/api/v1/game-sessions/${encodeURIComponent(sessionId)}/characters/${encodeURIComponent(characterId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteGameCharacter(
  sessionId: string,
  characterId: string,
  expectedSessionVersion: number,
  expectedCharacterVersion: number,
): Promise<GameSessionDetail> {
  return request(
    `/api/v1/game-sessions/${encodeURIComponent(sessionId)}/characters/${encodeURIComponent(characterId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ expectedSessionVersion, expectedCharacterVersion }),
    },
  );
}

export function updateGameSessionStatus(
  sessionId: string,
  status: "active" | "paused",
  expectedVersion: number,
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(sessionId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, expectedVersion }),
  });
}

export function createGameTurn(
  sessionId: string,
  content: string,
  parentTurnId: string | null,
  expectedVersion: number,
  diceRequests: GameDiceRequest[] = [],
  checkRequest: GameRuleCheckRequest | null = null,
  toolOptions: { requestId?: string; toolRequest?: GameToolRequest; toolOnly?: boolean } = {},
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    body: JSON.stringify({
      content,
      parentTurnId,
      expectedVersion,
      diceRequests,
      checkRequest,
      ...toolOptions,
    }),
  });
}

export function createGameCheckpoint(
  sessionId: string,
  name: string,
  note: string,
  expectedVersion: number,
): Promise<GameSessionDetail> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(sessionId)}/checkpoints`, {
    method: "POST",
    body: JSON.stringify({ name, note, expectedVersion }),
  });
}

export function restoreGameCheckpoint(
  sessionId: string,
  checkpointId: string,
  expectedVersion: number,
): Promise<GameSessionDetail> {
  return request(
    `/api/v1/game-sessions/${encodeURIComponent(sessionId)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
    { method: "POST", body: JSON.stringify({ expectedVersion }) },
  );
}

export function deleteGameCheckpoint(
  sessionId: string,
  checkpointId: string,
  expectedVersion: number,
): Promise<GameSessionDetail> {
  return request(
    `/api/v1/game-sessions/${encodeURIComponent(sessionId)}/checkpoints/${encodeURIComponent(checkpointId)}`,
    { method: "DELETE", body: JSON.stringify({ expectedVersion }) },
  );
}

export function exportGameSession(
  sessionId: string,
  format: GameSessionExportFormat,
): Promise<PromptExportArtifact> {
  return request(`/api/v1/game-sessions/${encodeURIComponent(sessionId)}/export`, {
    method: "POST",
    body: JSON.stringify({ format }),
  });
}
