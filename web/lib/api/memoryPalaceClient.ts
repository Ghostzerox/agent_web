import { requestJson } from "@/lib/api/jsonRequest";
import type { PalaceView, PalaceOperation, PalaceRoom } from "@/lib/memory/palace";
import type { PalaceSourceView, PalaceCatalog, PalaceRecallPlan } from "@/lib/memory/palace";
import type { MemorizationReviewResult } from "@/lib/memorization/domain";
async function request<T>(path = "", method = "GET", body?: unknown): Promise<T> {
  return requestJson("/api/v1/memory-palaces"+path, { method, cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) },
    { fallbackMessage: "宫殿不可用，请重试。" });
}
export const memoryPalaceClient = {
  list: () => request<PalaceView[]>(), create: (title: string, purpose: PalaceView["purpose"]) => request<PalaceView>("", "POST", { title, purpose }),
  mutate: (id: string, input: PalaceOperation) => request<PalaceView>(`/${id}`, "PATCH", input), delete: (id: string, expectedVersion: number) => request(`/${id}`, "DELETE", { expectedVersion }),
  catalog: (module: PalaceRoom["module"]) => request<PalaceCatalog>(`/catalog?module=${module}`),
  resolve: (id: string, locusId: string) => request<PalaceSourceView>(`/${id}/loci/${locusId}`),
  route: (id: string, input: { roomId: string; strategy: "ordered" | "random" | "weak" | "due"; seed: string; count: number }) => request<PalaceRecallPlan>(`/${id}/route`, "POST", input),
  review: (id: string, input: { locusId: string; expectedVersion: number; expectedStorageVersion: number; recitation: string }) => request<MemorizationReviewResult>(`/${id}/review`, "POST", input),
};
