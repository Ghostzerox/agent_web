import type {
  ProactivityPolicySnapshot,
  ProactivityReason,
} from "@/lib/db/schema";
import { nextAllowedPushAt } from "@/lib/notifications/quietHours";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
export const PROACTIVITY_COPY_VERSION = "proactivity-copy/r3.2-v1" as const;

export type ProactivitySignal = {
  reason: ProactivityReason;
  refId: string;
  content?: string;
  lastUserActivityAt?: Date;
};

export type ProactivityDecision =
  | {
      status: "created";
      reason: ProactivityReason;
      triggerKey: string;
      triggerRefId: string;
      title: string;
      body: string;
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

export type ProactivityEvaluationInput = {
  now: Date;
  enabled: boolean;
  pausedUntil: Date | null;
  policy: ProactivityPolicySnapshot;
  sentToday: number;
  lastContactAt: Date | null;
  hasUnreadContact: boolean;
  usedTriggerKeys: ReadonlySet<string>;
  signals: readonly ProactivitySignal[];
  assistantName: string;
  preferredAddress: string | null;
};

export function shanghaiDayKey(instant: Date): string {
  return new Date(instant.getTime() + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function shanghaiDayStart(instant: Date): Date {
  const shifted = new Date(instant.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - SHANGHAI_OFFSET_MS,
  );
}

function compact(value: string, maximum = 180): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function greeting(input: ProactivityEvaluationInput): string {
  return input.preferredAddress?.trim()
    ? `${compact(input.preferredAddress, 30)}，`
    : "";
}

function triggerKey(signal: ProactivitySignal, now: Date): string {
  return `${signal.reason}:${signal.refId}:${shanghaiDayKey(now)}`;
}

export function evaluateProactivity(
  input: ProactivityEvaluationInput,
): ProactivityDecision {
  if (!input.enabled) return { status: "skipped", code: "disabled" };
  if (input.pausedUntil && input.pausedUntil.getTime() > input.now.getTime()) {
    return { status: "skipped", code: "paused" };
  }
  if (
    nextAllowedPushAt(input.now, {
      quietHoursEnabled: input.policy.quietHours.enabled,
      quietStart: input.policy.quietHours.start,
      quietEnd: input.policy.quietHours.end,
      timezone: input.policy.quietHours.timezone,
    }).getTime() > input.now.getTime()
  ) {
    return { status: "skipped", code: "quiet_hours" };
  }
  if (input.hasUnreadContact) {
    return { status: "skipped", code: "unread_pending" };
  }
  if (input.sentToday >= input.policy.maxMessagesPerDay) {
    return { status: "skipped", code: "daily_budget" };
  }
  const cooldownMs = input.policy.minCooldownHours * 60 * 60_000;
  if (
    input.lastContactAt &&
    input.now.getTime() - input.lastContactAt.getTime() < cooldownMs
  ) {
    return { status: "skipped", code: "cooldown" };
  }

  const dayKey = shanghaiDayKey(input.now);
  const signal = input.signals.find((candidate) => {
    if (!input.policy.allowedReasons.includes(candidate.reason)) return false;
    if (input.usedTriggerKeys.has(triggerKey(candidate, input.now))) return false;
    if (candidate.reason !== "checkin") return Boolean(candidate.content?.trim());
    if (!candidate.lastUserActivityAt) return false;
    return (
      input.now.getTime() - candidate.lastUserActivityAt.getTime() >=
      input.policy.checkinAfterDays * 24 * 60 * 60_000
    );
  });
  if (!signal) return { status: "skipped", code: "no_signal" };

  const prefix = greeting(input);
  if (signal.reason === "goal_followup") {
    const goal = compact(signal.content ?? "");
    return {
      status: "created",
      reason: signal.reason,
      triggerKey: `goal_followup:${signal.refId}:${dayKey}`,
      triggerRefId: signal.refId,
      title: `${compact(input.assistantName, 30)}的目标问候`,
      body: `${prefix}你之前确认的目标是：“${goal}”。今天想继续一点，还是先歇歇？如果愿意，我们可以只挑一个几分钟能做的小步骤；现在不方便也完全没关系。`,
      rationale: "因为你开启了“已确认目标跟进”，并且这项目标仍然有效。",
    };
  }
  return {
    status: "created",
    reason: signal.reason,
    triggerKey: `checkin:${signal.refId}:${dayKey}`,
    triggerRefId: signal.refId,
    title: `${compact(input.assistantName, 30)}的温和问候`,
    body: `${prefix}来和你打个招呼。今天想随便聊聊，还是说说最近在做的事？不需要准备好话题，现在不想回应也完全没关系。`,
    rationale: `因为你主动开启了 ${input.policy.checkinAfterDays} 天未互动后的温和问候。`,
  };
}
