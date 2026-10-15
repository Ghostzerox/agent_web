import { materialTransferSchema } from "@/lib/memorization/learningTools";
import { normalizeBookTitle } from "./sourceTools";

export function previewMaterialImports(payloads: readonly unknown[], existingTitles: readonly string[]) {
  const seen = new Map<string, number>();
  return payloads.map((payload, index) => {
    const parsed = materialTransferSchema.safeParse(payload);
    if (!parsed.success) return { index, valid: false, title: null, unitCount: 0, warnings: ["材料格式不符：需要 agent-web/memorization-v1、标题、原文与 1–24 个单元；不接受旧成绩或未知字段。"] };
    const material = parsed.data;
    const key = `${normalizeBookTitle(material.title)}|${material.units.map(({ cue, content }) => `${cue.length}:${cue}${content.length}:${content}`).join("|")}`;
    const warnings: string[] = [];
    const duplicate = seen.get(key);
    if (duplicate !== undefined) warnings.push(`与本批第 ${duplicate + 1} 项内容重复。`);
    else seen.set(key, index);
    if (existingTitles.some((title) => normalizeBookTitle(title) === normalizeBookTitle(material.title))) warnings.push("现有库存在同名材料；同名不等于同内容，请确认后新建。");
    return { index, valid: true, title: material.title, unitCount: material.units.length, warnings };
  });
}
