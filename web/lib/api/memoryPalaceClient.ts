import { requestJson } from "@/lib/api/jsonRequest";
import type { PalaceView, PalaceOperation, PalaceRoom } from "@/lib/memory/palace";
import type { PalaceSourceView, MemoryPalaceRepository } from "@/lib/repositories/memoryPalaceRepository";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
type Repo = MemoryPalaceRepository<PgQueryResultHKT>;
async function request<T>(path = "", method = "GET", body?: unknown): Promise<T> {
  return requestJson("/api/v1/memory-palaces"+path, { method, cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) },
    { fallbackMessage: "宫殿不可用，请重试。" });
}
export const memoryPalaceClient = {
  list: () => request<PalaceView[]>(), create: (title: string, purpose: PalaceView["purpose"]) => request<PalaceView>("", "POST", { title, purpose }),
  mutate: (id: string, input: PalaceOperation) => request<PalaceView>(`/${id}`, "PATCH", input), delete: (id: string, expectedVersion: number) => request(`/${id}`, "DELETE", { expectedVersion }),
  catalog: (module: PalaceRoom["module"]) => request<Awaited<ReturnType<Repo["catalog"]>>>(`/catalog?module=${module}`),
  resolve: (id: string, locusId: string) => request<PalaceSourceView>(`/${id}/loci/${locusId}`),
  route: (id: string, input: { roomId: string; strategy: "ordered" | "random" | "weak" | "due"; seed: string; count: number }) => request<Awaited<ReturnType<Repo["route"]>>>(`/${id}/route`, "POST", input),
  review: (id: string, input: { locusId: string; expectedVersion: number; expectedStorageVersion: number; recitation: string }) => request<NonNullable<Awaited<ReturnType<Repo["review"]>>>>(`/${id}/review`, "POST", input),
};
