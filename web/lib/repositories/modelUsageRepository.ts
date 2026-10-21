import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { modelUsageCalls } from "@/lib/db/schema";
import { modelCallSchema, type ModelCallTelemetry } from "@/lib/ai/modelUsage";
import { LOCAL_USER_ID } from "./conversationRepository";

export function createModelUsageRepository<T extends PgQueryResultHKT>(database: PgDatabase<T, typeof schema>) {
  return {
    async record(input: ModelCallTelemetry) {
      const call = modelCallSchema.parse(input);
      await database.insert(modelUsageCalls).values({ id: call.id, userId: LOCAL_USER_ID, startedAt: new Date(call.startedAt), telemetry: call }).onConflictDoNothing();
    },
    async list(since: Date, limit = 5000, operationId?: string): Promise<{ calls: ModelCallTelemetry[]; truncated: boolean }> {
      const rows = await database.select().from(modelUsageCalls).where(and(eq(modelUsageCalls.userId, LOCAL_USER_ID), gte(modelUsageCalls.startedAt, since),
        operationId ? sql`${modelUsageCalls.telemetry}->>'operationId' = ${operationId}` : undefined)).orderBy(desc(modelUsageCalls.startedAt)).limit(limit + 1);
      return { calls: rows.slice(0, limit).map((row) => modelCallSchema.parse(row.telemetry)), truncated: rows.length > limit };
    },
  };
}
