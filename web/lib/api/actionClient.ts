import { apiFetch } from "./clientRuntime";
import type { ActionCommand, ActionItem, ActionSnapshot } from "@/lib/tasks/actions";
async function request<T>(path: string, command?: ActionCommand): Promise<T> {
  const response = await apiFetch(path, command ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) } : { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "行动记录请求失败，未自动重试。");
  return body.data;
}
export const actionClient = {
  load: (from: string, to: string) => request<ActionSnapshot>(`/api/v1/actions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  export: (from: string, to: string) => request<unknown>(`/api/v1/actions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&export=1`),
  mutate: (command: ActionCommand) => request<ActionItem>("/api/v1/actions", command),
};
