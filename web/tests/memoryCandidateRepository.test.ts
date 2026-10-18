import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createConversationRepository } from "@/lib/repositories/conversationRepository";
import { createMemoryCandidateRepository } from "@/lib/repositories/memoryCandidateRepository";
import { createMemoryCandidateService } from "@/lib/memory/memoryCandidateService";

describe("MemoryCandidateRepository", () => {
  let pglite: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    database = drizzle(pglite, { schema });
  });

  afterEach(async () => pglite.close());

  async function source(content: string, mode: "auto" | "entertainment" = "auto") {
    const conversations = createConversationRepository(database);
    const conversation = await conversations.createConversation({
      title: "记忆测试",
      mode,
    });
    const result = await conversations.appendMessage(conversation.id, {
      parentMessageId: null,
      role: "user",
      content,
      status: "complete",
      model: null,
      citations: [],
    });
    return { conversation, message: result.message };
  }

  it("creates an idempotent pending candidate from a real local user message", async () => {
    const repository = createMemoryCandidateRepository(database);
    const service = createMemoryCandidateService(repository);
    const { conversation, message } = await source("我的长期目标是完成这个作品集");
    const now = new Date("2026-09-27T10:00:00.000Z");
    const first = await service.proposeFromMessage(conversation.id, message.id, now);
    const repeated = await service.proposeFromMessage(conversation.id, message.id, now);

    expect(first).toMatchObject({
      created: true,
      candidate: {
        kind: "goal",
        status: "pending",
        evidenceQuote: "我的长期目标是完成这个作品集",
        version: 1,
      },
    });
    expect(repeated).toMatchObject({ created: false, candidate: { id: first.candidate?.id } });
    await expect(repository.list("pending")).resolves.toHaveLength(1);
  });

  it("atomically confirms edited content before creating formal memory", async () => {
    const repository = createMemoryCandidateRepository(database);
    const service = createMemoryCandidateService(repository);
    const { conversation, message } = await source("我更喜欢通过例题学习数学");
    const proposed = await service.proposeFromMessage(
      conversation.id,
      message.id,
      new Date("2026-09-27T10:00:00.000Z"),
    );
    const resolvedAt = new Date("2026-09-27T10:01:00.000Z");
    const confirmed = await repository.confirm(
      proposed.candidate!.id,
      "我偏好先做例题，再总结数学概念",
      1,
      resolvedAt,
    );
    expect(confirmed).toMatchObject({
      status: "confirmed",
      content: "我偏好先做例题，再总结数学概念",
      version: 2,
      resolvedAt,
    });
    const stored = await database
      .select()
      .from(schema.memoryItems)
      .where(eq(schema.memoryItems.candidateId, confirmed.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      kind: "preference",
      content: "我偏好先做例题，再总结数学概念",
    });
    await expect(
      repository.reject(confirmed.id, 2, new Date()),
    ).rejects.toMatchObject({ code: "MEMORY_CANDIDATE_ALREADY_RESOLVED" });
  });

  it("rejects a candidate without creating formal memory", async () => {
    const repository = createMemoryCandidateRepository(database);
    const service = createMemoryCandidateService(repository);
    const { conversation, message } = await source("我喜欢晚上阅读历史书");
    const proposed = await service.proposeFromMessage(conversation.id, message.id, new Date());
    await expect(
      repository.reject(proposed.candidate!.id, 1, new Date()),
    ).resolves.toMatchObject({ status: "rejected", version: 2 });
    await expect(database.select().from(schema.memoryItems)).resolves.toEqual([]);
  });

  it("returns no candidate for a question", async () => {
    const repository = createMemoryCandidateRepository(database);
    const service = createMemoryCandidateService(repository);
    const { conversation, message } = await source("我应该怎样完成作品集？");
    await expect(
      service.proposeFromMessage(conversation.id, message.id, new Date()),
    ).resolves.toEqual({ candidate: null, created: false });
    await expect(repository.list()).resolves.toEqual([]);
  });

  it("never proposes long-term memory from an entertainment conversation", async () => {
    const repository = createMemoryCandidateRepository(database);
    const service = createMemoryCandidateService(repository);
    const { conversation, message } = await source(
      "请记住：我是雾港的守灯人",
      "entertainment",
    );
    await expect(
      service.proposeFromMessage(conversation.id, message.id, new Date()),
    ).resolves.toEqual({ candidate: null, created: false });
    await expect(repository.list()).resolves.toEqual([]);
  });
});
