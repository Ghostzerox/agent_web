import { z } from "zod";
import { verifyBasicArithmetic } from "@/lib/problemSolving/arithmeticVerifier";
import { previewScheduleSchema, previewTaskSchedule, taskPreviewConflicts } from "./taskPreview";
import { inspectSourceMetadata, normalizeBookTitle, normalizeIsbn } from "./sourceTools";

export type ToolDescriptor = {
  id: string; version: string; title: string; description: string;
  allowedScopes: readonly string[]; effect: "read" | "compute" | "draft";
  maxResultBytes: number; executor: "shared-local";
};
export type WorkbenchTool = ToolDescriptor & {
  inputSchema: z.ZodType; outputSchema: z.ZodType; example: unknown;
  execute(input: unknown): unknown;
};

function tool<I extends z.ZodType, O extends z.ZodType>(
  descriptor: Omit<ToolDescriptor, "version" | "executor" | "maxResultBytes">,
  inputSchema: I, outputSchema: O, example: z.input<I>, execute: (input: z.output<I>) => z.input<O>,
): WorkbenchTool {
  return { ...descriptor, version: "r4/v1", executor: "shared-local", maxResultBytes: 48_000,
    inputSchema, outputSchema, example, execute: (input) => outputSchema.parse(execute(inputSchema.parse(input))) };
}

const line = z.string().trim().min(1).max(200);
const calculationInput = z.object({ expression: z.string().trim().min(1).max(200) }).strict();
const calculationOutput = z.object({ expression: z.string(), value: z.number().finite().nullable(), status: z.enum(["verified", "invalid"]), note: z.string() }).strict();
const evidenceInput = z.object({ document: z.string().min(1).max(30_000), query: z.string().trim().min(1).max(100) }).strict();
const evidenceOutput = z.object({ matches: z.array(z.object({ line: z.number().int(), start: z.number().int(), end: z.number().int(), excerpt: z.string().max(360) }).strict()).max(20), truncated: z.boolean(), note: z.string() }).strict();

export const WORKBENCH_TOOLS: WorkbenchTool[] = [
  tool({ id: "tasks.preview", title: "任务时间与冲突预览", description: "上海时区未来 5 次运行；重名同刻提示可能重复，不自动阻止或保存。", allowedScopes: ["tasks", "proactivity", "study"], effect: "read" },
    z.object({ title: line, schedule: previewScheduleSchema, after: z.string().datetime({ offset: true }), existing: z.array(z.object({ title: line, schedule: previewScheduleSchema }).strict()).max(100) }).strict(),
    z.object({ timezone: z.literal("Asia/Shanghai"), instants: z.array(z.string()), conflicts: z.array(z.object({ index: z.number(), title: z.string(), kind: z.enum(["possible-duplicate", "same-minute"]), instants: z.array(z.string()) }).strict()) }).strict(),
    { title: "英语复习", schedule: { type: "daily", time: "20:00" }, after: "2026-10-16T00:00:00Z", existing: [] },
    ({ title, schedule, after, existing }) => ({ timezone: "Asia/Shanghai" as const, instants: previewTaskSchedule(schedule, new Date(after)), conflicts: taskPreviewConflicts({ title, schedule }, existing, new Date(after)) })),
  tool({ id: "content.sources", title: "新闻与来源检查", description: "去除追踪参数，提示重复 URL、未知或未来日期；不代表已经访问/核实网页。", allowedScopes: ["news", "professional", "reading"], effect: "compute" },
    z.object({ now: z.string().datetime({ offset: true }), sources: z.array(z.object({ title: line, url: z.string().max(2000), publishedAt: z.string().max(100).nullable() }).strict()).max(40) }).strict(),
    z.object({ sources: z.array(z.object({ index: z.number(), title: z.string(), normalizedUrl: z.string().nullable(), warnings: z.array(z.string()), verifiedContent: z.literal(false) }).strict()).max(40) }).strict(),
    { now: "2026-10-16T00:00:00Z", sources: [{ title: "待核对来源", url: "https://example.org/article?utm_source=news", publishedAt: null }] },
    ({ sources, now }) => ({ sources: inspectSourceMetadata(sources, new Date(now)) })),
  tool({ id: "reading.bibliography", title: "书目与 ISBN 整理", description: "标题作者归一去重、ISBN 校验位检查；有效 ISBN 不等于已确认真实书目。", allowedScopes: ["reading"], effect: "compute" },
    z.object({ books: z.array(z.object({ title: line, author: line, isbn: z.string().max(40).nullable() }).strict()).max(40) }).strict(),
    z.object({ books: z.array(z.object({ title: z.string(), author: z.string(), key: z.string(), duplicateOf: z.number().nullable(), isbn: z.object({ normalized: z.string(), valid: z.boolean() }).nullable() }).strict()) }).strict(),
    { books: [{ title: "《示例书》", author: "作者甲", isbn: null }, { title: "示例书", author: "作者甲", isbn: null }] },
    ({ books }) => { const seen = new Map<string, number>(); return { books: books.map((book, index) => { const key = `${normalizeBookTitle(book.title)}|${normalizeBookTitle(book.author)}`; const duplicateOf = seen.get(key) ?? null; if (duplicateOf === null) seen.set(key, index); return { title: book.title, author: book.author, key, duplicateOf, isbn: book.isbn ? normalizeIsbn(book.isbn) : null }; }) }; }),
  tool({ id: "professional.calculate", title: "基础计算", description: "完整表达式四则运算，不执行代码；不代表整题证明。", allowedScopes: ["professional", "study"], effect: "compute" }, calculationInput, calculationOutput,
    { expression: "(12 + 3) * 4 / 2" }, ({ expression }) => {
      // Validate the entire expression, not an extracted valid substring.
      const result = /^[\d.()\s+\-*/×÷]+$/u.test(expression) ? verifyBasicArithmetic(expression, null) : null;
      return { expression, value: result?.expected ?? null, status: result?.expected !== null && result?.expected !== undefined ? "verified" as const : "invalid" as const, note: result?.note ?? "仅支持数值、括号、四则运算；未计算。" };
    }),
  tool({ id: "professional.locate-evidence", title: "材料证据定位", description: "在你提供的文本中定位原句及行号，不联网、不把片段当事实证明。", allowedScopes: ["professional", "reading", "study"], effect: "read" }, evidenceInput, evidenceOutput,
    { document: "第一段：这是一份学习记录。\n第二段：本周复习三次。", query: "复习" }, ({ document, query }) => {
      const matches: z.infer<typeof evidenceOutput>["matches"] = [];
      let offset = 0; let total = 0;
      for (const [index, text] of document.split("\n").entries()) {
        let at = text.indexOf(query);
        while (at >= 0) {
          total++;
          if (matches.length < 20) matches.push({ line: index + 1, start: offset + at, end: offset + at + query.length, excerpt: text.slice(Math.max(0, at - 100), Math.min(text.length, at + query.length + 100)) });
          at = text.indexOf(query, at + Math.max(1, query.length));
        }
        offset += text.length + 1;
      }
      return { matches, truncated: total > 20, note: "行号从 1 开始；start/end 为原始文本 UTF-16 偏移，end 不含末字符。仅匹配原文，不判定真伪。" };
    }),
];

export function runWorkbenchTool(id: string, input: unknown): unknown {
  const selected = WORKBENCH_TOOLS.find((item) => item.id === id);
  if (!selected) throw new Error("工具不存在或尚未实现。");
  const output = selected.execute(input);
  if (new TextEncoder().encode(JSON.stringify(output)).byteLength > selected.maxResultBytes) throw new Error("工具结果超过大小上限，请缩小输入。");
  return output;
}

export const toolLineSchema = line;
