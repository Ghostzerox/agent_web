import { requestJson } from "@/lib/api/jsonRequest";

export type ProactivityReason = "goal_followup" | "checkin";

export type ProactivityPreferences = {
  userId: string;
  enabled: boolean;
  maxMessagesPerDay: number;
  minCooldownHours: number;
  checkinAfterDays: number;
  allowedReasons: ProactivityReason[];
  pausedUntil: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProactivityContact = {
  id: string;
  inboxItemId: string | null;
  reason: ProactivityReason;
  rationale: string;
  createdAt: string;
  inboxStatus: "unread" | "read" | null;
};

export type ProactivityDashboard = {
  preferences: ProactivityPreferences;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: "Asia/Shanghai";
  };
  recentContacts: ProactivityContact[];
};

export type ProactivityPreferenceInput = Pick<
  ProactivityPreferences,
  | "enabled"
  | "maxMessagesPerDay"
  | "minCooldownHours"
  | "checkinAfterDays"
  | "allowedReasons"
  | "pausedUntil"
> & { expectedVersion: number };

export type ProactivityEvaluation =
  | {
      status: "created";
      reason: ProactivityReason;
      inboxItemId: string;
      rationale: string;
    }
  | {
      status: "skipped";
      code:
        | "disabled"
        | "paused"
        | "quiet_hours"
        | "unread_pending"
        | "daily_budget"
        | "cooldown"
        | "no_signal";
    };

export class ProactivityClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProactivityClientError";
  }
}

async function request<T>(init?: RequestInit): Promise<T> {
  return requestJson("/api/v1/proactivity", init, { error: ({ message, code, status }) => new ProactivityClientError(message, code, status) });
}

export function getProactivityDashboard(): Promise<ProactivityDashboard> {
  return request();
}

export function updateProactivityPreferences(
  input: ProactivityPreferenceInput,
): Promise<ProactivityDashboard> {
  return request({ method: "PATCH", body: JSON.stringify(input) });
}

export function evaluateProactivityNow(): Promise<ProactivityEvaluation> {
  return request({ method: "POST" });
}
