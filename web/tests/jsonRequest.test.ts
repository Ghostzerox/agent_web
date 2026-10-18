import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/api/jsonRequest";
import { configureApiBaseUrl } from "@/lib/api/clientRuntime";
import { createTask, TaskClientError } from "@/lib/api/taskClient";
import { saveModelCredential, ModelCredentialClientError } from "@/lib/api/modelCredentialClient";

afterEach(() => { vi.unstubAllGlobals(); configureApiBaseUrl(""); });

describe("shared JSON transport", () => {
  it("preserves origin, method, signal, cache and HeadersInit without mutating inputs", async () => {
    configureApiBaseUrl("https://server.test");
    const headers = new Headers({ "x-test": "kept", "content-type": "application/custom+json" });
    const signal = new AbortController().signal;
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { version: 3 } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestJson("/api/v1/test", { method: "PATCH", body: "{}", headers, signal, cache: "no-store" })).resolves.toEqual({ version: 3 });
    expect(fetcher).toHaveBeenCalledWith("https://server.test/api/v1/test", expect.objectContaining({
      method: "PATCH", signal, cache: "no-store", body: "{}",
      headers: { "x-test": "kept", "content-type": "application/custom+json" },
    }));
    expect([...headers]).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("handles empty DELETE responses and adds JSON headers only for a body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestJson("/api/v1/test", { method: "DELETE" })).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1].headers).toEqual({});
  });
  it("preserves domain errors and never retries failed writes", async () => {
    const fetcher = vi.fn().mockImplementation(() => Response.json({ error: { code: "VERSION_CONFLICT", message: "请保留草稿", retryable: true } }, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(createTask({ title: "测试", kind: "reminder", prompt: null, schedule: { type: "daily", time: "20:00" } }))
      .rejects.toMatchObject({ name: TaskClientError.name, code: "VERSION_CONFLICT", status: 409, message: "请保留草稿" });
    await expect(saveModelCredential({ provider: "custom", apiKey: "synthetic", baseUrl: "https://provider.test", model: "test" }))
      .rejects.toMatchObject({ name: ModelCredentialClientError.name, code: "VERSION_CONFLICT", retryable: true, message: "请保留草稿" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].headers).toEqual({ "content-type": "application/json" });
  });
  it("uses a safe error fallback for non-JSON failures and keeps network/abort identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>upstream error</html>", { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestJson("/api/v1/test")).rejects.toThrow("服务端请求失败：502");
    const aborted = new DOMException("cancelled", "AbortError");
    fetcher.mockRejectedValueOnce(aborted);
    await expect(requestJson("/api/v1/test")).rejects.toBe(aborted);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not turn malformed successful JSON into a fabricated success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid", { status: 200 })));
    await expect(requestJson("/api/v1/test")).rejects.toBeInstanceOf(SyntaxError);
  });
});
