import { z } from "zod";
import { verifyBasicArithmetic } from "@/lib/problemSolving/arithmeticVerifier";

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
