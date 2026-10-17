import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { DEFAULT_MEMORY_CONTROLS, memoryControlsSchema, type MemoryControls, type MemoryControlView } from "@/lib/memory/controls";
export class MemoryControlError extends Error { readonly status = 409; }
export function createMemoryControlRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>) {
  return {
    async get(): Promise<MemoryControlView> {
      const [row] = await db.select().from(schema.memoryControls).where(eq(schema.memoryControls.userId, LOCAL_USER_ID));
      return row ? { settings: memoryControlsSchema.parse(row.settings), version: row.version } : { settings: structuredClone(DEFAULT_MEMORY_CONTROLS), version: 0 };
    },
    async update(raw: MemoryControls, expectedVersion: number): Promise<MemoryControlView> {
      const settings = memoryControlsSchema.parse(raw);
      return db.transaction(async (tx) => {
        await tx.insert(schema.users).values({ id: LOCAL_USER_ID }).onConflictDoNothing();
        await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, LOCAL_USER_ID)).for("update");
        const current = await createMemoryControlRepository(tx).get();
        if (current.version !== expectedVersion) throw new MemoryControlError("记忆开关已在另一端修改，请刷新；你的草稿未覆盖新版。");
        const version = current.version + 1;
        await tx.insert(schema.memoryControls).values({ userId: LOCAL_USER_ID, settings, version }).onConflictDoUpdate({ target: schema.memoryControls.userId, set: { settings, version } });
        return { settings, version };
      });
    },
  };
}
