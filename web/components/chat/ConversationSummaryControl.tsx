"use client";
import { useState } from "react";
import { conversationSummaryClient as client } from "@/lib/api/conversationSummaryClient";
import type { SummaryRecord } from "@/lib/repositories/conversationSummaryRepository";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
const labels = { goal: "目标", constraint: "约束", decision: "决定", open: "未决事项", fact: "历史陈述", uncertainty: "不确定" };
type Props = { conversationId: string; leafId: string | null; enabled: boolean; onChange: (value: boolean) => void; disabled: boolean; envelope?: PromptEnvelope };
export function ConversationSummaryControl({ conversationId, leafId, enabled, onChange, disabled, envelope }: Props) {
  const [summary, setSummary] = useState<SummaryRecord | null>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const act = async (operation: () => Promise<void>) => { setBusy(true); try { await operation(); } catch (error) { setNote(error instanceof Error ? error.message : "摘要失败；原始历史保留。"); } finally { setBusy(false); } };
  return <details className="mx-3 mb-2 shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800 sm:mx-6">
    <summary className="cursor-pointer">分支摘要 · {enabled ? "已允许复用" : "默认关闭"}</summary>
    <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
      <p className="text-zinc-500">按需生成较早消息摘要，近期原文保留。生成会向配置的模型发送该分支历史并收费；查看核对后才允许使用，不自动重写。摘要可能遗漏，请核对关键约束和未决事项。</p>
      <label className="flex gap-2"><input type="checkbox" checked={enabled} disabled={disabled || busy} onChange={(event) => onChange(event.target.checked)} />本页允许复用已审核摘要（无有效摘要时用完整历史）</label>
      {envelope?.context.notes.map((value, index) => <p key={index} className="text-blue-700 dark:text-blue-300">最近请求：{value}</p>)}
      {envelope?.context.summary && <p>历史上下文估算 {envelope.context.summary.originalEstimatedTokens} → {envelope.context.summary.compactEstimatedTokens} Token（未含摘要生成成本，不是实测省钱）</p>}
      {note && <p role="status">{note}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="underline" disabled={disabled || busy || !leafId} onClick={() => void act(async () => { const result = await client.inspect(conversationId, leafId!); setSummary(result.summary); setNote(`${result.reason} 当前分支 ${result.messageCount} 条消息。`); })}>查看当前分支摘要</button>
        <button type="button" className="underline" disabled={disabled || busy || !leafId} onClick={() => { if (window.confirm("生成分支摘要会发送较早历史给当前模型并产生 API 费用；同一来源已有摘要时直接复用。确认生成？")) void act(async () => { const result = await client.generate(conversationId, leafId!); setSummary(result); setNote("请核对摘要和逐字证据；未审核的摘要不会用于回答。"); }); }}>生成/更新摘要（收费）</button>
        <button type="button" className="underline" disabled={disabled || busy} onClick={() => { if (window.confirm("清除本对话所有派生摘要？原消息不删除，已发生模型费用不退回。")) void act(async () => { await client.clear(conversationId); setSummary(null); onChange(false); setNote("派生摘要已清除，原始历史保留。"); }); }}>清除摘要</button>
      </div>
      {summary?.payload && <div className="space-y-2 border-t pt-2"><p>状态：{summary.status === "approved" ? "已审核" : "待核对"} · 覆盖 {summary.sources.length} 条原始消息 · {summary.policy}</p>{summary.payload.points.map((point, index) => <div key={index}><p>{labels[point.kind]}：{point.text}</p>{point.evidence.map((evidence, n) => <details key={n}><summary className="cursor-pointer text-zinc-500">证据 {evidence.messageId}</summary><p className="whitespace-pre-wrap break-words">{evidence.quote}</p></details>)}</div>)}{summary.status === "draft" && <button type="button" disabled={busy || disabled || !leafId} className="underline" onClick={() => void act(async () => { setSummary(await client.approve(conversationId, leafId!, summary)); onChange(true); setNote("已审核；仅在来源、分支与配置仍有效时复用。"); })}>已核对，允许本页使用</button>}</div>}
    </div>
  </details>;
}
