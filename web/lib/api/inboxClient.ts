import { requestJson } from "@/lib/api/jsonRequest";

export type InboxStatus = "unread" | "read";
export type InboxFilter = "all" | InboxStatus;
export type BriefingFeedback = "helpful" | "not_relevant" | "duplicate";

export type BriefingSourceSignal = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  urlKey: string;
  titleKey: string;
};

export type ReflectionQuestionSignal = {
  question: string;
  type: "assumption" | "evidence" | "tradeoff" | "alternative" | "future" | "action";
  why: string;
  scores: {
    relevance: number;
    novelty: number;
    actionability: number;
    emotionalLoad: number;
    total: number;
  };
  candidateCount: number;
};

export type InboxItem = {
  id: string;
  taskId: string | null;
  taskRunId: string | null;
  source:
    | "reminder"
    | "agent_prompt"
    | "personal_briefing"
    | "book_recommendation"
    | "reflection_question"
    | "proactive_checkin";
  title: string;
  body: string | null;
  briefingSources: BriefingSourceSignal[] | null;
  reflectionQuestions: ReflectionQuestionSignal[] | null;
  proactivityReason: ProactivityReason | null;
  proactivityRationale: string | null;
  feedback: BriefingFeedback | null;
  occurredAt: string;
  status: InboxStatus;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProactivityReason = "goal_followup" | "checkin";

export class InboxClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "InboxClientError";
  }
}

async function inboxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson(path, init, { error: ({ message, code, status }) => new InboxClientError(message, code, status) });
}

export function listInboxItems(filter: InboxFilter = "all"): Promise<InboxItem[]> {
  return inboxRequest(`/api/v1/inbox?filter=${encodeURIComponent(filter)}`);
}

export function updateInboxStatus(
  id: string,
  status: InboxStatus,
): Promise<InboxItem> {
  return inboxRequest(`/api/v1/inbox/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateBriefingFeedback(
  id: string,
  feedback: BriefingFeedback | null,
): Promise<InboxItem> {
  return inboxRequest(`/api/v1/inbox/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ feedback }),
  });
}

export function deleteInboxItem(id: string): Promise<void> {
  return inboxRequest(`/api/v1/inbox/${id}`, { method: "DELETE" });
}
