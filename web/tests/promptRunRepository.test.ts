import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPromptExportApi } from "@/lib/api/promptExportApi";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import * as schema from "@/lib/db/schema";
import { createConversationRepository } from "@/lib/repositories/conversationRepository";
import { createPromptRunRepository } from "@/lib/repositories/promptRunRepository";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

describe("PromptRunRepository and export API", () => {
  let pglite: PGlite;
  let conversations: ReturnType<typeof createConversationRepository>;
  let runs: ReturnType<typeof createPromptRunRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    const database = drizzle(pglite, { schema });
    conversations = createConversationRepository(database);
    runs = createPromptRunRepository(database);
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("stores audit metadata without storing Prompt content", async () => {
    const conversation = await conversations.createConversation({
      title: "审计会话",
      mode: "professional",
    });
    const envelope = await createTestPromptEnvelope({
      conversationId: conversation.id,
      activeLeafId: null,
    });

    const started = await runs.start(envelope);
    expect(started).toMatchObject({
      id: envelope.runId,
      conversationId: conversation.id,
      contentHash: envelope.integrity.contentHash,
      status: "started",
      containsMemory: true,
    });
    expect(JSON.stringify(started)).not.toContain("先看例子");

    const completed = await runs.finish(envelope.runId, "completed");
    expect(completed).toMatchObject({ status: "completed", errorCode: null });
    expect(completed?.completedAt).toBeInstanceOf(Date);

    const message = await conversations.appendMessage(conversation.id, {
      parentMessageId: null,
      role: "user",
      content: "新分支",
      status: "complete",
      model: null,
      citations: [],
    });
    const retryEnvelope = await createTestPromptEnvelope({
      runId: "55555555-5555-4555-8555-555555555555",
      conversationId: conversation.id,
      activeLeafId: message.message.id,
      trigger: "retry",
    });
    await expect(runs.start(retryEnvelope)).resolves.toMatchObject({
      trigger: "retry",
      activeLeafMessageId: message.message.id,
    });

    const staleEnvelope = await createTestPromptEnvelope({
      runId: "44444444-4444-4444-8444-444444444444",
      conversationId: conversation.id,
      activeLeafId: null,
    });
    await expect(runs.start(staleEnvelope)).rejects.toMatchObject({
      code: "PROMPT_CONTEXT_CONFLICT",
    });

    await conversations.deleteConversation(conversation.id);
    await expect(runs.get(envelope.runId)).resolves.toBeNull();
    expect(message.message.content).toBe("新分支");
  });

  it("exports only an intact envelope backed by its audit record", async () => {
    const conversation = await conversations.createConversation({
      title: "导出会话",
      mode: "auto",
    });
    const envelope = await createTestPromptEnvelope({
      conversationId: conversation.id,
      activeLeafId: null,
    });
    await runs.start(envelope);
    const api = createPromptExportApi(runs);

    const response = await api.create(
      new Request("http://localhost/api/v1/model/prompt-export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ envelope, format: "json", includeMemory: false }),
      }),
    );
    const artifact = (await response.json()).data;
    const document = JSON.parse(artifact.content);
    expect(response.status).toBe(200);
    expect(document.integrity.auditContentHash).toBe(
      envelope.integrity.contentHash,
    );
    expect(document.privacy.exactRequestContent).toBe(false);
    expect(artifact.content).not.toContain("先看例子");

    const tampered = structuredClone(envelope);
    tampered.promptLayers[0].content = "篡改策略";
    const rejected = await api.create(
      new Request("http://localhost/api/v1/model/prompt-export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          envelope: tampered,
          format: "markdown",
          includeMemory: true,
        }),
      }),
    );
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error.code).toBe(
      "PROMPT_ENVELOPE_MISMATCH",
    );
  });
});
