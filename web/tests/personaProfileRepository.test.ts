import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createPersonaProfileRepository } from "@/lib/repositories/personaProfileRepository";

describe("PersonaProfileRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createPersonaProfileRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    repository = createPersonaProfileRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => { await pglite.close(); });

  it("creates defaults and updates the single-user profile with version control", async () => {
    const initial = await repository.get();
    expect(initial).toMatchObject({
      name: "知伴",
      preferredAddress: null,
      warmth: 70,
      humor: 20,
      directness: 60,
      verbosity: 50,
      initiative: 40,
      version: 1,
    });

    const now = new Date("2026-09-27T05:00:00.000Z");
    const updated = await repository.update({
      name: "小知",
      preferredAddress: "小林",
      warmth: 80,
      humor: 30,
      directness: 70,
      verbosity: 40,
      initiative: 60,
      expectedVersion: 1,
      now,
    });
    expect(updated).toMatchObject({ name: "小知", preferredAddress: "小林", version: 2, updatedAt: now });

    await expect(repository.update({
      name: "冲突",
      preferredAddress: null,
      warmth: 50,
      humor: 0,
      directness: 50,
      verbosity: 50,
      initiative: 50,
      expectedVersion: 1,
      now,
    })).rejects.toMatchObject({ code: "PERSONA_PROFILE_VERSION_CONFLICT" });
  });
});
