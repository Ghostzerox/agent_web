import { z } from "zod";

export const KNOWLEDGE_MODULES = ["professional", "reflection", "news", "reading", "tasks", "memorization", "problem-solving", "game"] as const;
export const KNOWLEDGE_MODULE_LABELS: Record<typeof KNOWLEDGE_MODULES[number], string> = { professional: "专业问答", reflection: "反思", news: "新闻", reading: "阅读", tasks: "任务", memorization: "背书", "problem-solving": "解题", game: "娱乐规则" };
export const collectionInputSchema = z.object({ title: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(""), module: z.enum(KNOWLEDGE_MODULES) }).strict();
export const documentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sourceKey: z.string().trim().min(1).max(120),
  format: z.enum(["text", "markdown"]),
  content: z.string().min(1).max(100_000).refine((value) => value.trim().length > 0 && !value.includes("\0") && new TextEncoder().encode(value).length <= 300_000, "请输入非空 UTF-8 文本（最多 100,000 字符/300 KB，无 NUL）。"),
  sourceUrl: z.string().max(2000).refine((value) => { if (!value) return true; try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }, "来源网址须为 HTTP(S)，不含凭据。").default(""),
  fileName: z.string().trim().max(200).default(""),
}).strict();
export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type DocumentInput = z.infer<typeof documentInputSchema>;
export const KNOWLEDGE_CHUNK_STRATEGY = "lines/r5.2-v1";
export type DocumentSegment = { ordinal: number; content: string; startLine: number; endLine: number; heading: string };

/** Line anchors are against normalized stored text. HTML is never executed. No model/network. */
export function normalizeDocument(content: string): string { return content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n"); }
export function splitDocument(raw: string): DocumentSegment[] {
  const lines = normalizeDocument(raw).split("\n");
  const result: DocumentSegment[] = [];
  let buffer = ""; let start = 1; let end = 1; let heading = ""; let currentHeading = "";
  const flush = () => { if (buffer.trim()) result.push({ ordinal: result.length, content: buffer, startLine: start, endLine: end, heading }); buffer = ""; };
  lines.forEach((line, index) => {
    if (/^#{1,6}\s/u.test(line)) { flush(); currentHeading = line.replace(/^#{1,6}\s+/u, "").slice(0, 200); }
    // Very long lines are split without losing their original line locator.
    const characters = Array.from(line);
    for (let offset = 0; offset < Math.max(characters.length, 1); offset += 1800) {
      const part = characters.slice(offset, offset + 1800).join("");
      if (buffer && buffer.length + part.length + 1 > 1800) flush();
      if (!buffer) { start = index + 1; heading = currentHeading; }
      buffer += (buffer ? "\n" : "") + part; end = index + 1;
      if (characters.length > 1800) flush();
    }
  });
  flush();
  return result;
}
