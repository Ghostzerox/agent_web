import { afterEach, expect, it, vi } from "vitest";
import { apiFetch, configureApiBaseUrl } from "@/lib/api/clientRuntime";
import { beginModelOperation, getModelOperations, finishModelOperation, finishModelResponse, clearModelOperations } from "@/lib/ai/modelOperations";
import { withModelOperation, currentModelOperation } from "@/lib/ai/server/operationContext";
import { createModelUsageApi } from "@/lib/api/modelUsageApi";

afterEach(() => { for (const operation of getModelOperations()) finishModelOperation(operation.id); clearModelOperations(); configureApiBaseUrl(undefined); vi.unstubAllGlobals(); });
it("correlates concurrent requests without retaining prompt text, and keeps SSE active until consumed", async () => {
  const fetcher = vi.fn(async () => new Response('event: done\ndata: {}\n\n', { headers: { "content-type": "text/event-stream" } })); vi.stubGlobal("fetch", fetcher);
  const response = await apiFetch("/api/v1/model/stream", { method: "POST", body: "PRIVATE_PROMPT" });
  const first = getModelOperations().at(-1)!; expect(first.finishedAt).toBeUndefined();
  const second = beginModelOperation("/api/v1/game-worlds/world/generate", { method: "POST" })!;
  expect(first.id).not.toBe(second.id); expect(new Headers((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("x-model-operation-id")).toBe(first.id);
  expect(JSON.stringify(getModelOperations())).not.toContain("PRIVATE_PROMPT");
  finishModelResponse(response, true); finishModelResponse(response);
  expect(getModelOperations().find((entry) => entry.id === first.id)).toMatchObject({ failed: true, finishedAt: expect.any(Number) });
  expect(getModelOperations().find((entry) => entry.id === second.id)?.finishedAt).toBeUndefined();
});
it("does not label ordinary actions / storage / usage reads as model calls; handles network failures", async () => {
  for (const path of ["/api/v1/tasks", "/api/v1/model/credentials/test", "/api/v1/model/usage"]) expect(beginModelOperation(path, { method: "POST" })).toBeNull();
  expect(beginModelOperation("/api/v1/game-sessions/id/turns", { method: "POST", body: JSON.stringify({ explorationAction: { action: "move" } }) })).toBeNull();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(apiFetch("/api/v1/game-events/id/generate", { method: "POST" })).rejects.toThrow("offline");
  expect(getModelOperations().at(-1)).toMatchObject({ failed: true, finishedAt: expect.any(Number) });
});
it("isolates operation context across asynchronous routes and ignores invalid client headers", async () => {
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  await Promise.all(ids.map((id) => withModelOperation(new Request("http://local", { headers: { "x-model-operation-id": id } }), async () => {
    await Promise.resolve(); expect(currentModelOperation()).toBe(id);
  })));
  expect(currentModelOperation()).toBeUndefined();
  withModelOperation(new Request("http://local", { headers: { "x-model-operation-id": "not-uuid" } }), () => expect(currentModelOperation()).toBeUndefined());
});
it("queries bounded correlated or recent metadata, validates IDs, and retains the old seven-day overview", async () => {
  const list = vi.fn().mockResolvedValue({ calls: [], truncated: false }); const api = createModelUsageApi({ list }); const id = crypto.randomUUID();
  expect((await api.get(new Request(`http://local?operationId=${id}`))).status).toBe(200);
  expect(list).toHaveBeenLastCalledWith(expect.any(Date), 50, id);
  await api.get(new Request("http://local?recent=1")); expect(list).toHaveBeenLastCalledWith(expect.any(Date), 20, undefined);
  expect((await api.get(new Request("http://local?operationId=bad"))).status).toBe(400);
  expect((await (await api.get()).json()).data.recordedCalls).toBe(0);
});
