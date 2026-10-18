import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createReadingProfileRepository } from "@/lib/repositories/readingProfileRepository";

describe("ReadingProfileRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createReadingProfileRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    repository = createReadingProfileRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("creates defaults and updates the single-user profile with version control", async () => {
    const initial = await repository.get();
    expect(initial).toMatchObject({
      topics: [],
      readBooks: [],
      wantToReadBooks: [],
      dislikedBooks: [],
      difficulty: "intermediate",
      weeklyMinutes: 120,
      goal: "systematic",
      version: 1,
    });

    const now = new Date("2026-09-27T02:00:00.000Z");
    const updated = await repository.update({
      topics: ["认知科学", "世界史"],
      readBooks: ["思考，快与慢 — 丹尼尔·卡尼曼"],
      wantToReadBooks: ["枪炮、病菌与钢铁 — 贾雷德·戴蒙德"],
      dislikedBooks: ["空泛成功学"],
      difficulty: "advanced",
      weeklyMinutes: 240,
      goal: "broaden",
      expectedVersion: 1,
      now,
    });
    expect(updated).toMatchObject({
      topics: ["认知科学", "世界史"],
      difficulty: "advanced",
      weeklyMinutes: 240,
      goal: "broaden",
      version: 2,
      updatedAt: now,
    });

    await expect(
      repository.update({
        topics: [],
        readBooks: [],
        wantToReadBooks: [],
        dislikedBooks: [],
        difficulty: "introductory",
        weeklyMinutes: 60,
        goal: "beginner",
        expectedVersion: 1,
        now,
      }),
    ).rejects.toMatchObject({ code: "READING_PROFILE_VERSION_CONFLICT" });
  });
});
