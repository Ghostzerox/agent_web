import { describe, expect, it } from "vitest";
import { documentInputSchema, normalizeDocument, splitDocument } from "@/lib/knowledge/documents";

describe("knowledge document parsing", () => {
  it("normalizes BOM/line endings and returns source line anchors without executing HTML", () => {
    const content = "\uFEFF# 标题\r\n正文<script>notExecuted()</script>\r下一行";
    expect(normalizeDocument(content)).toBe("# 标题\n正文<script>notExecuted()</script>\n下一行");
    expect(splitDocument(content)).toEqual([{ ordinal: 0, startLine: 1, endLine: 3, heading: "标题", content: normalizeDocument(content) }]);
  });
  it("splits long Unicode lines without cutting a surrogate pair or losing any character", () => {
    const content = "🙂".repeat(2300);
    const segments = splitDocument(content);
    expect(segments.map((segment) => segment.content).join("")).toBe(content);
    expect(segments.every((segment) => segment.startLine === 1 && segment.endLine === 1 && segment.content.isWellFormed())).toBe(true);
  });
  it.each(["", "   ", "\0", "x".repeat(100001)])("rejects empty/oversized/non-text input", (content) => {
    expect(documentInputSchema.safeParse({ title: "x", sourceKey: "x", format: "text", content }).success).toBe(false);
  });
  it("rejects credentials/protocol URLs, unknown fields and non-text formats", () => {
    const valid = { title: "x", sourceKey: "x", format: "text", content: "text" };
    for (const patch of [{ sourceUrl: "https://user:pass@example.com" }, { sourceUrl: "file:///secret" }, { userId: "forged" }, { format: "pdf" }]) expect(documentInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
