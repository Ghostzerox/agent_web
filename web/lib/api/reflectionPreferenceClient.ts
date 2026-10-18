import { requestJson } from "@/lib/api/jsonRequest";

export type ReflectionStyle = "gentle" | "balanced" | "challenging";

export type ReflectionPreference = {
  userId: string;
  enabled: boolean;
  goals: string[];
  avoidTopics: string[];
  style: ReflectionStyle;
  maxQuestions: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ReflectionPreferenceInput = Omit<
  ReflectionPreference,
  "userId" | "version" | "createdAt" | "updatedAt"
> & { expectedVersion: number };

export class ReflectionPreferenceClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReflectionPreferenceClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  return requestJson("/api/v1/reflection-preferences", init, { error: ({ message, code, status }) => new ReflectionPreferenceClientError(message, code, status) });
}

export function getReflectionPreference(): Promise<ReflectionPreference> {
  return request();
}

export function updateReflectionPreference(
  input: ReflectionPreferenceInput,
): Promise<ReflectionPreference> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}
