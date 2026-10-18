import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { encryptApiKey, decryptApiKey } from "@/lib/ai/server/credentialCipher";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { FOG_HARBOR_PRESET } from "@/lib/game/exploration/templates/fog-harbor/public";
import { createActionRepository } from "@/lib/repositories/actionRepository";
import { createConversationRepository } from "@/lib/repositories/conversationRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createInboxRepository } from "@/lib/repositories/inboxRepository";
import { createKnowledgeRepository } from "@/lib/repositories/knowledgeRepository";
import { createKnowledgeRetrievalRepository } from "@/lib/repositories/knowledgeRetrievalRepository";
import { createMemoryCandidateRepository } from "@/lib/repositories/memoryCandidateRepository";
import { createMemoryRepository } from "@/lib/repositories/memoryRepository";
import { createModelCredentialRepository } from "@/lib/repositories/modelCredentialRepository";
import { createSchedulerRepository } from "@/lib/repositories/schedulerRepository";
import { createTaskRepository } from "@/lib/repositories/taskRepository";
import { createMemoryCandidateService } from "@/lib/memory/memoryCandidateService";
import { runReminderBatch } from "@/lib/tasks/reminderWorker";
import { createPgliteMigrationDatabase } from "./helpers/pglite";

it("cold-reopens canonical persisted data across modules without import fallbacks or duplicate reminders", async () => {
  const now = new Date("2030-01-02T08:00:00Z");
  const network = vi.fn(() => { throw new Error("No network in release acceptance"); });
  const generation = vi.fn(async () => { throw new Error("No model in release acceptance"); });
  vi.stubGlobal("fetch", network);
  let pg: PGlite | null = new PGlite();
  const open = (client: PGlite) => {
    const db = drizzle(client, { schema });
    return {
      db, conversations: createConversationRepository(db), tasks: createTaskRepository(db),
      inbox: createInboxRepository(db), actions: createActionRepository(db),
      games: createGameSessionRepository(db), knowledge: createKnowledgeRepository(db),
      memories: createMemoryRepository(db), credentials: createModelCredentialRepository(db),
      batch: () => runReminderBatch({ scheduler: createSchedulerRepository(db), inbox: createInboxRepository(db),
        agent: { generate: generation }, briefing: { generate: generation }, books: { generate: generation }, now: () => now,
      }, { workerId: "release-acceptance", batchSize: 10, leaseDurationMs: 60_000 }),
    };
  };
  try {
    const migrations = await loadMigrations();
    await migrateDatabase(createPgliteMigrationDatabase(pg), migrations);
    let current = open(pg);
    const conversation = await current.conversations.createConversation({ title: "合成封版存档", mode: "professional" });
    const append = (parentMessageId: string | null, role: "user" | "assistant", content: string) =>
      current.conversations.appendMessage(conversation.id, { parentMessageId, role, content, model: null, status: "complete", citations: [] });
    const root = await append(null, "user", "我的长期目标是完成数学学习作品集");
    const answer = await append(root.message.id, "assistant", "先整理材料，再验证结论。");
    const followup = await append(answer.message.id, "user", "解释矩阵乘法。");
    const continuation = await append(followup.message.id, "assistant", "矩阵乘法需要按行列计算。");
    const regenerated = await append(root.message.id, "assistant", "这是从较早节点重新生成的分支。");
    const candidates = createMemoryCandidateRepository(current.db);
    const proposal = await createMemoryCandidateService(candidates).proposeFromMessage(conversation.id, root.message.id, now);
    expect(proposal.candidate).not.toBeNull();
    await candidates.confirm(proposal.candidate!.id, root.message.content, 1, now);
    const collection = await current.knowledge.createCollection({ title: "合成数学材料", description: "", module: "professional" });
    const document = await current.knowledge.saveDocument(collection.id, {
      title: "矩阵乘法", sourceKey: "matrix", content: "矩阵乘法需要按行列计算。", format: "text", sourceUrl: "", fileName: "",
    });
    const task = await current.tasks.create({ title: "合成提醒", prompt: "整理材料", scheduleType: "once",
      scheduleValue: { runAt: now.toISOString() }, timezone: "Asia/Shanghai", nextRunAt: now });
    expect(await current.batch()).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    const action = await current.actions.mutate({ operation: "create", mutationId: crypto.randomUUID(), data: {
      kind: "todo", title: "合成行动", note: "", startsOn: "2030-01-02", dueOn: null, status: "active",
      goalId: null, completedOn: null, rules: [], linkedTaskId: null,
    } }, now);
    await current.actions.mutate({ operation: "record", mutationId: crypto.randomUUID(), id: action.id,
      expectedVersion: action.version, day: "2030-01-02", value: 1, state: "done", note: "合成完成" }, now);
    const key = Buffer.alloc(32, 7); // Synthetic key, never read the host credential environment.
    const savedCredential = await current.credentials.save({ provider: "synthetic-provider", baseUrl: "https://example.test",
      model: "synthetic-model", encryptedApiKey: encryptApiKey("synthetic-key-not-for-network", key), apiKeyHint: "test", encryptionKeyVersion: 1 });
    let game = await current.games.create({ ...FOG_HARBOR_PRESET, now });
    game = await current.games.updateStatus(game.id, { status: "active", expectedVersion: game.version, now });
    game = await createGameTurnService(current.games, { generate: generation }).create(game.id, {
      content: "开始合成探索", parentTurnId: null, expectedVersion: game.version, requestId: crypto.randomUUID(),
      diceRequests: [], checkRequest: null, narrate: false,
      explorationAction: { action: "start", templateId: "fog-harbor", templateVersion: "1.0.0" },
    });
    game = await current.games.createCheckpoint(game.id, { name: "合成检查点", note: "", expectedVersion: game.version, now });
    const before = {
      conversation: await current.conversations.getConversation(conversation.id), task: await current.tasks.get(task.id),
      inbox: await current.inbox.list(), actions: await current.actions.read("2030-01-01", "2030-01-03", now),
      memories: await current.memories.list(), document: await current.knowledge.getDocument(document.id),
    };
    expect(before.conversation?.activeLeafMessageId).toBe(regenerated.message.id);
    expect(before.task?.status).toBe("completed");
    expect(before.inbox).toHaveLength(1);
    expect(before.memories).toHaveLength(1);

    // An actual engine close/reopen, not just a second Repository around the same connection.
    // This is a synthetic current-format fixture, not a dump of the user's database.
    const snapshot = await pg.dumpDataDir();
    await pg.close();
    pg = null;
    pg = new PGlite({ loadDataDir: snapshot });
    expect(await migrateDatabase(createPgliteMigrationDatabase(pg), migrations)).toEqual([]);
    current = open(pg);
    expect(await current.conversations.getConversation(conversation.id)).toEqual(before.conversation);
    expect(before.conversation?.messages.map((message) => message.id)).toContain(continuation.message.id);
    expect(await current.tasks.get(task.id)).toEqual(before.task);
    expect(await current.inbox.list()).toEqual(before.inbox);
    expect(await current.actions.read("2030-01-01", "2030-01-03", now)).toEqual(before.actions);
    expect(await current.memories.list()).toEqual(before.memories);
    expect(await current.knowledge.getDocument(document.id)).toEqual(before.document);
    expect(await current.games.get(game.id)).toEqual(game);
    const credential = await current.credentials.get();
    expect(credential).toEqual(savedCredential);
    expect(decryptApiKey(credential!.encryptedApiKey, key)).toBe("synthetic-key-not-for-network");
    const found = await createKnowledgeRetrievalRepository(current.db).search({ consumer: "professional", collectionIds: [collection.id], query: "矩阵乘法" });
    expect(found.hits.some((hit) => hit.documentId === document.id)).toBe(true);
    expect(await current.batch()).toMatchObject({ claimed: 0, completed: 0 });
    expect(await current.inbox.list()).toEqual(before.inbox);
    await expect(current.conversations.updateConversation(conversation.id, { title: "过期写入", expectedVersion: conversation.version }))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await current.conversations.getConversation(conversation.id)).toEqual(before.conversation);
    expect(generation).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  } finally {
    try { await pg?.close(); } finally { vi.unstubAllGlobals(); }
  }
}, 20_000);
