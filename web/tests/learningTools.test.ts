import { describe, expect, it } from "vitest";
import { checkSpelling } from "@/lib/memorization/spelling";
import { sampleRecallUnits, materialTransferSchema } from "@/lib/memorization/learningTools";
import type { MemorizationUnit } from "@/lib/memorization/domain";

const units: MemorizationUnit[] = Array.from({ length: 8 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, cue: `单元 ${i}`, content: "内容", reviewCount: i ? 1 : 0, lastScore: i ? 100 - i * 10 : null, nextReviewAt: i ? `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z` : null, weakPoints: [] }));
describe("R4 learning tools", () => {
  it("detects insertion, omission and replacement at original positions", () => {
    expect(checkSpelling("abcd", "abXd")).toMatchObject({ distance: 1, changes: [{ kind: "replace", expected: "c", actual: "X", targetStart: 2, actualStart: 2 }] });
    expect(checkSpelling("abcd", "acd")).toMatchObject({ changes: [{ kind: "delete", expected: "b", actual: "" }] });
    expect(checkSpelling("acd", "abcd")).toMatchObject({ changes: [{ kind: "insert", expected: "", actual: "b" }] });
    expect(checkSpelling("😀ab", "😀aX").changes[0]).toMatchObject({ targetStart: 3, actualStart: 3 });
    expect(checkSpelling("", "")).toMatchObject({ exact: true, score: 100 });
  });
  it("preserves strict defaults and offers explicit case/punctuation/whitespace rules", () => {
    expect(checkSpelling("Hello, world!", "hello world").exact).toBe(false);
    expect(checkSpelling("Hello, world!", "hello world", { caseSensitive: false, ignorePunctuation: true }).exact).toBe(true);
    expect(checkSpelling("A B", "AB", { ignoreWhitespace: true }).exact).toBe(true);
    expect(checkSpelling("a".repeat(70), "b".repeat(70))).toMatchObject({ distance: 70, truncated: true, changes: expect.any(Array) });
    expect(checkSpelling("a".repeat(70), "b".repeat(70)).changes).toHaveLength(60);
    expect(() => checkSpelling("a".repeat(2001), "a")).toThrow();
    expect(() => checkSpelling("A", "a", { ignored: true })).toThrow();
  });
  it("selects unique reproducible rounds and explains weak/due priority", () => {
    const now = new Date("2026-10-16T00:00:00Z");
    const random = sampleRecallUnits(units, "random", "round1", now, 8);
    expect(new Set(random.map((item) => item.unitId)).size).toBe(8);
    expect(sampleRecallUnits(units, "random", "round1", now, 8)).toEqual(random);
    expect(sampleRecallUnits(units, "random", "round2", now, 8)).not.toEqual(random);
    expect(sampleRecallUnits(units, "weak", "round1", now, 2).map((item) => item.unitId)).toEqual([units[0].id, units[7].id]);
    expect(sampleRecallUnits(units, "due", "round1", now, 2).map((item) => item.unitId)).toEqual([units[0].id, units[1].id]);
    expect(sampleRecallUnits([], "random", "round", now, 1)).toEqual([]);
  });
  it("does not import executable or stale review state as material content", () => {
    expect(materialTransferSchema.safeParse({ format: "agent-web/memorization-v1", title: "A", sourceText: "B", units: [{ cue: "C", content: "B" }] }).success).toBe(true);
    expect(materialTransferSchema.safeParse({ format: "agent-web/memorization-v1", title: "A", sourceText: "B", units: [{ cue: "C", content: "B", reviewCount: 99 }] }).success).toBe(false);
  });
});
