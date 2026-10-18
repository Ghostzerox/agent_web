import { requestJson } from "@/lib/api/jsonRequest";
import type { MemoryControlView, MemoryControls } from "@/lib/memory/controls";
import type { MemoryManifest, MemoryPackage } from "@/lib/memory/archive";
import type { MemoryUsageRecord } from "@/lib/memory/controls";
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return requestJson("/api/v1/memory-data/"+path, { method, cache: "no-store", ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    { fallbackMessage: "无法连接服务端，操作未确认成功，请刷新核对后再试。" });
}
export const memoryDataClient = {
  manifest: () => request<MemoryManifest>("manifest"), controls: () => request<MemoryControlView>("controls"),
  saveControls: (settings: MemoryControls, expectedVersion: number) => request<MemoryControlView>("controls", "PATCH", { settings, expectedVersion }),
  export: (selection: { memories: boolean; palaces: boolean; collectionIds: string[] }) => request<MemoryPackage>("export", "POST", selection),
  usage: () => request<MemoryUsageRecord[]>("usage"),
};
