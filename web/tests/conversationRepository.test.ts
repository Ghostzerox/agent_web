import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import {
  createConversationRepository,
  LOCAL_USER_ID,
  type ConversationRepositoryPort,
} from "@/lib/repositories/conversationRepository";

describe("ConversationRepository", () => {
  let pglite: PGlite;
  let repository: ConversationRepositoryPort;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(
      createPgliteMigrationDatabase(pglite),
      await loadMigrations(),
    );
    repository = createConversationRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("persists a conversation tree across repository instances", async () => {
    const conversation = await repository.createConversation({
      title: "服务端会话",
      mode: "professional",
    });
    const root = await repository.appendMessage(conversation.id, {
      parentMessageId: null,
      role: "user",
      content: "解释事务",
      status: "complete",
      model: null,
      citations: [],
    });
    const firstAnswer = await repository.appendMessage(conversation.id, {
      parentMessageId: root.message.id,
      role: "assistant",
      content: "第一种解释",
      status: "complete",
      model: "test-model",
      citations: [{ title: "PostgreSQL", url: "https://postgresql.org" }],
    });
    const secondAnswer = await repository.appendMessage(conversation.id, {
      parentMessageId: root.message.id,
      role: "assistant",
      content: "重新生成的解释",
      status: "complete",
      model: "test-model",
      citations: [],
    });
    const updated = await repository.updateConversation(conversation.id, {
      title: "保留树的娱乐会话",
      mode: "entertainment",
      expectedVersion: secondAnswer.conversation.version,
    });

    const refreshedRepository = createConversationRepository(
      drizzle(pglite, { schema }),
    );
    const detail = await refreshedRepository.getConversation(conversation.id);
    const list = await refreshedRepository.listConversations();

    expect(detail?.userId).toBe(LOCAL_USER_ID);
    expect(detail).toMatchObject({
      title: "保留树的娱乐会话",
      mode: "entertainment",
      version: updated.version,
    });
    expect(detail?.activeLeafMessageId).toBe(secondAnswer.message.id);
    expect(detail?.messages).toHaveLength(3);
    expect(
      detail?.messages
        .filter((message) => message.parentMessageId === root.message.id)
        .map((message) => message.id),
    ).toEqual([firstAnswer.message.id, secondAnswer.message.id]);
    expect(list.map((item) => item.id)).toEqual([conversation.id]);

    await expect(
      refreshedRepository.updateConversation(conversation.id, {
        mode: "companion",
        expectedVersion: secondAnswer.conversation.version,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const users = await pglite.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM users",
    );
    expect(users.rows[0].count).toBe(1);
  });

  it("rejects a parent from another conversation and rolls back the append", async () => {
    const first = await repository.createConversation({
      title: "第一段会话",
      mode: "auto",
    });
    const second = await repository.createConversation({
      title: "第二段会话",
      mode: "auto",
    });
    const foreignMessage = await repository.appendMessage(first.id, {
      parentMessageId: null,
      role: "user",
      content: "来自第一段会话",
      status: "complete",
      model: null,
      citations: [],
    });

    await expect(
      repository.appendMessage(second.id, {
        parentMessageId: foreignMessage.message.id,
        role: "assistant",
        content: "不应写入",
        status: "complete",
        model: null,
        citations: [],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_MESSAGE_PARENT",
    });

    const secondAfterFailure = await repository.getConversation(second.id);
    expect(secondAfterFailure?.messages).toEqual([]);
    expect(secondAfterFailure?.version).toBe(second.version);
  });

  it("switches the active branch with optimistic locking and cascades delete", async () => {
    const conversation = await repository.createConversation({
      title: "分支切换",
      mode: "reflection",
    });
    const root = await repository.appendMessage(conversation.id, {
      parentMessageId: null,
      role: "user",
      content: "问题",
      status: "complete",
      model: null,
      citations: [],
    });
    const answer = await repository.appendMessage(conversation.id, {
      parentMessageId: root.message.id,
      role: "assistant",
      content: "回答",
      status: "complete",
      model: null,
      citations: [],
    });
    const alternativeAnswer = await repository.appendMessage(conversation.id, {
      parentMessageId: root.message.id,
      role: "assistant",
      content: "另一个回答",
      status: "complete",
      model: null,
      citations: [],
    });

    const switched = await repository.setActiveLeaf(
      conversation.id,
      answer.message.id,
      alternativeAnswer.conversation.version,
    );
    expect(switched.activeLeafMessageId).toBe(answer.message.id);

    await expect(
      repository.setActiveLeaf(
        conversation.id,
        root.message.id,
        switched.version,
      ),
    ).rejects.toMatchObject({ code: "INVALID_ACTIVE_LEAF" });

    await expect(
      repository.setActiveLeaf(conversation.id, null, switched.version),
    ).rejects.toMatchObject({ code: "INVALID_ACTIVE_LEAF" });

    await expect(
      repository.setActiveLeaf(
        conversation.id,
        alternativeAnswer.message.id,
        alternativeAnswer.conversation.version,
      ),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });

    await expect(repository.deleteConversation(conversation.id)).resolves.toBe(
      true,
    );
    await expect(repository.getConversation(conversation.id)).resolves.toBeNull();
    const remainingMessages = await pglite.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM messages",
    );
    expect(remainingMessages.rows[0].count).toBe(0);
  });
});
