import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { createProactivityRepository } from "@/lib/repositories/proactivityRepository";

describe("ProactivityRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createProactivityRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    repository = createProactivityRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("defaults off and atomically creates one explainable check-in", async () => {
    const initial = await repository.getDashboard();
    expect(initial.preferences).toMatchObject({
      enabled: false,
      maxMessagesPerDay: 1,
      minCooldownHours: 72,
      checkinAfterDays: 3,
      allowedReasons: ["goal_followup", "checkin"],
      version: 1,
    });

    const now = new Date("2026-09-28T04:00:00.000Z");
    await repository.update({
      enabled: true,
      maxMessagesPerDay: 1,
      minCooldownHours: 24,
      checkinAfterDays: 1,
      allowedReasons: ["checkin"],
      pausedUntil: null,
      expectedVersion: 1,
      now,
    });
    const conversation = await pglite.query<{ id: string }>(
      `INSERT INTO conversations (user_id, title) VALUES ($1, '旧对话') RETURNING id`,
      [LOCAL_USER_ID],
    );
    await pglite.query(
      `INSERT INTO messages (conversation_id, role, content, created_at)
       VALUES ($1, 'user', '你好', '2026-09-26T00:00:00Z')`,
      [conversation.rows[0].id],
    );

    const created = await repository.evaluate(now);
    expect(created).toMatchObject({
      status: "created",
      reason: "checkin",
      rationale: expect.stringContaining("主动开启"),
    });
    if (created.status !== "created") throw new Error("Expected a contact.");
    const inbox = await pglite.query<{
      source: string;
      proactivity_reason: string;
      proactivity_rationale: string;
      body: string;
    }>(`SELECT source, proactivity_reason, proactivity_rationale, body
        FROM inbox_items WHERE id = $1`, [created.inboxItemId]);
    expect(inbox.rows[0]).toMatchObject({
      source: "proactive_checkin",
      proactivity_reason: "checkin",
      proactivity_rationale: expect.stringContaining("主动开启"),
      body: expect.stringContaining("不想回应也完全没关系"),
    });
    await expect(repository.evaluate(new Date("2026-09-28T04:01:00.000Z")))
      .resolves.toEqual({ status: "skipped", code: "unread_pending" });

    const dashboard = await repository.getDashboard();
    expect(dashboard.recentContacts).toHaveLength(1);
    expect(dashboard.recentContacts[0]).toMatchObject({
      inboxItemId: created.inboxItemId,
      inboxStatus: "unread",
    });
  });

  it("enforces optimistic preference updates", async () => {
    await repository.getDashboard();
    const update = {
      enabled: false,
      maxMessagesPerDay: 1,
      minCooldownHours: 72,
      checkinAfterDays: 3,
      allowedReasons: ["goal_followup" as const],
      pausedUntil: null,
      expectedVersion: 1,
      now: new Date("2026-09-28T04:00:00.000Z"),
    };
    await repository.update(update);
    await expect(repository.update(update)).rejects.toMatchObject({
      code: "PROACTIVITY_PREFERENCE_VERSION_CONFLICT",
    });
  });
});
