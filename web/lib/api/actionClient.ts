import { requestJson } from "@/lib/api/jsonRequest";
import type { ActionCommand, ActionItem, ActionSnapshot } from "@/lib/tasks/actions";
async function request<T>(path: string, command?: ActionCommand): Promise<T> {
  return requestJson(path, command ? { method: "POST", body: JSON.stringify(command) } : { cache: "no-store" },
    { fallbackMessage: "行动记录请求失败，未自动重试。" });
}
export const actionClient = {
  load: (from: string, to: string) => request<ActionSnapshot>(`/api/v1/actions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  export: (from: string, to: string) => request<unknown>(`/api/v1/actions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&export=1`),
  mutate: (command: ActionCommand) => request<ActionItem>("/api/v1/actions", command),
};
