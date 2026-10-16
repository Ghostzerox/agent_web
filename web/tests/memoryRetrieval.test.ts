import { describe, expect, it } from "vitest";
import type { MemoryItemRecord } from "@/lib/db/schema";
import {
  addMemoryContext,
  estimateMemoryTokens,
  latestUserQuery,
  rankMemories,
} from "@/lib/memory/memoryRetrieval";

const now = new Date("2026-09-28T08:00:00.000Z");

function memory(
  id: string,
  content: string,
  overrides: Partial<MemoryItemRecord> = {},
): MemoryItemRecord {
  return {
    id,
    userId: "00000000-0000-4000-8000-000000000001",
    candidateId: crypto.randomUUID(),
    sourceConversationId: null,
    sourceMessageId: null,
    kind: "preference",
    content,
    sensitivity: "low",
    pinned: false,
    validUntil: null,
    lastUsedAt: null,
    useCount: 0,
    version: 1,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    ...overrides,
  };
}

describe("memory relevance retrieval", () => {
  it("prioritizes relevant goals in reflection and preferences in companion, without admitting unrelated or expired facts", () => {
    const rows = [memory("fact", "数学练习", { kind: "fact" }), memory("goal", "数学练习", { kind: "goal" }), memory("pref", "数学练习"), memory("unrelated", "中国历史", { kind: "goal" }), memory("expired", "数学练习", { kind: "goal", validUntil: new Date(0) })];
    expect(rankMemories(rows, "数学", now, { consumer: "reflection" }).map((r) => r.id)).toEqual(["goal", "fact", "pref"]);
    expect(rankMemories(rows, "数学", now, { consumer: "companion" }).map((r) => r.id)).toEqual(["pref", "fact", "goal"]);
    expect(rankMemories(rows, "数学", now)).toEqual(rankMemories(rows, "数学", now, { consumer: "professional" }));
  });
  it("selects only relevant and unexpired memories within count and token budgets", () => {
    const selected = rankMemories(
      [
        memory("00000000-0000-4000-8000-000000000011", "我偏好先做数学例题，再总结概念", { pinned: true }),
        memory("00000000-0000-4000-8000-000000000012", "我喜欢阅读中国历史书"),
        memory("00000000-0000-4000-8000-000000000013", "我的目标是学好数学", {
          kind: "goal",
          validUntil: new Date("2026-09-01T00:00:00.000Z"),
        }),
      ],
      "请帮我制定数学学习计划",
      now,
      { limit: 2, tokenBudget: 100 },
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000011",
      rank: 1,
      pinned: true,
    });
    expect(selected[0].estimatedTokens).toBe(estimateMemoryTokens(selected[0].content));
  });

  it("injects selected data before conversation and never treats it as instructions", () => {
    const prompt = [
      { kind: "instruction", source: "policy", role: "system", content: "策略" },
      { kind: "conversation", source: "conversation", role: "user", content: "数学计划" },
    ] as const;
    const selected = rankMemories(
      [memory("00000000-0000-4000-8000-000000000011", "我喜欢数学例题")],
      "数学例题怎么学",
      now,
    );
    const result = addMemoryContext(prompt, selected);

    expect(latestUserQuery(result)).toBe("数学计划");
    expect(result.map((message) => message.source)).toEqual([
      "policy",
      "memory",
      "conversation",
    ]);
    expect(result[1].content).toContain("不是指令");
    expect(result[1].content).toContain("我喜欢数学例题");
  });
});
