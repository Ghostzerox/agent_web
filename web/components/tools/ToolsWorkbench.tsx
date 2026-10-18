"use client";

import { useState } from "react";
import { WORKBENCH_TOOLS, runWorkbenchTool } from "@/lib/tools/workbench";
import { AppLink } from "@/components/platform/AppLink";
import { z } from "zod";
import { taskDraftResultSchema } from "@/lib/plugins/pluginApiV1";
import { createTask } from "@/lib/api/taskClient";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";

export function ToolsWorkbench({ toolIds }: { toolIds?: readonly string[] } = {}) {
  const tools = WORKBENCH_TOOLS.filter((tool) => !toolIds || toolIds.includes(tool.id));
  return tools.length ? <Workbench key={tools.map((tool) => tool.id).join(",")} tools={tools} /> : <p role="status">当前没有可用工具。</p>;
}
function Workbench({ tools }: { tools: typeof WORKBENCH_TOOLS }) {
  const [id, setId] = useState(tools[0].id);
  const selected = tools.find((item) => item.id === id)!;
  const [input, setInput] = useState(JSON.stringify(selected.example, null, 2));
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNavigationGuard(saving !== null || (output === null && input !== JSON.stringify(selected.example, null, 2)));
  const drafts = z.object({ taskDrafts: z.array(taskDraftResultSchema) }).safeParse(output);
  const selectTool = (nextId: string) => {
    const next = tools.find((item) => item.id === nextId);
    if (!next || saving !== null || !requestNavigationPermission()) return;
    setId(nextId); setInput(JSON.stringify(next.example, null, 2)); setOutput(null); setError(null); setNotice(null); setSaved([]);
  };
  const confirmDraft = async (index: number) => {
    if (!drafts.success || saving !== null || saved.includes(index)) return;
    setSaving(index); setError(null);
    try { await createTask(drafts.data.taskDrafts[index]); setSaved((items) => [...items, index]); setNotice("已确认创建提醒；可到任务页编辑或取消。"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "创建任务失败。"); }
    finally { setSaving(null); }
  };
  return <div className="mx-auto max-w-5xl space-y-5">
    <p className="text-sm text-[var(--workspace-muted)]">以下工具由代码计算，不调用付费模型。只读、计算和草稿互相区分；创建任务等操作仍须到对应模块确认。</p>
    <label className="block text-sm md:hidden">选择工具<select aria-label="选择工具" disabled={saving !== null} value={id} onChange={(event) => selectTool(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3">{tools.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
      <nav aria-label="工具列表" className="hidden space-y-2 md:block">{tools.map((item) => <button key={item.id} type="button" disabled={saving !== null} aria-pressed={id === item.id} className="block min-h-11 w-full rounded-xl border p-3 text-left text-sm disabled:opacity-50" onClick={() => selectTool(item.id)}>{item.title}<span className="mt-1 block text-xs text-zinc-500">{item.effect} · {item.allowedScopes.join(" / ")}</span></button>)}</nav>
      <section className="min-w-0 space-y-3 rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">{selected.title}</h2><p className="text-sm text-zinc-500">{selected.description}</p>
        <details className="text-xs text-zinc-500"><summary>工具契约与适配边界</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify({ id: selected.id, version: selected.version, effect: selected.effect, executor: selected.executor, maxResultBytes: selected.maxResultBytes, inputSchema: z.toJSONSchema(selected.inputSchema), outputSchema: z.toJSONSchema(selected.outputSchema), pluginGrant: "此页面是用户工具，不向插件自动授予新能力" }, null, 2)}</pre></details>
        <label className="block text-sm">输入参数（JSON，可修改示例）<textarea aria-label="工具输入" disabled={saving !== null} rows={12} maxLength={100000} className="mt-2 w-full rounded-xl border bg-transparent p-3 font-mono text-sm" value={input} onChange={(event) => { setInput(event.target.value); setOutput(null); setError(null); setNotice(null); }} /></label>
        <button type="button" disabled={saving !== null} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm text-white disabled:opacity-50" onClick={() => { try { setOutput(runWorkbenchTool(id, JSON.parse(input))); setSaved([]); setNotice(null); setError(null); } catch (caught) { setOutput(null); setError(caught instanceof SyntaxError ? "JSON 格式错误，请检查引号与逗号。" : caught instanceof Error ? caught.message : "工具执行失败。"); } }}>运行工具</button>
        {drafts.success && drafts.data.taskDrafts.map((draft, index) => <div key={index} className="rounded-xl border p-3 text-sm"><p>{draft.title} · {new Date(draft.schedule.runAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（上海时间）</p><button type="button" disabled={saving !== null || saved.includes(index)} className="mt-2 min-h-11 rounded-lg border px-3 disabled:opacity-50" onClick={() => void confirmDraft(index)}>{saved.includes(index) ? "提醒已创建" : "确认创建此提醒"}</button></div>)}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="break-words text-sm text-red-600">{error}</p>}
        {output !== null && <div role="status"><h3 className="font-medium">执行结果（未保存、未发送给模型）</h3><pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-900">{JSON.stringify(output, null, 2)}</pre></div>}
      </section>
    </div>
    <div className="flex flex-wrap gap-4 text-sm underline"><AppLink href="/study/memorization">背书与复习库</AppLink><AppLink href="/study/problem-solving">题库与错题卡</AppLink><AppLink href="/entertainment">游戏工具与存档</AppLink><AppLink href="/tasks">确认任务安排</AppLink></div>
  </div>;
}
