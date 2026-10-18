import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createPushConfigurationService } from "@/lib/notifications/pushConfigurationService";
import {
  createNotificationRepository,
  NotificationRepositoryError,
} from "@/lib/repositories/notificationRepository";

describe("NotificationRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createNotificationRepository>;

  beforeEach(async () => {
    vi.stubEnv("CREDENTIAL_MASTER_KEY", randomBytes(32).toString("base64url"));
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    repository = createNotificationRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await pglite.close();
  });

  it("creates one encrypted VAPID configuration and public state", async () => {
    const service = createPushConfigurationService(repository);
    const first = await service.getPublicState();
    const second = await service.getPublicState();

    expect(first.publicKey).toBe(second.publicKey);
    expect(first.preferences).toMatchObject({
      pushEnabled: false,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
      timezone: "Asia/Shanghai",
      version: 1,
    });
    expect(JSON.stringify(first)).not.toContain("privateKey");
    const stored = await repository.getVapidConfiguration();
    expect(stored?.encryptedPrivateKey).not.toContain(first.publicKey);
  });

  it("encrypts and upserts a browser subscription without exposing its endpoint", async () => {
    const service = createPushConfigurationService(repository);
    const subscription = {
      endpoint: "https://push.example.test/send/device-token",
      expirationTime: null,
      keys: { p256dh: "public-browser-key", auth: "auth-secret" },
    };
    const first = await service.saveSubscription(subscription, "Edge · Windows");
    const second = await service.saveSubscription(subscription, "Edge · Laptop");
    const state = await service.getPublicState();

    expect(second.id).toBe(first.id);
    expect(second.deviceLabel).toBe("Edge · Laptop");
    expect(second.encryptedSubscription).not.toContain("device-token");
    expect(JSON.stringify(state)).not.toContain("push.example.test");
    expect(JSON.stringify(state)).not.toContain("auth-secret");
    expect(state.subscriptions).toHaveLength(1);
  });

  it("updates preferences with an optimistic version and deletes local subscriptions", async () => {
    const initial = await repository.getPreferences();
    const updated = await repository.updatePreferences({
      pushEnabled: true,
      quietHoursEnabled: true,
      quietStart: "23:00",
      quietEnd: "07:30",
      expectedVersion: initial.version,
      now: new Date("2026-09-12T01:00:00.000Z"),
    });
    expect(updated).toMatchObject({
      pushEnabled: true,
      quietStart: "23:00",
      version: 2,
    });
    await expect(
      repository.updatePreferences({
        pushEnabled: false,
        quietHoursEnabled: false,
        quietStart: "22:00",
        quietEnd: "08:00",
        expectedVersion: 1,
        now: new Date(),
      }),
    ).rejects.toMatchObject({
      code: "PREFERENCE_VERSION_CONFLICT",
    } satisfies Partial<NotificationRepositoryError>);

    const saved = await createPushConfigurationService(repository).saveSubscription(
      {
        endpoint: "https://push.example.test/one",
        expirationTime: null,
        keys: { p256dh: "key", auth: "auth" },
      },
      "Test device",
    );
    await expect(repository.deleteSubscription(saved.id)).resolves.toBe(true);
    await expect(repository.deleteSubscription(saved.id)).resolves.toBe(false);
  });
});
