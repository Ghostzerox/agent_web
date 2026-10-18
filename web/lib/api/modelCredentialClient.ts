import { apiFetch } from "@/lib/api/clientRuntime";

export type ModelCredentialStatus = {
  configured: boolean;
  source: "stored" | "none";
  provider: string | null;
  baseUrl: string | null;
  model: string | null;
  apiKeyHint: string | null;
  version: number | null;
  missing: string[];
};

export type ModelCredentialInput = {
  apiKey: string;
  provider: string;
  baseUrl: string;
  model: string;
};

export type ModelCredentialTestResult = {
  connected: true;
  modelAvailable: boolean;
};

type ApiEnvelope<T> = { data: T };

export class ModelCredentialClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelCredentialClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ModelCredentialClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `凭据服务请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "REQUEST_FAILED",
      body?.error?.retryable === true,
    );
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as ApiEnvelope<T>;
  return body.data;
}

export function getModelCredentialStatus(): Promise<ModelCredentialStatus> {
  return request("/api/v1/model/credentials");
}

export function saveModelCredential(
  input: ModelCredentialInput,
): Promise<ModelCredentialStatus> {
  return request("/api/v1/model/credentials", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function testModelCredential(
  input: ModelCredentialInput,
): Promise<ModelCredentialTestResult> {
  return request("/api/v1/model/credentials/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteModelCredential(): Promise<void> {
  return request("/api/v1/model/credentials", { method: "DELETE" });
}
