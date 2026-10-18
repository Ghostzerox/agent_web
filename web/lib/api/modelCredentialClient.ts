import { requestJson } from "@/lib/api/jsonRequest";

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
  return requestJson(path, init, { fallbackMessage: (status) => `凭据服务请求失败：${status}`, fallbackCode: "REQUEST_FAILED", error: ({ message, code, retryable }) => new ModelCredentialClientError(message, code, retryable) });
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
