"use client";
import { useState } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import type { WorldDraft } from "@/lib/api/gameWorldClient";
import type { WorldBlueprint, WorldGenerationDiagnostics } from "@/lib/game/worlds/contracts";
import { validateWorldGenerationOutput } from "@/lib/game/worlds/generationValidation";
import { WORLD_SECTION_LABELS } from "@/lib/game/worlds/blueprint";
import { buttonClass as worldButtonClass, fieldClass as worldFieldClass, useConfirmAction } from "@/components/ui/Actions";

export function WorldGenerationRecovery({ diagnostics, draft, disabled, onApply, onDiscard }: {
  diagnostics: WorldGenerationDiagnostics; draft: WorldDraft; disabled: boolean;
  onApply: (content: WorldBlueprint) => void; onDiscard: () => void;
}) {
  const { confirm, confirmation } = useConfirmAction();
  const [raw, setRaw] = useState(diagnostics.rawOutput);
  const [issues, setIssues] = useState(diagnostics.issues);
  const stale = diagnostics.worldId !== draft.id || diagnostics.expectedVersion !== draft.version || diagnostics.sections.some((key) => draft.lockedSections.includes(key));
  useNavigationGuard(raw !== diagnostics.rawOutput, "失败结果的JSON修正尚未应用；请先应用或复制到本地，再离开。");
  return <section aria-label="检查与修正生成结果" className="space-y-3 rounded-xl border border-amber-300 p-4">
    {confirmation}<h3 className="font-semibold">本次结果未保存，原草稿保留</h3>
    <p className="text-xs text-zinc-500">范围：{diagnostics.sections.map((key) => WORLD_SECTION_LABELS[key]).join("、")} · 请求 {diagnostics.requestId.slice(0, 8)}。以下内容仅保留在当前页面，不进日志或浏览器存储；刷新前请先复制。检查与手动修正不调用AI，不收费。</p>
    <ul className="list-disc space-y-1 pl-5 text-sm [overflow-wrap:anywhere]" aria-label="生成结构问题">{issues.map((issue, index) => <li key={index}><code>{issue.path}</code>：{issue.message}</li>)}</ul>
    <details><summary className="cursor-pointer text-sm">展开本次原始结果并手动修正</summary><label className="mt-3 block text-xs">本次生成结果JSON<textarea className={`${worldFieldClass} font-mono`} rows={16} value={raw} onChange={(event) => setRaw(event.target.value)} /></label></details>
    <p className="text-xs text-zinc-500">{stale ? "草稿版本或锁定范围已改变，此结果不能直接应用。请先复制保留并核对新草稿。" : disabled ? "请先应用 / 放弃其他未提交的JSON并保存草稿，再处理此结果。" : "修正后点击检查；通过才放入当前表单，之后仍需手动保存，不会发布或改动存档。"}</p>
    <div className="flex flex-wrap gap-2"><button className={worldButtonClass} disabled={disabled || stale || !diagnostics.rawComplete} onClick={() => {
      const result = validateWorldGenerationOutput(raw, diagnostics.sections, draft.content);
      if (!result.success) { setIssues(result.issues); return; }
      onApply(result.content);
    }}>检查并应用</button>
      <button className={worldButtonClass} disabled={disabled} onClick={async () => { if (await confirm({ title: "丢弃失败结果？", description: "只移除当前页面的结果，原草稿不变。已用API费用不退。", confirmLabel: "丢弃结果", danger: true })) onDiscard(); }}>丢弃结果</button></div>
  </section>;
}
