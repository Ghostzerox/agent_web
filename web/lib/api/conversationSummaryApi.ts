import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createConversationSummaryRepository, summaryModelKey } from "@/lib/repositories/conversationSummaryRepository";
import { DEFAULT_SUMMARY_SETTINGS, SUMMARY_INSTRUCTION, SUMMARY_POLICY, SummaryError, summarySettingsSchema } from "@/lib/conversation/summary";
import { resolveModelProviderConfig } from "@/lib/ai/server/modelCredentialService";
import { createMeasuredProvider } from "@/lib/ai/server/measuredProvider";
import { ModelProviderError, type ModelProvider } from "@/lib/ai/server/modelProvider";
import type { ModelProviderConfig } from "@/lib/ai/server/modelConfig";
import { resolveGenerationBudget, inputTextCharacters } from "@/lib/ai/server/tokenBudget";
type Repo = ReturnType<typeof createConversationSummaryRepository>;
export function createConversationSummaryApi(repo: Pick<Repo, "inspect" | "begin" | "complete" | "fail" | "approve" | "clear">, getConfig: () => Promise<ModelProviderConfig>, provider: (config: ModelProviderConfig) => ModelProvider) {
  return { async handle(request: Request, rawId: string): Promise<Response> {
    const headers = { "cache-control": "no-store", "x-request-id": crypto.randomUUID() };
    let pendingId: string | null = null;
    try {
      const id = z.uuid().parse(rawId);
      if (request.method === "DELETE") { await repo.clear(id); return Response.json({ data: { cleared: true } }, { headers }); }
      const config = await getConfig(); const modelKey = summaryModelKey(config);
      if (request.method === "GET") return Response.json({ data: { ...await repo.inspect(id, z.uuid().nullable().parse(new URL(request.url).searchParams.get("leafId")), modelKey), settings: DEFAULT_SUMMARY_SETTINGS } }, { headers });
      const raw = await request.text(); if (raw.length > 4000) throw new SummaryError("请求过长。", 413);
      if (request.method === "PATCH") {
        const input = z.object({ leafId: z.uuid(), summaryId: z.uuid(), expectedVersion: z.number().int().positive() }).strict().parse(JSON.parse(raw));
        return Response.json({ data: await repo.approve(id, input.leafId, input.summaryId, input.expectedVersion, modelKey) }, { headers });
      }
      if (request.method !== "POST") throw new SummaryError("不支持的摘要操作。", 405);
      const input = z.object({ leafId: z.uuid(), confirmPaid: z.literal(true), settings: summarySettingsSchema.optional() }).strict().parse(JSON.parse(raw));
      const begun = await repo.begin(id, input.leafId, modelKey, input.settings);
      if (begun.reused) return Response.json({ data: begun.record, reused: true }, { headers });
      pendingId = begun.record.id;
      const messages = [{ role: "system" as const, content: `${SUMMARY_INSTRUCTION}\n输出JSON总长度不超过${begun.record.settings.maxCharacters}字符。` }, { role: "user" as const, content: JSON.stringify(begun.sources.map(({ id, role, content }) => ({ id, role, content }))) }];
      const generationBudget = resolveGenerationBudget(config, "context-summary");
      if (inputTextCharacters(messages) > generationBudget.inputCharacterLimit) throw new SummaryError("原始摘要输入超出预算；未请求模型，请调整覆盖策略或保持完整历史。", 413);
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);
      let text = ""; let done = false;
      for await (const event of provider(config).stream({ business: "context-summary", promptVersion: SUMMARY_POLICY, messages, generationBudget }, signal)) {
        if (event.type === "done") done = true;
        else { text += event.text; if (text.length > 24000) throw new SummaryError("摘要模型输出过长；结果不保存，费用见用量。", 422); }
      }
      if (!done || signal.aborted) throw new SummaryError("摘要生成未完整结束；未替换原文，费用见用量。", 422);
      const payload = JSON.parse(text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, ""));
      return Response.json({ data: await repo.complete(begun.record, begun.sources, payload) }, { headers });
    } catch (error) {
      if (pendingId) await repo.fail(pendingId).catch(() => undefined);
      const known = error instanceof SummaryError; const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
      return Response.json({ error: { code: known ? "SUMMARY_CONFLICT" : invalid ? "INVALID_SUMMARY" : "SUMMARY_FAILED", message: known ? error.message : invalid ? "摘要输入/输出无效；没有替换原文，模型调用费用仍计入用量。" : error instanceof ModelProviderError ? error.message : "摘要不可用，请检查模型配置或稍后显式重试；完整历史保留。", retryable: false } }, { headers, status: known ? error.status : invalid ? 422 : 503 });
    }
  } };
}
export function getConversationSummaryApi() { return createConversationSummaryApi(createConversationSummaryRepository(getDatabase()), resolveModelProviderConfig, createMeasuredProvider); }
