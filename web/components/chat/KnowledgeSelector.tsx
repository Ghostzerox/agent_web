"use client";
import { useEffect, useState } from "react";
import { knowledgeClient, type KnowledgeCollection } from "@/lib/api/knowledgeClient";
import { MEMORY_DOMAIN_POLICIES, memoryModuleForConversationMode } from "@/lib/memory/domainPolicy";
type Props = { mode: string; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean };
export function KnowledgeSelector({ mode, selected, onChange, disabled }: Props) {
  const [items, setItems] = useState<KnowledgeCollection[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const consumer = memoryModuleForConversationMode(mode);
  const allowed = consumer ? MEMORY_DOMAIN_POLICIES[consumer].collectionModules : [];
  const refresh = async () => { setLoading(true); try { setItems(await knowledgeClient.collections()); setError(""); } catch { setError("暂时无法读取集合；可重试或清空选择，不会自动联网替代。"); } finally { setLoading(false); } };
  useEffect(() => { let active = true; void knowledgeClient.collections().then((values) => { if (active) { setItems(values); setError(""); } }).catch(() => { if (active) setError("资料库暂不可用，可刷新重试。"); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <details className="mx-3 mb-2 shrink-0 rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800 sm:mx-6">
    <summary className="cursor-pointer font-medium">本次使用资料库（已选 {selected.length}）{selected.length ? " · 本地检索，关闭联网搜索" : " · 默认不读取"}</summary>
    <p className="mt-2 text-zinc-500">选中后，命中片段会发送给你配置的模型服务，不会把问题交给搜索服务。最多 10 个同模式集合；选择仅保留在本页会话内，刷新后重选。独立学习/游戏工作流尚不自动接入。</p>
    {!allowed.length && <p className="mt-2 text-zinc-500">当前模式不读取知识集合；可切换专业或反思模式。</p>}
    {error && <p role="status" className="mt-2 text-amber-700">{error}</p>}
    <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">{items.filter((item) => allowed.includes(item.module)).map((item) => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" disabled={disabled || (!selected.includes(item.id) && selected.length >= 10)} checked={selected.includes(item.id)} onChange={(event) => onChange(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />{item.title}</label>)}</div>
    {!loading && !error && allowed.length > 0 && !items.some((item) => allowed.includes(item.module)) && <p className="mt-2 text-zinc-500">本模式还没有知识集合，请到记忆页创建。</p>}
    <div className="mt-2 flex gap-3"><button type="button" disabled={disabled || loading} onClick={() => void refresh()} className="underline disabled:opacity-40">刷新集合</button><button type="button" disabled={disabled || !selected.length} onClick={() => onChange([])} className="underline disabled:opacity-40">清空资料选择</button></div>
  </details>;
}
