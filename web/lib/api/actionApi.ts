import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createActionRepository } from "@/lib/repositories/actionRepository";
import { ActionError, businessDay, daySchema, shiftDay } from "@/lib/tasks/actions";
export function createActionApi(repository: ReturnType<typeof createActionRepository>, now = () => new Date()) {
  return { async handle(request: Request) {
    const requestId = crypto.randomUUID(), headers = { "cache-control": "no-store", "x-request-id": requestId };
    try {
      let result: unknown;
      if (request.method === "GET") {
        const query = new URL(request.url).searchParams, today = businessDay(now());
        const from = daySchema.parse(query.get("from") ?? shiftDay(today, -31)), to = daySchema.parse(query.get("to") ?? today);
        if (to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new ActionError("请选择不超过366天的有序日期范围。", 400);
        result = await repository.read(from, to, now());
      } else if (request.method === "POST") {
        const text = await request.text(); if (new TextEncoder().encode(text).length > 120000) throw new ActionError("请求过大。", 413);
        result = await repository.mutate(JSON.parse(text), now());
      } else throw new ActionError("不支持此操作。", 405);
      return Response.json({ data: result }, { headers });
    } catch (error) {
      const invalid = error instanceof z.ZodError || error instanceof SyntaxError, known = error instanceof ActionError;
      return Response.json({ error: { code: known ? (error.status === 409 ? "VERSION_CONFLICT" : "ACTION_INVALID") : invalid ? "INVALID_REQUEST" : "ACTIONS_UNAVAILABLE", message: known ? error.message : invalid ? "输入格式不正确。" : "行动记录暂不可用，未保存成功；请稍后刷新核对。", retryable: !known && !invalid, requestId } }, { headers, status: known ? error.status : invalid ? 400 : 503 });
    }
  } };
}
export function getActionApi() { return createActionApi(createActionRepository(getDatabase())); }
