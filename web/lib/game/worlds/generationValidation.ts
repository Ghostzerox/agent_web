import { z } from "zod";
import { worldBlueprintSchema, type WorldBlueprint, type WorldSection, type WorldGenerationDiagnostics } from "./contracts";

// The same selected-field schema drives the model instructions and the runtime validator.
export function worldGenerationPatchSchema(sections: readonly WorldSection[]) {
  return z.object(Object.fromEntries(sections.map((key) => [key, key === "items"
    ? z.object({ definitions: z.array(z.unknown()).max(0), placements: z.array(z.unknown()).max(0) }).strict()
    : worldBlueprintSchema.shape[key]]))).strict();
}

type Failure = { success: false; stage: WorldGenerationDiagnostics["stage"]; issues: WorldGenerationDiagnostics["issues"] };
type Result = { success: true; content: WorldBlueprint; normalizedCodeFence: boolean } | Failure;
const errors = (error: z.ZodError): WorldGenerationDiagnostics["issues"] => error.issues.slice(0, 24).map((issue) => ({
  path: issue.path.map(String).join(".").slice(0, 200) || "$", message: issue.message.slice(0, 400),
}));

/** No guessing of missing facts, unsafe partial JSON repair, coercion or discarded extra fields. */
export function validateWorldGenerationOutput(raw: string, sections: readonly WorldSection[], current: WorldBlueprint | null): Result {
  if (raw.length > 50000) return { success: false, stage: "size", issues: [{ path: "$", message: "结果超过世界草稿50000字符容量；请分部分编辑，不会截断保存。" }] };
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/iu.exec(raw.trim());
  let parseText = fenced ? fenced[1].trim() : raw.trim();
  let value: unknown;
  try {
    value = JSON.parse(parseText);
    // A single encoded JSON string is a lossless transport wrapper, not permission to repair missing facts.
    if (typeof value === "string" && value.trim().startsWith("{")) { parseText = value.trim(); value = JSON.parse(parseText); }
  } catch (error) {
    const position = /position (\d+)/u.exec(error instanceof Error ? error.message : "");
    const offset = position ? Number(position[1]) : null;
    const before = offset === null ? "" : parseText.slice(0, offset);
    const location = offset === null ? "" : `第${before.split("\n").length}行第${before.length - before.lastIndexOf("\n")}列（解析文本字符${offset}）`;
    return { success: false, stage: "json", issues: [{ path: "$", message: `${location}需要完整JSON对象；请核对引号、逗号及末尾是否截断。未补造缺失字段或自动重试；可导入保存的完整JSON重新检查。` }] };
  }
  if (!value || Array.isArray(value) || typeof value !== "object") return { success: false, stage: "sections", issues: [{ path: "$", message: "顶层必须是所选部分组成的对象，不要额外包裹world、data或数组。" }] };
  const mismatch = [...Object.keys(value).filter((key) => !sections.includes(key as WorldSection)).map((key) => ({ path: key.slice(0, 200), message: "本次没有请求此部分，不能修改其他或锁定部分。" })),
    ...sections.filter((key) => !Object.hasOwn(value, key)).map((key) => ({ path: key, message: "缺少本次请求的部分，不能静默使用空白模板代替。" }))];
  if (mismatch.length) return { success: false, stage: "sections", issues: mismatch.slice(0, 24) };
  const patch = worldGenerationPatchSchema(sections).safeParse(value);
  if (!patch.success) return { success: false, stage: "schema", issues: errors(patch.error) };
  const complete = worldBlueprintSchema.safeParse({ ...current, ...patch.data });
  if (!complete.success) return { success: false, stage: "schema", issues: errors(complete.error) };
  return { success: true, content: complete.data, normalizedCodeFence: Boolean(fenced) };
}
