"use client";

import { useState } from "react";
import { WORKBENCH_TOOLS, runWorkbenchTool } from "@/lib/tools/workbench";
import { AppLink } from "@/components/platform/AppLink";

export function ToolsWorkbench() {
  const [id, setId] = useState(WORKBENCH_TOOLS[0].id);
  const selected = WORKBENCH_TOOLS.find((item) => item.id === id)!;
  const [input, setInput] = useState(JSON.stringify(selected.example, null, 2));
  const [output, setOutput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  return <div className="mx-auto max-w-5xl space-y-5">
    <p className="text-sm text-[var(--workspace-muted)]">以下工具由代码计算，不调用付费模型。只读、计算和草稿互相区分；创建任务等操作仍须到对应模块确认。</p>
    <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
      <nav aria-label="工具列表" className="space-y-2">{WORKBENCH_TOOLS.map((item) => <button key={item.id} type="button" aria-pressed={id === item.id} className="block min-h-11 w-full rounded-xl border p-3 text-left text-sm" onClick={() => { setId(item.id); setInput(JSON.stringify(item.example, null, 2)); setOutput(null); setError(null); }}>{item.title}<span className="mt-1 block text-xs text-zinc-500">{item.effect} · {item.allowedScopes.join(" / ")}</span></button>)}</nav>
      <section className="min-w-0 space-y-3 rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">{selected.title}</h2><p className="text-sm text-zinc-500">{selected.description}</p>
        <label className="block text-sm">输入参数（JSON，可修改示例）<textarea aria-label="工具输入" rows={12} maxLength={40000} className="mt-2 w-full rounded-xl border bg-transparent p-3 font-mono text-sm" value={input} onChange={(event) => { setInput(event.target.value); setOutput(null); setError(null); }} /></label>
        <button type="button" className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm text-white" onClick={() => { try { setOutput(runWorkbenchTool(id, JSON.parse(input))); setError(null); } catch (caught) { setOutput(null); setError(caught instanceof SyntaxError ? "JSON 格式错误，请检查引号与逗号。" : caught instanceof Error ? caught.message : "工具执行失败。"); } }}>运行工具</button>
        {error && <p role="alert" className="break-words text-sm text-red-600">{error}</p>}
        {output !== null && <div role="status"><h3 className="font-medium">执行结果（未保存、未发送给模型）</h3><pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-900">{JSON.stringify(output, null, 2)}</pre></div>}
      </section>
    </div>
    <div className="flex flex-wrap gap-4 text-sm underline"><AppLink href="/study/memorization">背书与复习库</AppLink><AppLink href="/study/problem-solving">题库与错题卡</AppLink><AppLink href="/entertainment">游戏工具与存档</AppLink><AppLink href="/tasks">确认任务安排</AppLink></div>
  </div>;
}
