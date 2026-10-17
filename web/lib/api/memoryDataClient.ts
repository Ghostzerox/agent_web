import { apiFetch } from "./clientRuntime";
import type { MemoryControlView, MemoryControls } from "@/lib/memory/controls";
import type { MemoryManifest, MemoryPackage } from "@/lib/memory/archive";
import type { createMemoryDataRepository } from "@/lib/repositories/memoryDataRepository";
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await apiFetch(`/api/v1/memory-data/${path}`, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  const parsed = await response.json().catch(() => null);
  if (!response.ok) throw new Error(parsed?.error?.message ?? "无法连接服务端，操作未确认成功，请刷新核对后再试。");
  return parsed.data;
}
export const memoryDataClient = {
  manifest: () => request<MemoryManifest>("manifest"), controls: () => request<MemoryControlView>("controls"),
  saveControls: (settings: MemoryControls, expectedVersion: number) => request<MemoryControlView>("controls", "PATCH", { settings, expectedVersion }),
  export: (selection: { memories: boolean; palaces: boolean; collectionIds: string[] }) => request<MemoryPackage>("export", "POST", selection),
  usage: () => request<Awaited<ReturnType<ReturnType<typeof createMemoryDataRepository>["usage"]>>>("usage"),
};
