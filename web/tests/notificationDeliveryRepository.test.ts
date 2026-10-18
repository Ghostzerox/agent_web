import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import {
  createNotificationDeliveryRepository,
  NotificationDeliveryRepositoryError,
} from "@/lib/repositories/notificationDeliveryRepository";
import { createNotificationRepository } from "@/lib/repositories/notificationRepository";

describe("NotificationDeliveryRepository", () => {
  let pglite: PGlite;
  let deliveries: ReturnType<typeof createNotificationDeliveryRepository>;
  let notifications: ReturnType<typeof createNotificationRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    const database = drizzle(pglite, { schema });
    deliveries = createNotificationDeliveryRepository(database);
    notifications = createNotificationRepository(database);
    const preferences = await notifications.getPreferences();
    await notifications.updatePreferences({
      pushEnabled: true,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
      expectedVersion: preferences.version,
      now: new Date("2026-09-12T01:00:00.000Z"),
    });
    await notifications.saveSubscription({
      provider: "web-push",
      endpointHash: "endpoint-hash",
      encryptedSubscription: "encrypted-subscription",
      deviceLabel: "Test browser",
      expiresAt: null,
    });
  });

  afterEach(async () => {
    await pglite.close();
  });

  async function createInboxItem(suffix: string) {
    const task = await pglite.query<{ id: string }>(
      `INSERT INTO scheduled_tasks (
         user_id, title, schedule_type, schedule_value, next_run_at
       ) VALUES ($1, $2, 'once', $3, $4)
       RETURNING id`,
      [
        LOCAL_USER_ID,
        `Task ${suffix}`,
        JSON.stringify({ runAt: "2030-01-01T00:00:00.000Z" }),
        "2030-01-01T00:00:00.000Z",
      ],
    );
    const run = await pglite.query<{ id: string }>(
      `INSERT INTO task_runs (task_id, scheduled_for, status)
       VALUES ($1, $2, 'succeeded') RETURNING id`,
      [task.rows[0].id, "2030-01-01T00:00:00.000Z"],
    );
    const inbox = await pglite.query<{ id: string }>(
      `INSERT INTO inbox_items (
         user_id, task_id, task_run_id, title, body, occurred_at
       ) VALUES ($1, $2, $3, $4, 'Private body', $5)
       RETURNING id`,
      [
        LOCAL_USER_ID,
        task.rows[0].id,
        run.rows[0].id,
        `Reminder ${suffix}`,
        "2030-01-01T00:00:00.000Z",
      ],
    );
    return { taskId: task.rows[0].id, runId: run.rows[0].id, inboxId: inbox.rows[0].id };
  }

  it("plans one delivery per device and respects overnight quiet hours", async () => {
    const source = await createInboxItem("quiet");
    const now = new Date("2026-09-12T15:00:00.000Z");
    await expect(deliveries.planInboxDeliveries(now)).resolves.toEqual({
      inboxItems: 1,
      deliveries: 1,
    });
    await expect(deliveries.planInboxDeliveries(now)).resolves.toEqual({
      inboxItems: 0,
      deliveries: 0,
    });
    await expect(
      deliveries.claimAvailableDeliveries({
        workerId: "worker-a",
        now: new Date("2026-09-12T23:59:00.000Z"),
        leaseDurationMs: 60_000,
        limit: 20,
      }),
    ).resolves.toEqual([]);
    const [claim] = await deliveries.claimAvailableDeliveries({
      workerId: "worker-a",
      now: new Date("2026-09-13T00:00:00.000Z"),
      leaseDurationMs: 60_000,
      limit: 20,
    });
    expect(claim).toMatchObject({
      delivery: { attempt: 1, status: "sending" },
      inboxItem: { id: source.inboxId },
      preferences: { pushEnabled: true },
    });
    const sent = await deliveries.finishDelivery({
      deliveryId: claim.delivery.id,
      workerId: "worker-a",
      expectedAttempt: 1,
      now: new Date("2026-09-13T00:00:01.000Z"),
      outcome: { status: "sent" },
    });
    expect(sent).toMatchObject({ status: "sent", sentAt: expect.any(Date) });
    const run = await pglite.query<{ notified_at: Date | null }>(
      `SELECT notified_at FROM task_runs WHERE id = $1`,
      [source.runId],
    );
    expect(run.rows[0].notified_at).not.toBeNull();
  });

  it("does not replay Inbox items created before this device subscribed", async () => {
    const source = await createInboxItem("historical");
    await pglite.query(
      `UPDATE inbox_items SET created_at = $1 WHERE id = $2`,
      ["2020-01-01T00:00:00.000Z", source.inboxId],
    );
    await expect(
      deliveries.planInboxDeliveries(new Date("2026-09-13T04:00:00.000Z")),
    ).resolves.toEqual({ inboxItems: 1, deliveries: 0 });
    const rows = await pglite.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM notification_deliveries`,
    );
    expect(rows.rows[0].count).toBe(0);
  });

  it("retries transient failures and fences stale delivery attempts", async () => {
    await createInboxItem("retry");
    const due = new Date("2026-09-13T04:00:00.000Z");
    await deliveries.planInboxDeliveries(due);
    const [first] = await deliveries.claimAvailableDeliveries({
      workerId: "worker-a",
      now: due,
      leaseDurationMs: 60_000,
      limit: 20,
    });
    const retry = await deliveries.finishDelivery({
      deliveryId: first.delivery.id,
      workerId: "worker-a",
      expectedAttempt: 1,
      now: new Date("2026-09-13T04:00:01.000Z"),
      outcome: { status: "failed", errorCode: "PUSH_HTTP_503", retryable: true },
    });
    expect(retry).toMatchObject({
      status: "pending",
      attempt: 1,
      errorCode: "PUSH_HTTP_503",
    });
    expect(retry.availableAt.toISOString()).toBe("2026-09-13T04:05:01.000Z");

    const [second] = await deliveries.claimAvailableDeliveries({
      workerId: "worker-b",
      now: new Date("2026-09-13T04:05:01.000Z"),
      leaseDurationMs: 60_000,
      limit: 20,
    });
    expect(second.delivery.attempt).toBe(2);
    await expect(
      deliveries.finishDelivery({
        deliveryId: second.delivery.id,
        workerId: "worker-a",
        expectedAttempt: 1,
        now: new Date("2026-09-13T04:05:02.000Z"),
        outcome: { status: "sent" },
      }),
    ).rejects.toMatchObject({
      code: "DELIVERY_LEASE_LOST",
    } satisfies Partial<NotificationDeliveryRepositoryError>);
  });

  it("expires a dead endpoint and cancels its remaining deliveries", async () => {
    await createInboxItem("expired-one");
    await createInboxItem("expired-two");
    const now = new Date("2026-09-13T04:00:00.000Z");
    await deliveries.planInboxDeliveries(now);
    const [claim] = await deliveries.claimAvailableDeliveries({
      workerId: "worker-a",
      now,
      leaseDurationMs: 60_000,
      limit: 1,
    });
    const cancelled = await deliveries.finishDelivery({
      deliveryId: claim.delivery.id,
      workerId: "worker-a",
      expectedAttempt: 1,
      now: new Date("2026-09-13T04:00:01.000Z"),
      outcome: { status: "expired" },
    });
    expect(cancelled.status).toBe("cancelled");
    const states = await pglite.query<{ status: string }>(
      `SELECT status FROM notification_deliveries ORDER BY id`,
    );
    expect(states.rows.map((row) => row.status)).toEqual(["cancelled", "cancelled"]);
    expect((await notifications.listSubscriptions())[0].status).toBe("expired");
  });
});
