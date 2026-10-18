import { requestJson } from "@/lib/api/jsonRequest";
import type { z } from "zod";
import type { spellingOptionsSchema } from "@/lib/memorization/spelling";
import type {
  MemorizationMaterial,
  MemorizationMaterialSummary,
  MemorizationUnitInput,
} from "@/lib/memorization/domain";
import type { MemorizationReviewResult } from "@/lib/memorization/domain";

export class MemorizationClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MemorizationClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson(path, init, { error: ({ message, code, status }) => new MemorizationClientError(message, code, status) });
}

export function listMemorizationMaterials(): Promise<MemorizationMaterialSummary[]> {
  return request("/api/v1/memorization");
}

export function createMemorizationMaterial(input: {
  title: string;
  sourceText: string;
  units: MemorizationUnitInput[];
}): Promise<{ material: MemorizationMaterial; storageVersion: number }> {
  return request("/api/v1/memorization", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getMemorizationMaterial(id: string): Promise<{
  material: MemorizationMaterial;
  storageVersion: number;
}> {
  return request(`/api/v1/memorization/${encodeURIComponent(id)}`);
}

export function updateMemorizationMaterial(id: string, input: { title: string; sourceText: string; units: MemorizationUnitInput[]; expectedVersion: number }): Promise<{ material: MemorizationMaterial; storageVersion: number }> {
  return request(`/api/v1/memorization/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteMemorizationMaterial(
  id: string,
  expectedVersion: number,
): Promise<void> {
  return request(`/api/v1/memorization/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function reviewMemorizationUnit(
  materialId: string,
  input: { unitId: string; recitation: string; expectedVersion: number; mode?: "semantic" | "verbatim"; spellingOptions?: z.input<typeof spellingOptionsSchema> },
): Promise<MemorizationReviewResult> {
  return request(`/api/v1/memorization/${encodeURIComponent(materialId)}/review`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
