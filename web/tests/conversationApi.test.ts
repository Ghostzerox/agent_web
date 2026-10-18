import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConversationApi } from "@/lib/api/conversationApi";
import { verifyResponse } from "@/lib/ai/responseVerifier";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import * as schema from "@/lib/db/schema";
import { createConversationRepository } from "@/lib/repositories/conversationRepository";

function jsonRequest(path: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Conversation API", () => {
  let pglite: PGlite;
  let api: ReturnType<typeof createConversationApi>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(
      createPgliteMigrationDatabase(pglite),
      await loadMigrations(),
    );
    api = createConversationApi(
      createConversationRepository(drizzle(pglite, { schema })),
    );
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("creates, lists, reads and deletes a server conversation", async () => {
    const createResponse = await api.create(
      jsonRequest("/api/v1/conversations", "POST", {
        title: "跨设备数据",
        mode: "companion",
      }),
    );
    const createBody = await createResponse.json();
    const id = createBody.data.id as string;

    expect(createResponse.status).toBe(201);
    expect(createResponse.headers.get("location")).toBe(
      `/api/v1/conversations/${id}`,
    );
    expect(createResponse.headers.get("x-request-id")).toMatch(
      /^[0-9a-f-]{36}$/,
    );

    const listResponse = await api.list();
    const listBody = await listResponse.json();
    expect(listBody.data).toHaveLength(1);

    const getResponse = await api.get(id);
    const getBody = await getResponse.json();
    expect(getBody.data).toMatchObject({
      id,
      title: "跨设备数据",
      mode: "companion",
      messages: [],
    });
    expect(getBody.data.createdAt).toMatch(/Z$/);

    const updateResponse = await api.update(
      id,
      jsonRequest(`/api/v1/conversations/${id}`, "PATCH", {
        title: "持久化标题",
        mode: "entertainment",
        expectedVersion: createBody.data.version,
      }),
    );
    const updated = (await updateResponse.json()).data;
    expect(updated).toMatchObject({
      title: "持久化标题",
      mode: "entertainment",
      version: 2,
    });

    const staleUpdate = await api.update(
      id,
      jsonRequest(`/api/v1/conversations/${id}`, "PATCH", {
        mode: "professional",
        expectedVersion: createBody.data.version,
      }),
    );
    expect(staleUpdate.status).toBe(409);

    const deleteResponse = await api.delete(id);
    expect(deleteResponse.status).toBe(204);
    expect((await api.get(id)).status).toBe(404);
  });

  it("appends messages and reports version conflicts with the stable error shape", async () => {
    const created = await api.create(
      jsonRequest("/api/v1/conversations", "POST", { title: "树形 API" }),
    );
    const conversation = (await created.json()).data;

    const appendResponse = await api.appendMessage(
      conversation.id,
      jsonRequest(
        `/api/v1/conversations/${conversation.id}/messages`,
        "POST",
        { role: "user", content: "服务端消息" },
      ),
    );
    const appendBody = await appendResponse.json();
    expect(appendResponse.status).toBe(201);
    expect(appendBody.data.message).toMatchObject({
      parentMessageId: null,
      content: "服务端消息",
      status: "complete",
    });

    const verification = verifyResponse({
      answer: "服务端回答",
      query: "服务端消息",
      retrieval: {
        status: "skipped",
        reason: "not-needed",
        query: "服务端消息",
        citations: [],
      },
      checkedAt: "2026-09-26T00:00:00.000Z",
    });
    const assistantResponse = await api.appendMessage(
      conversation.id,
      jsonRequest(
        `/api/v1/conversations/${conversation.id}/messages`,
        "POST",
        {
          parentMessageId: appendBody.data.message.id,
          role: "assistant",
          content: "服务端回答",
          verification,
        },
      ),
    );
    expect(assistantResponse.status).toBe(201);
    expect((await assistantResponse.json()).data.message.verification).toEqual(
      verification,
    );

    const invalidUserVerification = await api.appendMessage(
      conversation.id,
      jsonRequest(
        `/api/v1/conversations/${conversation.id}/messages`,
        "POST",
        { role: "user", content: "伪造检查", verification },
      ),
    );
    expect(invalidUserVerification.status).toBe(400);

    const conflictResponse = await api.setActiveLeaf(
      conversation.id,
      jsonRequest(
        `/api/v1/conversations/${conversation.id}/active-leaf`,
        "PATCH",
        {
          messageId: appendBody.data.message.id,
          expectedVersion: conversation.version,
        },
      ),
    );
    const conflictBody = await conflictResponse.json();
    expect(conflictResponse.status).toBe(409);
    expect(conflictBody.error).toMatchObject({
      code: "VERSION_CONFLICT",
      retryable: false,
    });
    expect(conflictBody.error.requestId).toBe(
      conflictResponse.headers.get("x-request-id"),
    );
  });

  it("rejects malformed input without exposing implementation errors", async () => {
    const invalidBody = await api.create(
      jsonRequest("/api/v1/conversations", "POST", {
        title: "",
        unexpected: true,
      }),
    );
    const invalidId = await api.get("not-a-uuid");
    const emptyUpdate = await api.update(
      crypto.randomUUID(),
      jsonRequest("/api/v1/conversations/unused", "PATCH", {
        expectedVersion: 1,
      }),
    );
    const invalidMode = await api.update(
      crypto.randomUUID(),
      jsonRequest("/api/v1/conversations/unused", "PATCH", {
        mode: "unregistered-mode",
        expectedVersion: 1,
      }),
    );
    const invalidBodyJson = await invalidBody.json();
    const invalidIdJson = await invalidId.json();

    expect(invalidBody.status).toBe(400);
    expect(invalidBodyJson.error).toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(invalidBodyJson.error.details).toBeInstanceOf(Array);
    expect(invalidId.status).toBe(400);
    expect(invalidIdJson.error.code).toBe("INVALID_REQUEST");
    expect(emptyUpdate.status).toBe(400);
    expect(invalidMode.status).toBe(400);
  });

  it("keeps the API error contract when database initialization fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unavailableApi = createConversationApi(() => {
      throw new Error("database connection details must stay private");
    });

    const response = await unavailableApi.list();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "The server could not complete the request.",
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("connection details");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
