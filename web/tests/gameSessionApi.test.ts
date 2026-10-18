import { describe, expect, it, vi } from "vitest";
import { createGameSessionApi } from "@/lib/api/gameSessionApi";
import { GameSessionRepositoryError } from "@/lib/game/errors";
import type { GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";

function repository(
  overrides: Partial<GameSessionRepositoryPort> = {},
): GameSessionRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    delete: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
    updateStatus: vi.fn(),
    appendTurn: vi.fn(),
    createCheckpoint: vi.fn(),
    restoreCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn(),
    ...overrides,
  };
}

function request(path: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const character = {
  name: "林舟",
  role: "调查员",
  controller: "user" as const,
  description: "收到一封来自雾港的旧信。",
  personality: "谨慎但好奇",
  goals: ["查明寄信人"],
  boundaries: ["不出现血腥细节"],
  attributes: { 力量: 2, 意志: 3 },
  maxHealth: 12,
};

const createInput = {
  title: " 雾港来信 ",
  kind: "roleplay" as const,
  world: {
    name: " 雾港 ",
    premise: "一座只在雨夜出现的港口。",
    tone: "悬疑、克制",
    rules: ["线索不会凭空消失", "线索不会凭空消失"],
    boundaries: ["不把虚构当作现实"],
  },
  initialCharacter: character,
};

describe("GameSession API", () => {
  it("normalizes and creates an isolated session with an initial character", async () => {
    const create = vi.fn().mockResolvedValue({ id: "session-1", version: 1 });
    const now = new Date("2026-09-30T03:00:00.000Z");
    const api = createGameSessionApi(repository({ create }), () => now);

    const response = await api.create(request("/api/v1/game-sessions", "POST", createInput));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(create).toHaveBeenCalledWith({
      ...createInput,
      title: "雾港来信",
      world: {
        ...createInput.world,
        name: "雾港",
        rules: ["线索不会凭空消失"],
      },
      now,
    });
  });

  it("rejects unknown fields and invalid world boundaries", async () => {
    const api = createGameSessionApi(repository());
    const unknown = await api.create(request("/api/v1/game-sessions", "POST", {
      ...createInput,
      conversationId: crypto.randomUUID(),
    }));
    const invalid = await api.create(request("/api/v1/game-sessions", "POST", {
      ...createInput,
      world: { ...createInput.world, boundaries: Array.from({ length: 21 }, (_, index) => `b${index}`) },
    }));

    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.code).toBe("INVALID_REQUEST");
    expect(invalid.status).toBe(400);
  });

  it("maps missing records and version conflicts without exposing internals", async () => {
    const missing = createGameSessionApi(repository({
      get: vi.fn().mockResolvedValue(null),
    }));
    const conflict = createGameSessionApi(repository({
      update: vi.fn().mockRejectedValue(new GameSessionRepositoryError(
        "GAME_SESSION_VERSION_CONFLICT",
        "Game session changed in another client.",
      )),
    }));
    const id = crypto.randomUUID();

    expect((await missing.get(id)).status).toBe(404);
    const response = await conflict.update(id, request("/api/v1/game-sessions/x", "PATCH", {
      title: "雾港",
      kind: "roleplay",
      world: createInput.world,
      expectedVersion: 1,
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("GAME_SESSION_VERSION_CONFLICT");
  });

  it("validates character ownership request versions before repository calls", async () => {
    const createCharacter = vi.fn();
    const api = createGameSessionApi(repository({ createCharacter }));
    const response = await api.createCharacter(
      crypto.randomUUID(),
      request("/characters", "POST", { ...character, expectedSessionVersion: 0 }),
    );
    expect(response.status).toBe(400);
    expect(createCharacter).not.toHaveBeenCalled();
  });
});
