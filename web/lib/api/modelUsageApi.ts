import { summarizeModelCalls, type ModelCallTelemetry } from "@/lib/ai/modelUsage";
import { z } from "zod";

export type ModelUsageOverview = {
  since: string; until: string; recordedCalls: number; truncated: boolean;
  groups: ReturnType<typeof summarizeModelCalls>;
};

export function createModelUsageApi(repository: { list(since: Date, limit?: number, operationId?: string): Promise<{ calls: ModelCallTelemetry[]; truncated: boolean }> }, now: () => Date = () => new Date()) {
  return {
    async get(request?: Request): Promise<Response> {
      const until = now();
      const since = new Date(until.getTime() - 7 * 86400_000);
      try {
        const params = request ? new URL(request.url).searchParams : null;
        const operationId = params?.get("operationId");
        if (operationId && !z.uuid().safeParse(operationId).success) return Response.json({ error: { code: "INVALID_OPERATION", message: "用量请求标识无效。" } }, { status: 400 });
        if (operationId || params?.get("recent") === "1") {
          const data = await repository.list(since, operationId ? 50 : 20, operationId ?? undefined);
          return Response.json({ data }, { headers: { "cache-control": "no-store" } });
        }
        const { calls, truncated } = await repository.list(since);
        const data: ModelUsageOverview = { since: since.toISOString(), until: until.toISOString(), recordedCalls: calls.length, truncated, groups: summarizeModelCalls(calls) };
        return Response.json({ data }, { headers: { "cache-control": "no-store" } });
      } catch {
        return Response.json({ error: { code: "MODEL_USAGE_UNAVAILABLE", message: "暂时无法读取模型用量。" } }, { status: 503, headers: { "cache-control": "no-store" } });
      }
    },
  };
}
