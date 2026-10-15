import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  loadMigrations,
  migrateDatabase,
  type MigrationDatabase,
  type MigrationRow,
  type MigrationSession,
} from "@/lib/db/migrations";
import { createMemoryCandidateService } from "@/lib/memory/memoryCandidateService";
import { createConversationRepository, LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { createMemoryCandidateRepository } from "@/lib/repositories/memoryCandidateRepository";
import { createMemoryRepository } from "@/lib/repositories/memoryRepository";
import { createPromptRunRepository } from "@/lib/repositories/promptRunRepository";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

function session(database: Pick<PGlite, "query">): MigrationSession {
  return {
    async execute(query, parameters = []) {
      return (await database.query<MigrationRow>(query, [...parameters])).rows;
    },
  };
}

function migrationDatabase(database: PGlite): MigrationDatabase {
  return {
    ...session(database),
    transaction(callback) {
      return database.transaction((transaction) => callback(session(transaction)));
    },
  };
}

describe("MemoryRepository", () => {
  let pglite: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(migrationDatabase(pglite), await loadMigrations());
    database = drizzle(pglite, { schema });
  });

  afterEach(async () => pglite.close());

  it("fences entertainment, foreign owners and changed/deleted sources before starting a model run", async () => {
    const conversations = createConversationRepository(database);
    const conversation = await conversations.createConversation({ title: "分域边界", mode: "professional" });
    const appended = await conversations.appendMessage(conversation.id, { parentMessageId: null, role: "user", content: "我的长期目标是完成数学学习作品集", status: "complete", model: null, citations: [] });
    const candidates = createMemoryCandidateRepository(database);
    const proposal = await createMemoryCandidateService(candidates).proposeFromMessage(conversation.id, appended.message.id, new Date());
    await candidates.confirm(proposal.candidate!.id, appended.message.content, 1, new Date());
    const memories = createMemoryRepository(database);
    const [item] = await memories.list();
    const selected = await memories.retrieveForMessage(conversation.id, appended.message.id, new Date());
    expect(selected.map((memory) => memory.id)).toEqual([item.id]);

    const foreignId = "99999999-9999-4999-8999-999999999999";
    await database.insert(schema.users).values({ id: foreignId, displayName: "Other user" });
    const [foreignCandidate] = await database.insert(schema.memoryCandidates).values({ userId: foreignId, kind: "goal", content: appended.message.content, evidenceQuote: "not for local user", sensitivity: "low", confidence: 100, reason: "test", status: "confirmed", resolvedAt: new Date() }).returning();
    await database.insert(schema.memoryItems).values({ userId: foreignId, candidateId: foreignCandidate.id, kind: "goal", content: appended.message.content });
    expect((await memories.retrieve(appended.message.content, new Date())).map((memory) => memory.id)).toEqual([item.id]);
    await database.update(schema.conversations).set({ userId: foreignId }).where(eq(schema.conversations.id, conversation.id));
    expect(await memories.retrieveForMessage(conversation.id, appended.message.id, new Date())).toEqual([]);
    await database.update(schema.conversations).set({ userId: LOCAL_USER_ID }).where(eq(schema.conversations.id, conversation.id));

    const detail = await conversations.getConversation(conversation.id);
    await conversations.updateConversation(conversation.id, { mode: "entertainment", expectedVersion: detail!.version });
    expect(await memories.retrieveForMessage(conversation.id, appended.message.id, new Date())).toEqual([]);
    const selectSpy = vi.spyOn(database, "select");
    expect(await memories.retrieve(appended.message.content, new Date(), "game")).toEqual([]);
    expect(selectSpy).not.toHaveBeenCalled();
    selectSpy.mockRestore();
    const runs = createPromptRunRepository(database);
    const envelope = await createTestPromptEnvelope({ conversationId: conversation.id, activeLeafId: appended.message.id, createdAt: new Date().toISOString() });
    await expect(runs.start(envelope, selected)).rejects.toMatchObject({ code: "PROMPT_CONTEXT_CONFLICT" });
    expect(await database.select().from(schema.promptRuns)).toEqual([]);
    expect(await database.select().from(schema.memoryUsages)).toEqual([]);

    await database.update(schema.conversations).set({ mode: "professional" }).where(eq(schema.conversations.id, conversation.id));
    const updated = await memories.update({ id: item.id, content: item.content, kind: item.kind, pinned: true, validUntil: null, expectedVersion: item.version, now: new Date() });
    await expect(runs.start(envelope, selected)).rejects.toMatchObject({ code: "PROMPT_CONTEXT_CONFLICT" });
    expect(await database.select().from(schema.promptRuns)).toEqual([]);
    const current = await memories.retrieveForMessage(conversation.id, appended.message.id, new Date());
    await memories.delete(item.id, updated.version);
    await expect(runs.start(envelope, current)).rejects.toMatchObject({ code: "PROMPT_CONTEXT_CONFLICT" });
    expect(await database.select().from(schema.promptRuns)).toEqual([]);
    expect(await database.select().from(schema.memoryUsages)).toEqual([]);
    expect(await memories.retrieveForMessage(conversation.id, appended.message.id, new Date())).toEqual([]);
  });

  it("manages, retrieves and atomically audits confirmed memory usage", async () => {
    const conversations = createConversationRepository(database);
    const conversation = await conversations.createConversation({ title: "记忆检索", mode: "auto" });
    const appended = await conversations.appendMessage(conversation.id, {
      parentMessageId: null,
      role: "user",
      content: "我的长期目标是完成数学学习作品集",
      status: "complete",
      model: null,
      citations: [],
    });
    const candidates = createMemoryCandidateRepository(database);
    const proposal = await createMemoryCandidateService(candidates).proposeFromMessage(
      conversation.id,
      appended.message.id,
      new Date("2026-09-28T08:00:00.000Z"),
    );
    await candidates.confirm(
      proposal.candidate!.id,
      "我的长期目标是完成数学学习作品集",
      1,
      new Date("2026-09-28T08:01:00.000Z"),
    );

    const memories = createMemoryRepository(database);
    const [created] = await memories.list();
    expect(created).toMatchObject({ sensitivity: "low", pinned: false, useCount: 0 });

    const updated = await memories.update({
      id: created.id,
      content: "我的长期目标是完成数学作品集并公开展示",
      kind: "goal",
      pinned: true,
      validUntil: new Date("2027-01-01T00:00:00.000Z"),
      expectedVersion: 1,
      now: new Date("2026-09-28T08:02:00.000Z"),
    });
    expect(updated).toMatchObject({ pinned: true, version: 2 });

    const selected = await memories.retrieveForMessage(
      conversation.id,
      appended.message.id,
      new Date("2026-09-28T08:03:00.000Z"),
    );
    expect(selected).toHaveLength(1);

    const envelope = await createTestPromptEnvelope({
      conversationId: conversation.id,
      activeLeafId: appended.message.id,
    });
    await createPromptRunRepository(database).start(envelope, selected);
    const usages = await database.select().from(schema.memoryUsages);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      memoryItemId: created.id,
      promptRunId: envelope.runId,
      rank: 1,
    });
    const [used] = await database
      .select()
      .from(schema.memoryItems)
      .where(eq(schema.memoryItems.id, created.id));
    expect(used.useCount).toBe(1);
    expect(used.lastUsedAt).toEqual(new Date(envelope.createdAt));

    const expired = await memories.update({
      id: used.id,
      content: used.content,
      kind: used.kind,
      pinned: used.pinned,
      validUntil: new Date("2026-09-28T08:00:00.000Z"),
      expectedVersion: used.version,
      now: new Date("2026-09-28T08:04:00.000Z"),
    });
    await expect(
      memories.retrieve("数学作品集", new Date("2026-09-28T08:05:00.000Z")),
    ).resolves.toEqual([]);
    await memories.delete(expired.id, expired.version);
    await expect(memories.list()).resolves.toEqual([]);
    await expect(database.select().from(schema.memoryUsages)).resolves.toHaveLength(1);
  });
});
