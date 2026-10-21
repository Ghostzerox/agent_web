import type { ChatCompletionMessage } from "@/lib/ai/messages";
import type { ModelProviderConfig } from "./modelConfig";
import { fetchWithTransientDnsRetry } from "./providerFetch";
import { estimateTokenCost, parseTokenUsage, readTokenPrices, type ModelBusiness, type ModelCallTelemetry, type TokenUsage } from "@/lib/ai/modelUsage";
import { inputTextCharacters, latestRequestText, resolveGenerationBudget, type GenerationBudget, type WorldGenerationOutputProfile } from "./tokenBudget";

export type ModelStreamRequest = {
  business?: ModelBusiness;
  promptVersion?: string;
  generationBudget?: GenerationBudget;
  outputProfile?: WorldGenerationOutputProfile;
  messages: Array<
    | ChatCompletionMessage
    | {
        role: "user";
        content: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } }
        >;
      }
  >;
};

export type ModelStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage?: TokenUsage; finishReason?: string };

export interface ModelProvider {
  stream(
    request: ModelStreamRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
}

export class ModelProviderError extends Error {
  constructor(
    readonly code:
      | "PROVIDER_AUTHENTICATION_FAILED"
      | "PROVIDER_RATE_LIMITED"
      | "PROVIDER_MODEL_NOT_FOUND"
      | "PROVIDER_REQUEST_REJECTED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_INVALID_RESPONSE"
      | "PROVIDER_CONTEXT_TOO_LARGE"
      | "PROVIDER_OUTPUT_TRUNCATED",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}

function mapProviderStatus(status: number): ModelProviderError {
  if (status === 401 || status === 403) {
    return new ModelProviderError(
      "PROVIDER_AUTHENTICATION_FAILED",
      "Model provider authentication failed.",
      false,
    );
  }
  if (status === 429) {
    return new ModelProviderError(
      "PROVIDER_RATE_LIMITED",
      "Model provider rate limit was reached.",
      true,
    );
  }
  if (status === 404) {
    return new ModelProviderError(
      "PROVIDER_MODEL_NOT_FOUND",
      "Configured model was not found.",
      false,
    );
  }
  if (status >= 400 && status < 500) {
    return new ModelProviderError(
      "PROVIDER_REQUEST_REJECTED",
      "Model provider rejected the request.",
      false,
    );
  }
  return new ModelProviderError(
    "PROVIDER_UNAVAILABLE",
    "Model provider is temporarily unavailable.",
    true,
  );
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const choice = first as {
    delta?: { content?: unknown };
    message?: { content?: unknown };
  };
  const content = choice.delta?.content ?? choice.message?.content;
  return typeof content === "string" ? content : "";
}

function parseEventData(frame: string): string | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  return data || null;
}

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(
    private readonly config: ModelProviderConfig,
    private readonly record?: (call: ModelCallTelemetry) => Promise<void>,
  ) {}

  async *stream(
    request: ModelStreamRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    const started = Date.now();
    const generationBudget = request.generationBudget ?? resolveGenerationBudget(this.config, request.business ?? "chat", latestRequestText(request.messages), process.env, request.outputProfile);
    const state: { attempts: number; usage: TokenUsage | null; finishReason: string | null } = { attempts: 0, usage: null, finishReason: null };
    let firstTokenMs: number | null = null;
    let status: ModelCallTelemetry["status"] = "cancelled";
    let errorCode: string | null = null;
    try {
      if (inputTextCharacters(request.messages) > generationBudget.inputCharacterLimit) {
        throw new ModelProviderError("PROVIDER_CONTEXT_TOO_LARGE", "上下文超过本机设定的输入预算，尚未调用模型；请新建对话或调整服务端预算，历史未被删除。", false);
      }
      for await (const event of this.streamRaw(request, signal, state, generationBudget)) {
        if (event.type === "delta" && firstTokenMs === null) firstTokenMs = Date.now() - started;
        if (event.type === "done") status = "completed";
        yield event;
      }
    } catch (error) {
      status = signal?.aborted ? "cancelled" : "failed";
      errorCode = error instanceof ModelProviderError ? error.code : (signal?.aborted ? "ABORTED" : "NETWORK_ERROR");
      throw error;
    } finally {
      if (this.record) {
        const providerOrigin = new URL(this.config.baseUrl).origin;
        const price = readTokenPrices(process.env.AI_TOKEN_PRICES_JSON).find((entry) => entry.providerOrigin === providerOrigin && entry.model === this.config.model) ?? null;
        try {
          await this.record({
            id: crypto.randomUUID(), business: request.business ?? "chat", providerOrigin,
            model: this.config.model, startedAt: new Date(started).toISOString(), status,
            attempts: state.attempts, durationMs: Date.now() - started, firstTokenMs,
            usage: state.usage, finishReason: state.finishReason, errorCode,
            requestCharacters: inputTextCharacters(request.messages), maxOutputTokens: generationBudget.maxOutputTokens,
            ...(request.promptVersion ? { promptVersion: request.promptVersion } : {}),
            price, estimatedCost: estimateTokenCost(state.usage, price),
          });
        } catch {
          console.warn("[model-usage] Could not persist usage metadata.");
        }
      }
    }
  }

  private async *streamRaw(
    request: ModelStreamRequest,
    signal: AbortSignal | undefined,
    state: { attempts: number; usage: TokenUsage | null; finishReason: string | null },
    generationBudget: GenerationBudget,
  ): AsyncIterable<ModelStreamEvent> {
    const observe = (payload: unknown) => {
      const usage = parseTokenUsage(payload);
      if (usage) state.usage = usage;
      const choices = (payload as { choices?: Array<{ finish_reason?: unknown }> })?.choices;
      const reason = choices?.[0]?.finish_reason;
      if (typeof reason === "string" && ["stop", "length", "content_filter", "tool_calls", "function_call", "insufficient_system_resource"].includes(reason)) state.finishReason = reason;
    };
    const completion = (): ModelStreamEvent => {
      if (state.finishReason === "length") throw new ModelProviderError("PROVIDER_OUTPUT_TRUNCATED", "模型输出达到上限，结果不完整；可提高该功能的输出预算或缩小本次任务。系统未自动重复调用。", false);
      if (state.finishReason && !["stop"].includes(state.finishReason)) throw new ModelProviderError("PROVIDER_REQUEST_REJECTED", "模型没有返回完整的文本结果。", false);
      return { type: "done", ...(state.usage ? { usage: state.usage } : {}), ...(state.finishReason ? { finishReason: state.finishReason } : {}) };
    };
    let response: Response;
    try {
      response = await fetchWithTransientDnsRetry(
        fetch,
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: request.messages,
            stream: true,
            // Verified official endpoint only; custom compatible providers retain their contract.
            ...(new URL(this.config.baseUrl).hostname === "api.deepseek.com" &&
              ["reflection", "memorization", "problem-solving", "review-card", "game", "context-summary"].includes(request.business ?? "")
              ? { response_format: { type: "json_object" } } : {}),
            // Structured world drafts need complete JSON, not an unseen reasoning-only response.
            // Keep ordinary game/actor/chat requests and custom providers unchanged.
            ...(new URL(this.config.baseUrl).hostname === "api.deepseek.com" && (request.business === "context-summary" ||
              (request.business === "game" && (request.outputProfile === "world-authoring" || request.outputProfile === "world-section")))
              ? { thinking: { type: "disabled" } } : {}),
            ...(generationBudget.tokenParameter && generationBudget.maxOutputTokens ? { [generationBudget.tokenParameter]: generationBudget.maxOutputTokens } : {}),
            // Only the verified official endpoint is opted in automatically.
            ...(new URL(this.config.baseUrl).hostname === "api.deepseek.com" ? { stream_options: { include_usage: true } } : {}),
          }),
          signal,
        },
        signal,
        () => { state.attempts++; },
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ModelProviderError(
        "PROVIDER_UNAVAILABLE",
        "Could not reach the model provider.",
        true,
      );
    }

    if (!response.ok) throw mapProviderStatus(response.status);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload: unknown = await response.json();
      observe(payload);
      const text = extractText(payload);
      if (!text) {
        throw new ModelProviderError(
          "PROVIDER_INVALID_RESPONSE",
          "Model provider returned no message content.",
          false,
        );
      }
      yield { type: "delta", text };
      yield completion();
      return;
    }

    if (!response.body) {
      throw new ModelProviderError(
        "PROVIDER_INVALID_RESPONSE",
        "Model provider returned an empty response body.",
        false,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        if (done && buffer.trim()) {
          frames.push(buffer);
          buffer = "";
        }

        for (const frame of frames) {
          const data = parseEventData(frame);
          if (!data) continue;
          if (data === "[DONE]") {
            sawDone = true;
            break;
          }

          let payload: unknown;
          try {
            payload = JSON.parse(data);
          } catch {
            throw new ModelProviderError(
              "PROVIDER_INVALID_RESPONSE",
              "Model provider returned malformed stream data.",
              false,
            );
          }
          observe(payload);
          const text = extractText(payload);
          if (text) yield { type: "delta", text };
        }

        if (done || sawDone) break;
      }
    } finally {
      try { await reader.cancel(); } catch { /* Do not mask the original transport error. */ } finally { reader.releaseLock(); }
    }

    if (!sawDone && !state.finishReason) throw new ModelProviderError("PROVIDER_INVALID_RESPONSE", "模型数据流中途结束，未收到完成标记。", false);
    yield completion();
  }
}
