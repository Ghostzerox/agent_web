import { requestJson } from "@/lib/api/jsonRequest";
import type { SummaryRecord } from "@/lib/repositories/conversationSummaryRepository";
import type { SummarySettings } from "@/lib/conversation/summary";
async function request<T>(conversationId: string, method: string, body?: unknown, leafId?: string): Promise<T> {
  return requestJson("/api/v1/conversations/"+conversationId+"/summary"+(leafId ? "?leafId="+leafId : ""), { method, cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) },
    { fallbackMessage: "摘要服务不可用；完整历史保留。" });
}
export const conversationSummaryClient = {
  inspect: (id: string, leaf: string) => request<{ summary: SummaryRecord | null; messageCount: number; reason: string; settings: SummarySettings }>(id, "GET", undefined, leaf),
  generate: (id: string, leafId: string) => request<SummaryRecord>(id, "POST", { leafId, confirmPaid: true }),
  approve: (id: string, leafId: string, summary: SummaryRecord) => request<SummaryRecord>(id, "PATCH", { leafId, summaryId: summary.id, expectedVersion: summary.version }),
  clear: (id: string) => request(id, "DELETE"),
};
