import { beginModelOperation, bindModelResponse, finishModelOperation } from "@/lib/ai/modelOperations";
let apiBaseUrl = "";

export class ApiBaseUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiBaseUrlError";
  }
}

export function normalizeApiBaseUrl(value: string | undefined): string {
  const input = value?.trim();
  if (!input) return "";

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ApiBaseUrlError("API Base URL 必须是完整 URL");
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !localHttp) {
    throw new ApiBaseUrlError("移动端 API Base URL 必须使用 HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiBaseUrlError("API Base URL 不能包含凭据、查询参数或片段");
  }
  if (url.pathname !== "/") {
    throw new ApiBaseUrlError("API Base URL 只能包含域名，不能包含路径");
  }
  return url.origin;
}

export function configureApiBaseUrl(value: string | undefined): string {
  apiBaseUrl = normalizeApiBaseUrl(value);
  return apiBaseUrl;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function resolveApiUrl(path: string): string {
  if (!path.startsWith("/api/v1/")) {
    throw new ApiBaseUrlError("共享 API Client 只能访问 /api/v1 路径");
  }
  return apiBaseUrl ? new URL(path, `${apiBaseUrl}/`).toString() : path;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = resolveApiUrl(path);
  const operation = beginModelOperation(path, init);
  if (!operation) return fetch(url, init);
  const headers = new Headers(init?.headers); headers.set("x-model-operation-id", operation.id);
  try {
    const response = await fetch(url, { ...init, headers });
    bindModelResponse(response, operation.id);
    if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) finishModelOperation(operation.id, !response.ok);
    return response;
  } catch (error) { finishModelOperation(operation.id, true); throw error; }
}
