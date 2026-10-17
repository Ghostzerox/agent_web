import type { TaskSchedule } from "@/lib/tasks/schedule";
import { apiFetch } from "@/lib/api/clientRuntime";

export type TaskStatus = "active" | "paused" | "completed";
export type TaskKind =
  | "reminder"
  | "agent_prompt"
  | "personal_briefing"
  | "book_recommendation"
  | "reflection_question";

export type TaskRecord = {
  localActionReminder?: { version: number; nextRunAt: string | null };
  id: string;
  title: string;
  prompt: string | null;
  kind: TaskKind;
  scheduleType: TaskSchedule["type"];
  scheduleValue: { runAt: string } | { time: string } | { weekday: number; time: string };
  timezone: string;
  nextRunAt: string | null;
  status: TaskStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  title: string;
  kind: TaskKind;
  prompt: string | null;
  schedule: TaskSchedule;
};

export class TaskClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TaskClientError";
  }
}

async function taskRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new TaskClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : `服务端请求失败：${response.status}`,
      typeof body?.error?.code === "string" ? body.error.code : "UNKNOWN_ERROR",
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as { data: T };
  return body.data;
}

export function listTasks(): Promise<TaskRecord[]> {
  return taskRequest("/api/v1/tasks");
}

export function getTask(id: string): Promise<TaskRecord> {
  return taskRequest(`/api/v1/tasks/${id}`);
}

export function createTask(input: TaskInput): Promise<TaskRecord> {
  return taskRequest("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTask(
  id: string,
  input: TaskInput & {
    status: Extract<TaskStatus, "active" | "paused">;
    expectedVersion: number;
  },
): Promise<TaskRecord> {
  return taskRequest(`/api/v1/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTask(id: string): Promise<void> {
  return taskRequest(`/api/v1/tasks/${id}`, { method: "DELETE" });
}
