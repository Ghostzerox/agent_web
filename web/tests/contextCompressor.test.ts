import { describe, expect, it } from "vitest";
import { compress, COMPRESSION_THRESHOLD } from "@/lib/agent/contextCompressor";

describe("context compressor memory boundary", () => {
  it("never turns user questions into long-term memory", () => {
    const messages = Array.from({ length: COMPRESSION_THRESHOLD }, (_, index) => ({
      id: `message-${index}`,
      parentId: index === 0 ? null : `message-${index - 1}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: index % 2 === 0 ? `我应该怎样解决问题 ${index}？` : "这是回答。",
      createdAt: index,
    }));
    const result = compress(messages);
    expect(result.summary).toBe("");
    expect(result.memoryItems).toEqual([]);
  });
});
