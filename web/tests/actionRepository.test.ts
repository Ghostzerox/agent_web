import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase, type MigrationSession } from "@/lib/db/migrations";
import { createActionRepository } from "@/lib/repositories/actionRepository";
import { createActionApi } from "@/lib/api/actionApi";
import { businessDay, daySchema, type ActionCommand, type ActionDefinition } from "@/lib/tasks/actions";
const now = new Date("2030-01-02T08:00:00Z");
const definition = (title = "行动"): ActionDefinition => ({ kind: "todo", title, note: "", startsOn: "2030-01-02", dueOn: null, status: "active", goalId: null, completedOn: null, rules: [], linkedTaskId: null });
describe("action facts and CAS", () => {
  let pg: PGlite; let repo: ReturnType<typeof createActionRepository>;
  beforeAll(async () => {
    pg = new PGlite();
    const session = (db: Pick<PGlite, "query">): MigrationSession => ({ execute: async (q, args = []) => (await db.query(q, [...args])).rows as Record<string, unknown>[] });
    await migrateDatabase({ ...session(pg), transaction: (fn) => pg.transaction((tx) => fn(session(tx))) }, await loadMigrations());
    repo = createActionRepository(drizzle(pg, { schema }));
  });
  afterAll(async () => { await pg.close(); });
  const create = (data = definition()) => repo.mutate({ operation: "create", mutationId: crypto.randomUUID(), data }, now);
  it("has strict Shanghai dates", () => { expect(businessDay(new Date("2030-01-01T16:00:00Z"))).toBe("2030-01-02"); expect(daySchema.safeParse("2030-02-30").success).toBe(false); });
  it("records one completion without a TaskRun and supports undo", async () => {
    const item = await create();
    const done = await repo.mutate({ operation: "record", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: 1, day: "2030-01-02", value: 1, state: "done", note: "真实完成" }, now);
    expect(done.data.completedOn).toBe("2030-01-02");
    expect((await pg.query("select * from task_runs")).rows).toHaveLength(0);
    const undone = await repo.mutate({ operation: "record", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: 2, day: "2030-01-02", value: 0, state: "revoked", note: "纠正" }, now);
    expect(undone.data.completedOn).toBeNull();
    expect((await repo.read("2030-01-01", "2030-01-03", now)).entries.find((e) => e.itemId === item.id)?.state).toBe("revoked");
  });
  it("replays the same mutation once and rejects reused identifiers with different payload", async () => {
    const command: ActionCommand = { operation: "create", mutationId: crypto.randomUUID(), data: definition("幂等") };
    const first = await repo.mutate(command, now); expect((await repo.mutate(command, now)).id).toBe(first.id);
    await expect(repo.mutate({ ...command, data: definition("不同") }, now)).rejects.toThrow("操作编号");
  });
  it("rejects stale concurrent writes and future completion", async () => {
    const item = await create(); const command: ActionCommand = { operation: "record", mutationId: crypto.randomUUID(), id: item.id, expectedVersion: 1, day: "2030-01-02", value: 1, state: "done", note: "" };
    await repo.mutate(command, now);
    await expect(repo.mutate({ ...command, mutationId: crypto.randomUUID() }, now)).rejects.toThrow("另一端");
    await expect(repo.mutate({ ...command, mutationId: crypto.randomUUID(), expectedVersion: 2, day: "2030-01-03" }, now)).rejects.toThrow("未来");
  });
  it("does not accept arbitrary owner fields or inverted API ranges", async () => {
    const api = createActionApi(repo, () => now);
    expect((await api.handle(new Request("http://localhost/api/v1/actions?from=2030-01-03&to=2030-01-01"))).status).toBe(400);
    const response = await api.handle(new Request("http://localhost/api/v1/actions", { method: "POST", body: JSON.stringify({ operation: "create", mutationId: crypto.randomUUID(), data: definition(), userId: crypto.randomUUID() }) }));
    expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
