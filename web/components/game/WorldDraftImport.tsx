"use client";
import { useState } from "react";
import { Button, Feedback, fieldClass, useConfirmAction } from "@/components/ui/Actions";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import type { WorldDraft } from "@/lib/api/gameWorldClient";
import { WORLD_SECTIONS, type WorldBlueprint } from "@/lib/game/worlds/contracts";
import { validateWorldGenerationOutput } from "@/lib/game/worlds/generationValidation";
import { changedWorldSections } from "@/lib/game/worlds/blueprint";
import { worldDraftIssues } from "@/lib/game/worlds/compile";

/** Local recovery of a saved generation response, not a second model call or an automatic save. */
export function WorldDraftImport({ draft, disabled, onApply, onClose }: {
  draft: WorldDraft; disabled: boolean; onApply: (content: WorldBlueprint) => void; onClose: () => void;
}) {
  const [raw, setRaw] = useState(""); const [error, setError] = useState(""); const [reading, setReading] = useState(false);
  const { confirm, confirmation } = useConfirmAction();
  useNavigationGuard(Boolean(raw), "导入的生成结果尚未应用，请先应用或关闭恢复面板。");
  const apply = () => {
    if (draft.content?.items.definitions.length) { setError("当前世界已有道具定义，不能用世界生成结果覆盖。请保留现有道具，通过分区编辑修正世界，或在新的世界草稿恢复此文件。"); return; }
    const result = validateWorldGenerationOutput(raw, [...WORLD_SECTIONS], draft.content);
    if (!result.success) { setError(result.issues.map((issue) => `${issue.path}：${issue.message}`).join("；")); return; }
    if (draft.lockedSections.length && (!draft.content || changedWorldSections(draft.content, result.content, draft.lockedSections).length)) {
      setError("文件会改动受保护部分。请先关闭恢复面板，核对保护设置并保存；不会自动解除保护。"); return;
    }
    const issues = worldDraftIssues(draft.input, result.content);
    if (issues.length) { setError(issues.join("；")); return; }
    onApply(result.content);
  };
  return <section aria-label="从文件恢复草稿" className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4">
    {confirmation}<h3 className="font-semibold">从文件恢复生成结果</h3>
    <p className="text-sm text-[var(--workspace-muted)]">选择保存的完整生成结果（JSON / 文本），或粘贴到下方。只在本机检查，不调用AI。通过后替换表单中的世界生成部分；独立道具、卡池与事件设计保留，之后仍需手动保存。不是发布，也不改变已有旅程。</p>
    <Feedback error={error} />
    <label className="block text-sm">生成结果文件<input className={fieldClass} type="file" accept=".json,.txt,application/json,text/plain" disabled={disabled || reading} onChange={async (event) => {
      const file = event.target.files?.[0]; if (!file) return;
      if (file.size > 200000) { setError("文件过大，请选择完整的世界生成结果，而非聊天或日志导出。"); return; }
      setReading(true);
      try { setRaw(await file.text()); setError(""); } catch { setError("文件读取失败，请直接粘贴内容。"); }
      finally { setReading(false); }
    }} /></label>
    <label className="block text-sm">完整生成结果JSON<textarea className={`${fieldClass} font-mono`} rows={10} value={raw} disabled={disabled || reading} onChange={(event) => setRaw(event.target.value)} /></label>
    {disabled && <p className="text-sm">请先保存或放弃其他表单编辑，再恢复生成结果。</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={disabled || reading || !raw.trim()} onClick={apply}>检查并放入表单</Button>
      <Button variant="quiet" disabled={reading} onClick={async () => {
        if (!raw || await confirm({ title: "关闭恢复面板？", description: "未应用的内容不会保存，原草稿不变。", confirmLabel: "关闭面板" })) onClose();
      }}>关闭恢复面板</Button></div>
  </section>;
}
