import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, rollbackDatabase, type MigrationSession, type MigrationRow } from "@/lib/db/migrations";
import { createModelUsageRepository } from "@/lib/repositories/modelUsageRepository";
import type { ModelCallTelemetry } from "@/lib/ai/modelUsage";

it("persists metadata idempotently, bounds reads and rolls back only the usage table", async () => {
  const pg = new PGlite();
  const session = (db: Pick<PGlite, "query">): MigrationSession => ({ execute: async (query, parameters = []) => (await db.query<MigrationRow>(query, [...parameters])).rows });
  const migrations = (await loadMigrations()).filter((migration) => migration.id <= "0027_model_usage_calls.sql");
  const migrationDb = { ...session(pg), transaction: <T>(callback: (tx: MigrationSession) => Promise<T>) => pg.transaction((tx) => callback(session(tx))) };
  try {
    await migrateDatabase(migrationDb, migrations);
    const repository = createModelUsageRepository(drizzle(pg, { schema }));
    const call: ModelCallTelemetry = { id: crypto.randomUUID(), business: "game", providerOrigin: "https://provider.example", model: "mock", startedAt: "2026-10-01T00:00:00.000Z", status: "completed", attempts: 1, durationMs: 15, firstTokenMs: 5, usage: null, finishReason: null, errorCode: null, price: null, estimatedCost: null };
    await repository.record(call);
    await repository.record(call);
    await repository.record({ ...call, id: crypto.randomUUID(), promptVersion: "game/r3.3-v1" });
    expect((await repository.list(new Date("2026-09-30"), 1))).toMatchObject({ calls: [expect.objectContaining({ business: "game", model: "mock" })], truncated: true });
    expect((await repository.list(new Date("2026-09-30"))).calls).toHaveLength(2);
    const stored = (await repository.list(new Date("2026-09-30"))).calls;
    expect(stored.some((item) => item.promptVersion === "game/r3.3-v1")).toBe(true);
    expect(stored.some((item) => item.promptVersion === undefined)).toBe(true);
    expect((await repository.list(new Date("2026-10-02"))).calls).toEqual([]);
    expect(await rollbackDatabase(migrationDb, migrations)).toBe("0027_model_usage_calls.sql");
    expect((await pg.query("SELECT tablename FROM pg_tables WHERE tablename='conversations'")).rows).toHaveLength(1);
    expect((await pg.query("SELECT tablename FROM pg_tables WHERE tablename='model_usage_calls'")).rows).toHaveLength(0);
  } finally { await pg.close(); }
});
