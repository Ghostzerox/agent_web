import { apiFetch } from "./clientRuntime";

export type JsonApiFailure = {
  message: string;
  code: string;
  status: number;
  retryable: boolean;
  details?: unknown;
};

type RequestOptions = {
  fallbackMessage?: string | ((status: number) => string);
  fallbackCode?: string;
  error?: (failure: JsonApiFailure) => Error;
};

/** One JSON-envelope transport. No retries, credentials, domain rules or SSE handling. */
export async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options: RequestOptions = {},
): Promise<T> {
  const headers = Object.fromEntries(new Headers(init?.headers));
  if (init?.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const fallback = options.fallbackMessage ?? ((status: number) => `服务端请求失败：${status}`);
    const failure: JsonApiFailure = {
      message: typeof body?.error?.message === "string" ? body.error.message
        : typeof fallback === "function" ? fallback(response.status) : fallback,
      code: typeof body?.error?.code === "string" ? body.error.code : options.fallbackCode ?? "UNKNOWN_ERROR",
      status: response.status,
      retryable: body?.error?.retryable === true,
      ...(body?.error?.details !== undefined ? { details: body.error.details } : {}),
    };
    throw options.error ? options.error(failure) : new Error(failure.message);
  }
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}
