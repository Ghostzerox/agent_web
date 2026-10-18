import { requestJson } from "@/lib/api/jsonRequest";

import type { MemoryCandidateKind, MemoryCandidateStatus, MemorySensitivity } from "@/lib/memory/types";

export type MemoryCandidate = {
  id: string;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  kind: MemoryCandidateKind;
  content: string;
  evidenceQuote: string;
  sensitivity: MemorySensitivity;
  confidence: number;
  reason: string;
  status: MemoryCandidateStatus;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export class MemoryCandidateClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MemoryCandidateClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson(path, init, { error: ({ message, code, status }) => new MemoryCandidateClientError(message, code, status) });
}

export function listMemoryCandidates(
  filter: "all" | MemoryCandidateStatus = "all",
): Promise<MemoryCandidate[]> {
  return request(`/api/v1/memory-candidates?filter=${encodeURIComponent(filter)}`);
}

export function extractMemoryCandidateFromMessage(input: {
  conversationId: string;
  messageId: string;
}): Promise<{ candidate: MemoryCandidate | null; created: boolean }> {
  return request("/api/v1/memory-candidates/extract", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmMemoryCandidate(
  id: string,
  content: string,
  expectedVersion: number,
): Promise<MemoryCandidate> {
  return request(`/api/v1/memory-candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "confirm", content, expectedVersion }),
  });
}

export function rejectMemoryCandidate(
  id: string,
  expectedVersion: number,
): Promise<MemoryCandidate> {
  return request(`/api/v1/memory-candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "reject", expectedVersion }),
  });
}
