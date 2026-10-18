import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createVoiceProfileRepository } from "@/lib/repositories/voiceProfileRepository";

describe("VoiceProfileRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createVoiceProfileRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    repository = createVoiceProfileRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("creates defaults and updates the profile with optimistic version control", async () => {
    await expect(repository.get()).resolves.toMatchObject({
      provider: "system",
      voiceId: null,
      language: "zh-CN",
      rate: 100,
      pitch: 100,
      volume: 100,
      version: 1,
    });

    const now = new Date("2026-09-27T08:00:00.000Z");
    await expect(repository.update({
      provider: "system",
      voiceId: "device-voice-1",
      language: "zh-TW",
      rate: 90,
      pitch: 110,
      volume: 80,
      expectedVersion: 1,
      now,
    })).resolves.toMatchObject({
      voiceId: "device-voice-1",
      language: "zh-TW",
      rate: 90,
      pitch: 110,
      volume: 80,
      version: 2,
      updatedAt: now,
    });

    await expect(repository.update({
      provider: "system",
      voiceId: null,
      language: "zh-CN",
      rate: 100,
      pitch: 100,
      volume: 100,
      expectedVersion: 1,
      now,
    })).rejects.toMatchObject({ code: "VOICE_PROFILE_VERSION_CONFLICT" });
  });
});
