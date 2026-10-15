import { describe, expect, it } from "vitest";
import { previewTaskSchedule, taskPreviewConflicts } from "@/lib/tools/taskPreview";
import { inspectSourceMetadata, normalizeIsbn, normalizeSourceUrl, normalizeKnownCitationMarkers, usableSourceCitations } from "@/lib/tools/sourceTools";
import { runWorkbenchTool } from "@/lib/tools/workbench";

const now = new Date("2026-10-16T12:00:00Z");
describe("R4 task/content tools", () => {
  it("adapts known citation syntax without legitimizing unknown sources", () => {
    expect(normalizeKnownCitationMarkers("事实[^S1]，未知[^S99]", ["S1"])).toBe("事实[S1]，未知[^S99]");
    expect(normalizeKnownCitationMarkers("[^S1]: 伪造来源", ["S1"])).toBe("[^S1]: 伪造来源");
    const source = { id: "S5", title: "A", url: "https://example.org/a", snippet: "原文", source: "示例", publishedAt: null, fetchedAt: now.toISOString() };
    expect(usableSourceCitations([source, { ...source, url: source.url + "?utm_source=x" }, { ...source, url: "javascript:alert(1)" }, { ...source, url: "https://example.org/b", publishedAt: "2100-01-01" }], now)).toEqual([{ ...source, id: "S1" }]);
  });
  it("uses actual scheduler rules including equality, once and weekly boundaries", () => {
    expect(previewTaskSchedule({ type: "daily", time: "20:00" }, now).slice(0, 2)).toEqual(["2026-10-17T12:00:00.000Z", "2026-10-18T12:00:00.000Z"]);
    expect(previewTaskSchedule({ type: "weekly", weekday: 5, time: "20:00" }, now, 1)).toEqual(["2026-10-23T12:00:00.000Z"]);
    expect(previewTaskSchedule({ type: "once", runAt: "2026-10-17T12:00:00Z" }, now)).toHaveLength(1);
    expect(() => previewTaskSchedule({ type: "daily", time: "25:00" }, now)).toThrow();
    expect(() => previewTaskSchedule({ type: "once", runAt: now.toISOString() }, now)).toThrow();
    expect(previewTaskSchedule({ type: "daily", time: "20:00" }, now)).toEqual(previewTaskSchedule({ type: "daily", time: "20:00" }, now));
  });
  it("reports exact conflicts without treating them as automatic writes", () => {
    expect(taskPreviewConflicts({ title: "复习", schedule: { type: "daily", time: "20:00" } }, [{ title: "复习", schedule: { type: "daily", time: "20:00" } }, { title: "散步", schedule: { type: "daily", time: "21:00" } }], now)).toMatchObject([{ kind: "possible-duplicate", index: 0 }]);
    expect(taskPreviewConflicts({ title: "复习", schedule: { type: "daily", time: "20:00" } }, [], now)).toEqual([]);
  });
  it("normalizes sources without fetching them or erasing meaningful parameters", () => {
    expect(normalizeSourceUrl("https://example.org/a?b=2&utm_source=x&a=1#top")).toBe("https://example.org/a?a=1&b=2");
    expect(normalizeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSourceUrl("https://user:pass@example.org/a")).toBeNull();
    expect(inspectSourceMetadata([{ title: "A", url: "https://example.org/a?utm_source=x", publishedAt: null }, { title: "B", url: "https://example.org/a", publishedAt: "2100-01-01" }], now)).toMatchObject([{ warnings: ["unknown-date"], verifiedContent: false }, { warnings: ["duplicate-url", "future-date"], verifiedContent: false }]);
  });
  it("checks ISBN checksum and groups only matching title/author pairs", () => {
    expect(normalizeIsbn("978-0-306-40615-7")).toMatchObject({ valid: true });
    expect(normalizeIsbn("0-306-40615-2")).toMatchObject({ valid: true });
    expect(normalizeIsbn("9780306406158")).toMatchObject({ valid: false });
    expect(runWorkbenchTool("reading.bibliography", { books: [{ title: "《甲》", author: "乙", isbn: null }, { title: "甲", author: "乙", isbn: null }, { title: "甲", author: "丙", isbn: null }] })).toMatchObject({ books: [{ duplicateOf: null }, { duplicateOf: 0 }, { duplicateOf: null }] });
  });
});
