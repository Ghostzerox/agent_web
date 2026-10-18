import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeBaseUrl,
} from "@/lib/ai/server/modelConfig";
import {
  OpenAICompatibleProvider,
} from "@/lib/ai/server/modelProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider URL validation", () => {
  it("normalizes an absolute HTTPS URL", () => {
    expect(normalizeBaseUrl("https://provider.example/v1/?query=1#hash")).toBe("https://provider.example/v1");
    expect(() => normalizeBaseUrl("not a URL")).toThrow("absolute URL");
  });
  it("requires explicit opt-in for HTTP", () => {
    vi.stubEnv("AI_ALLOW_INSECURE_HTTP", "false");
    expect(() => normalizeBaseUrl("http://127.0.0.1:11434/v1")).toThrow("HTTPS");
    vi.stubEnv("AI_ALLOW_INSECURE_HTTP", "true");
    expect(normalizeBaseUrl("http://127.0.0.1:11434/v1")).toBe("http://127.0.0.1:11434/v1");
  });
  it("rejects embedded credentials", () => {
    expect(() => normalizeBaseUrl("https://user:password@provider.example/v1")).toThrow("embedded credentials");
  });
});

describe("OpenAICompatibleProvider", () => {
  it.each(["reflection", "memorization", "problem-solving", "review-card", "game", "context-summary"] as const)("requests verified JSON mode for %s on official DeepSeek only", async (business) => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }));
    vi.stubGlobal("fetch", fetcher);
    for (const baseUrl of ["https://api.deepseek.com", "https://compatible.example/v1"]) {
      for await (const event of new OpenAICompatibleProvider({ apiKey: "test", baseUrl, model: "test" }).stream({ business, messages: [{ role: "user", content: "JSON {}" }] })) void event;
    }
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toHaveProperty("response_format", { type: "json_object" });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty("response_format");
    if (business === "context-summary") expect(JSON.parse(fetcher.mock.calls[0][1].body)).toHaveProperty("thinking", { type: "disabled" });
    else expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty("thinking");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty("thinking");
  });
  it("captures usage-only chunks, official stream options and a privacy-safe call record", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"content":"回答"},"finish_reason":"stop"}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":10,"prompt_cache_hit_tokens":80,"prompt_cache_miss_tokens":20}}',
      'data: [DONE]',
    ].join("\n\n"), { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetcher);
    const provider = new OpenAICompatibleProvider({ apiKey: "server-secret", baseUrl: "https://api.deepseek.com", model: "mock" }, record);
    const events = [];
    for await (const event of provider.stream({ messages: [{ role: "user", content: "private question" }], business: "news", promptVersion: "news/r3.3-v1" })) events.push(event);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ stream_options: { include_usage: true } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty("promptVersion");
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop", usage: { cachedInputTokens: 80 } });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0]).toMatchObject({ business: "news", promptVersion: "news/r3.3-v1", status: "completed", attempts: 1, estimatedCost: null, usage: { inputTokens: 100 } });
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/server-secret|private question|回答/u);
  });

  it("does not add provider-specific options to unknown compatible endpoints", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetcher);
    const record = vi.fn().mockResolvedValue(undefined);
    for await (const event of new OpenAICompatibleProvider({ apiKey: "key", baseUrl: "https://provider.example/v1", model: "mock" }, record).stream({ messages: [] })) void event;
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty("stream_options");
    expect(record.mock.calls[0][0]).toMatchObject({ usage: null, status: "completed" });
  });

  it("records failures and consumer cancellation without blocking on telemetry errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream", { status: 429 })));
    const record = vi.fn().mockResolvedValue(undefined);
    const provider = new OpenAICompatibleProvider({ apiKey: "key", baseUrl: "https://provider.example", model: "mock" }, record);
    await expect((async () => { for await (const event of provider.stream({ messages: [] })) void event; })()).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    expect(record.mock.calls[0][0]).toMatchObject({ status: "failed", errorCode: "PROVIDER_RATE_LIMITED", usage: null });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } }))));
    for await (const event of provider.stream({ messages: [] })) { if (event.type === "delta") break; }
    expect(record.mock.calls[1][0]).toMatchObject({ status: "cancelled", usage: null });
    record.mockRejectedValue(new Error("private database details"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for await (const event of provider.stream({ messages: [] })) void event;
    expect(console.warn).toHaveBeenCalledWith("[model-usage] Could not persist usage metadata.");
  });

  it("retries a transient DNS lookup failure before streaming", async () => {
    const dnsError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "EAI_AGAIN" },
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(dnsError)
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = new OpenAICompatibleProvider({
      apiKey: "server-secret",
      baseUrl: "https://provider.example/v1",
      model: "test-model",
    });

    const events = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "你好" }],
    })) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      { type: "delta", text: "OK" },
      { type: "done" },
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      "[model-provider] Retrying after transient DNS failure",
      { code: "EAI_AGAIN", attempt: 2 },
    );
  });

  it("parses split OpenAI-compatible SSE chunks", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n'),
        );
        controller.enqueue(
          encoder.encode(
            '\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider({
      apiKey: "server-secret",
      baseUrl: "https://provider.example/v1",
      model: "test-model",
    });

    const events = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "你好" }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "你" },
      { type: "delta", text: "好" },
      { type: "done" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://provider.example/v1/chat/completions");
    expect(init.headers).toMatchObject({
      authorization: "Bearer server-secret",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-model",
      stream: true,
      messages: [{ role: "user", content: "你好" }],
    });
  });

  it("maps provider status without returning its response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("upstream details", { status: 429 }),
      ),
    );
    const provider = new OpenAICompatibleProvider({
      apiKey: "key",
      baseUrl: "https://provider.example/v1",
      model: "model",
    });

    const consume = async () => {
      for await (const event of provider.stream({ messages: [] })) void event;
    };
    await expect(consume()).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });
});
