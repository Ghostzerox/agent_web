import { describe, expect, it } from "vitest";
import {
  evaluateProactivity,
  PROACTIVITY_COPY_VERSION,
  type ProactivityEvaluationInput,
} from "@/lib/proactivity/proactivityPolicy";

function input(
  overrides: Partial<ProactivityEvaluationInput> = {},
): ProactivityEvaluationInput {
  return {
    now: new Date("2026-09-28T04:00:00.000Z"),
    enabled: true,
    pausedUntil: null,
    policy: {
      maxMessagesPerDay: 1,
      minCooldownHours: 72,
      checkinAfterDays: 3,
      allowedReasons: ["goal_followup", "checkin"],
      quietHours: {
        enabled: true,
        start: "22:00",
        end: "08:00",
        timezone: "Asia/Shanghai",
      },
    },
    sentToday: 0,
    lastContactAt: null,
    hasUnreadContact: false,
    usedTriggerKeys: new Set(),
    signals: [],
    assistantName: "知伴",
    preferredAddress: "小林",
    ...overrides,
  };
}

describe("proactivity policy", () => {
  it("creates an explainable, no-guilt follow-up from a confirmed goal", () => {
    const decision = evaluateProactivity(input({
      signals: [{ reason: "goal_followup", refId: "goal-1", content: "完成作品集" }],
    }));
    expect(decision).toMatchObject({
      status: "created",
      reason: "goal_followup",
      rationale: expect.stringContaining("已确认目标"),
    });
    if (decision.status !== "created") throw new Error("Expected contact.");
    expect(decision.body).toContain("完成作品集");
    expect(decision.body).toContain("不方便也完全没关系");
    expect(decision.body).not.toMatch(/为什么不理我|一直在等你|让我失望/u);
  });

  it("only checks in after the configured inactivity threshold", () => {
    const recent = evaluateProactivity(input({
      policy: { ...input().policy, allowedReasons: ["checkin"] },
      signals: [{
        reason: "checkin",
        refId: "message-1",
        lastUserActivityAt: new Date("2026-09-27T04:00:01.000Z"),
      }],
    }));
    expect(recent).toEqual({ status: "skipped", code: "no_signal" });

    const old = evaluateProactivity(input({
      policy: {
        ...input().policy,
        allowedReasons: ["checkin"],
        checkinAfterDays: 1,
      },
      signals: [{
        reason: "checkin",
        refId: "message-1",
        lastUserActivityAt: new Date("2026-09-27T03:59:59.000Z"),
      }],
    }));
    expect(old).toMatchObject({ status: "created", reason: "checkin" });
  });

  it.each([
    [{ enabled: false }, "disabled"],
    [{ pausedUntil: new Date("2026-09-29T00:00:00.000Z") }, "paused"],
    [{ hasUnreadContact: true }, "unread_pending"],
    [{ sentToday: 1 }, "daily_budget"],
    [{ lastContactAt: new Date("2026-09-28T03:00:00.000Z") }, "cooldown"],
  ] as const)("blocks contacts when a policy guard applies", (overrides, code) => {
    expect(evaluateProactivity(input({
      ...overrides,
      signals: [{ reason: "goal_followup", refId: "goal-1", content: "目标" }],
    }))).toEqual({ status: "skipped", code });
  });

  it("does not create contacts during quiet hours", () => {
    expect(evaluateProactivity(input({
      now: new Date("2026-09-28T15:00:00.000Z"),
      signals: [{ reason: "goal_followup", refId: "goal-1", content: "目标" }],
    }))).toEqual({ status: "skipped", code: "quiet_hours" });
  });

  it("uses the revised conversational copy while retaining a separate policy explanation", () => {
    const decision = evaluateProactivity(input({ signals: [{ reason: "checkin", refId: "message-1", lastUserActivityAt: new Date("2026-09-20T00:00:00.000Z") }] }));
    expect(PROACTIVITY_COPY_VERSION).toBe("proactivity-copy/r3.2-v1");
    expect(decision.status).toBe("created");
    if (decision.status !== "created") throw new Error("Expected contact");
    expect(decision.body).toContain("今天想随便聊聊");
    expect(decision.body).not.toContain("你开启了");
    expect(decision.body).toContain("不想回应也完全没关系");
    expect(decision.rationale).toContain("主动开启了 3 天");
    expect(decision.body).not.toMatch(/你一定|你肯定|想你|为什么不回|让我失望/u);
  });

  it("does not contact users for a disallowed or already-used reason", () => {
    const signal = { reason: "goal_followup" as const, refId: "goal-1", content: "完成作品集" };
    expect(evaluateProactivity(input({ policy: { ...input().policy, allowedReasons: ["checkin"] }, signals: [signal] }))).toEqual({ status: "skipped", code: "no_signal" });
    expect(evaluateProactivity(input({ usedTriggerKeys: new Set(["goal_followup:goal-1:2026-09-28"]), signals: [signal] }))).toEqual({ status: "skipped", code: "no_signal" });
  });
});
