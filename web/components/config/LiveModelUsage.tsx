"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { modelCallSchema, type ModelCallTelemetry } from "@/lib/ai/modelUsage";
import { getModelOperations, subscribeModelOperations, type ModelOperation } from "@/lib/ai/modelOperations";
import { apiFetch } from "@/lib/api/clientRuntime";
import { AppLink } from "@/components/platform/AppLink";
import { Drawer } from "@/components/ui/Drawer";

const empty: readonly ModelOperation[] = [];
const count = (value: number | null | undefined) => value == null ? "未知" : value.toLocaleString();
function Usage({ call }: { call: ModelCallTelemetry }) {
  return <li className="space-y-1 rounded border border-[var(--workspace-border)] p-2 text-xs [overflow-wrap:anywhere]">
    <p>{call.model} · {call.business} · {call.status === "completed" ? "模型已完成（不代表业务保存成功）" : call.status === "failed" ? "模型失败" : "已取消"}</p>
    <p>输入 {count(call.usage?.inputTokens)} / 输出 {count(call.usage?.outputTokens)} / 缓存命中 {count(call.usage?.cachedInputTokens)} Token</p>
    <p>推理 {count(call.usage?.reasoningTokens)}（已包含在输出中，不重复相加）{call.price && call.estimatedCost !== null ? ` · 估算 ${call.estimatedCost.toFixed(6)} ${call.price.currency}` : " · 费用未计价"}</p>
  </li>;
}
export function LiveModelUsage({ scope }: { scope: string }) {
  const operations = useSyncExternalStore(subscribeModelOperations, getModelOperations, () => empty);
  const operation = operations.findLast((entry) => entry.scope === scope);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ id: string; calls: ModelCallTelemetry[]; truncated: boolean; error: boolean } | null>(null);
  const id = operation?.id; const finishedAt = operation?.finishedAt;
  useEffect(() => {
    if (!id && !open) return;
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController(); let remaining = finishedAt ? 5 : Infinity;
    const poll = async () => {
      try {
        const response = await apiFetch(`/api/v1/model/usage?${id ? `operationId=${id}` : "recent=1"}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("USAGE_UNAVAILABLE");
        const payload = await response.json(); const calls = z.array(modelCallSchema).max(50).parse(payload.data.calls);
        if (id && calls.some((call) => call.operationId !== id)) throw new Error("USAGE_SCOPE_MISMATCH");
        if (active) setResult({ id: id ?? "recent", calls, truncated: payload.data.truncated === true, error: false });
      } catch { if (active) setResult({ id: id ?? "recent", calls: [], truncated: false, error: true }); }
      if (active && --remaining > 0) timer = setTimeout(poll, id ? 2000 : 15000);
    };
    void poll(); return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [id, finishedAt, open]);
  const shown = result?.id === (id ?? "recent") ? result : null;
  const known = shown?.calls.filter((call) => call.usage?.inputTokens != null && call.usage?.outputTokens != null) ?? [];
  const total = known.reduce((sum, call) => sum + call.usage!.inputTokens! + call.usage!.outputTokens!, 0);
  if (!operation) return null;
  return <section aria-label="AI Token用量" className="usage-compact">
    <button type="button" className="text-left" aria-expanded={open} onClick={() => setOpen(!open)}>AI 用量 {operation ? `· ${operation.label} · ${finishedAt ? operation.failed ? "请求失败 / 已中断" : "请求已返回" : "生成中"} · ${known.length ? `${total.toLocaleString()} Token（已知${known.length}次）` : "实际用量待返回"}` : "· 查看近期模型记录"} {open ? "▴" : "▾"}</button>
    {open && <Drawer id="operation-usage" label="本次AI用量详情" variant="sheet" onClose={() => setOpen(false)}><div className="space-y-3 p-5">
      <h2 className="text-lg font-semibold">本次AI用量</h2><button className="ui-button" onClick={() => setOpen(false)}>关闭用量详情</button>
      <p className="text-[var(--workspace-muted)]">{id ? "仅显示本次操作关联的模型调用；并发和后台任务不混算。" : "近期20条记录，含后台定时任务；不是本页面本次操作的合计。"}供应商通常在结束时才报告准确用量，生成中不伪造逐Token计数；不返回或中断时用量未知，仍可能收费。</p>
      {shown?.error ? <p>用量暂时不可读取，不代表零消耗。</p> : !shown?.calls.length ? <p>尚无关联用量；可能未调用模型、记录尚未到达或写入失败，不能当成零费用。</p> : <ul className="grid gap-2 sm:grid-cols-2">{shown.calls.map((call) => <Usage key={call.id} call={call} />)}</ul>}
      {shown?.truncated && <p>记录已截取，以上不是完整总量。</p>}
      <AppLink className="underline" href="/api-key">到模型配置查看七天用量与费用统计</AppLink>
    </div></Drawer>}
  </section>;
}
