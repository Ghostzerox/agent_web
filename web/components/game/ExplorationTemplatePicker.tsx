"use client";

import { useId, useState } from "react";
import { EXPLORATION_TEMPLATES, templateKey } from "@/lib/game/exploration/templateCatalog";
import type { ExplorationTemplatePresentation } from "@/lib/game/exploration/templatePresentation";

export function ExplorationTemplatePicker({ busy, onCreate, onCancel }: {
  busy: boolean; onCreate: (template: ExplorationTemplatePresentation) => void; onCancel: () => void;
}) {
  const selectorId = useId();
  const [selectedKey, setSelectedKey] = useState(() => EXPLORATION_TEMPLATES[0] ? templateKey(EXPLORATION_TEMPLATES[0]) : "");
  const template = EXPLORATION_TEMPLATES.find((item) => templateKey(item) === selectedKey);
  return <section aria-label="探索模板选择" className="space-y-4 rounded-2xl border border-violet-300 bg-[var(--workspace-surface)] p-5">
    <h3 className="text-lg font-semibold">选择探索模板</h3>
    <p className="text-sm text-zinc-500">通用探索框架负责地图、物品、人物和分支；不同模板提供各自的世界、开场与故事规则。先了解简介，再决定是否创建独立存档。</p>
    <div>
      <label htmlFor={selectorId} className="block text-sm font-medium">探索模板</label>
      <select id={selectorId} disabled={busy} value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="mt-2 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-3">
        {EXPLORATION_TEMPLATES.map((item) => <option key={templateKey(item)} value={templateKey(item)}>{item.title} · v{item.templateVersion}</option>)}
      </select>
    </div>
    {template ? <article aria-label="所选模板简介" className="space-y-3 rounded-xl bg-[var(--workspace-bg)] p-4">
      <h4 className="font-semibold">{template.title}</h4><p className="text-sm leading-7">{template.introduction.summary}</p>
      <dl className="space-y-2 text-sm leading-6 text-zinc-500">
        <div><dt className="font-medium text-[var(--workspace-ink)]">世界背景</dt><dd>{template.introduction.setting}</dd></div>
        <div><dt className="font-medium text-[var(--workspace-ink)]">你将扮演</dt><dd>{template.introduction.playerRole}</dd></div>
        <div><dt className="font-medium text-[var(--workspace-ink)]">玩法侧重</dt><dd>{template.introduction.playStyle}</dd></div>
        <div><dt className="font-medium text-[var(--workspace-ink)]">内容规模</dt><dd>{template.introduction.scope}</dd></div>
      </dl>
      <p className="text-xs text-violet-600">{template.introduction.features.join(" · ")}</p>
      <p className="text-xs text-zinc-500">模板 {template.templateId}@{template.templateVersion} · {template.hostContract}。普通动作不调用 AI，自由叙事可选调用模型；简介不包含隐藏剧情或结局答案。</p>
    </article> : <p role="status" className="text-sm text-zinc-500">目前没有可用的探索模板。</p>}
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || !template} onClick={() => { if (template) onCreate(template); }} className="rounded-lg bg-violet-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "创建中…" : "确认创建探索存档"}</button>
      <button disabled={busy} onClick={onCancel} className="rounded-lg border border-[var(--workspace-border)] px-4 py-2 text-sm">取消</button>
    </div>
  </section>;
}
