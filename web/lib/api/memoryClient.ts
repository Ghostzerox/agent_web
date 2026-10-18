import { requestJson } from "@/lib/api/jsonRequest";
import type { MemoryCandidateKind, MemorySensitivity } from "@/lib/api/memoryCandidateClient";

export type MemoryItem = {
  id: string;
  candidateId: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  kind: MemoryCandidateKind;
  content: string;
  evidenceQuote: string;
  sensitivity: MemorySensitivity;
  pinned: boolean;
  validUntil: string | null;
  lastUsedAt: string | null;
  useCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export class MemoryClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MemoryClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson(path, init, { error: ({ message, code, status }) => new MemoryClientError(message, code, status) });
}

export function listMemories(): Promise<MemoryItem[]> {
  return request("/api/v1/memories");
}

export function updateMemory(
  id: string,
  input: {
    content: string;
    kind: MemoryCandidateKind;
    pinned: boolean;
    validUntil: string | null;
    expectedVersion: number;
    clearSourceEvidence?: boolean;
  },
): Promise<MemoryItem> {
  return request(`/api/v1/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMemory(id: string, expectedVersion: number): Promise<void> {
  await request(`/api/v1/memories/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}
