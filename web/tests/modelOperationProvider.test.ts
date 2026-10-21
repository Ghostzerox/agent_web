import { afterEach, expect, it, vi } from "vitest";
import { withModelOperation } from "@/lib/ai/server/operationContext";
import { createMeasuredProvider } from "@/lib/ai/server/measuredProvider";
const { record } = vi.hoisted(() => ({ record: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/repositories/modelUsageRepository", () => ({ createModelUsageRepository: () => ({ record }) }));
afterEach(() => { vi.unstubAllGlobals(); record.mockClear(); });
it("persists the route operation on completed and truncated provider usage without sending it upstream", async () => {
  const fetcher = vi.fn().mockImplementationOnce(async () => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 3 } }))
    .mockImplementationOnce(async () => Response.json({ choices: [{ message: { content: "{incomplete" }, finish_reason: "length" }], usage: { prompt_tokens: 20, completion_tokens: 6 } }));
  vi.stubGlobal("fetch", fetcher); const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const run = (id: string) => withModelOperation(new Request("http://local", { headers: { "x-model-operation-id": id } }), async () => {
    for await (const event of createMeasuredProvider({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "synthetic" }).stream({ messages: [{ role: "user", content: "synthetic" }] })) void event;
  });
  await run(ids[0]); await expect(run(ids[1])).rejects.toMatchObject({ code: "PROVIDER_OUTPUT_TRUNCATED" });
  expect(record.mock.calls[0][0]).toMatchObject({ operationId: ids[0], status: "completed", usage: { inputTokens: 10, outputTokens: 3 } });
  expect(record.mock.calls[1][0]).toMatchObject({ operationId: ids[1], status: "failed", usage: { inputTokens: 20, outputTokens: 6 } });
  for (const call of fetcher.mock.calls) expect(JSON.stringify(call)).not.toContain("x-model-operation-id");
});
