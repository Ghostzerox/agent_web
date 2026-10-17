"use client";
import { useEffect, useState } from "react";
import { actionClient } from "@/lib/api/actionClient";
import { businessDay, shiftDay, todoState, type ActionCommand, type ActionItem, type ActionSnapshot } from "@/lib/tasks/actions";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

type ActionDraft = { [K in ActionCommand["operation"]]: Omit<Extract<ActionCommand, { operation: K }>, "mutationId"> }[ActionCommand["operation"]];
const field = "min-h-11 rounded-lg border border-[var(--workspace-border)] bg-transparent px-3 py-2 text-sm";
const button = `${field} disabled:opacity-40`;
export function ActionBoard() {
  const [snapshot, setSnapshot] = useState<ActionSnapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [title, setTitle] = useState(""), [note, setNote] = useState(""), [due, setDue] = useState("");
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const today = snapshot?.today ?? businessDay();
  useNavigationGuard(busy || Boolean(title.trim() || note.trim() || due || editing));
  async function load(confirm = false) {
    if (confirm && (title || note || due || editing) && !window.confirm("刷新保留当前草稿并更新列表，保存时仍会核对原版本。继续？")) return;
    setBusy(true); setError("");
    try { setSnapshot(await actionClient.load(shiftDay(today, -31), today)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "读取失败。"); }
    finally { setBusy(false); }
  }
  useEffect(() => { let active = true; void actionClient.load(shiftDay(businessDay(), -31), businessDay()).then((value) => { if (active) setSnapshot(value); }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "读取失败。"); }); return () => { active = false; }; }, []);
  async function save(command: ActionDraft) {
    setBusy(true); setError("");
    const signature = JSON.stringify(command);
    const mutationId = keys[signature] ?? crypto.randomUUID(); setKeys((current) => ({ ...current, [signature]: mutationId }));
    try {
      const saved = await actionClient.mutate({ ...command, mutationId } as ActionCommand);
      setSnapshot((s) => s ? { ...s, items: [...s.items.filter((i) => i.id !== saved.id), saved] } : s);
      if (command.operation === "create" || (command.operation === "update" && editing?.id === command.id)) { setTitle(""); setNote(""); setDue(""); setEditing(null); } setKeys((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== signature)));
      try { setSnapshot(await actionClient.load(shiftDay(today, -31), today)); }
      catch { setError("操作已保存，但列表刷新失败；请联网后刷新核对。"); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败，草稿保留。"); }
    finally { setBusy(false); }
  }
  function record(item: ActionItem) {
    return save({ operation: "record", id: item.id, expectedVersion: item.version, day: item.data.completedOn ?? today, value: 1, state: item.data.completedOn ? "revoked" : "done", note: "" } as ActionDraft);
  }
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">我的行动</h2><p className="mt-1 text-xs text-zinc-500">上海业务日 {today} · 系统执行、通知送达与用户完成分别记录。</p></div><button disabled={busy} className={button} onClick={() => void load(true)}>刷新行动记录</button></header>
    {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
    {!snapshot && !error && <p role="status">正在读取行动记录…</p>}
    <form className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!snapshot || busy) return; void save(editing ? { operation: "update", id: editing.id, expectedVersion: editing.version, title, note, dueOn: due || null, goalId: editing.data.goalId, status: editing.data.status } as ActionDraft : { operation: "create", data: { kind: "todo", title, note, startsOn: today, dueOn: due || null, status: "active", goalId: null, completedOn: null, rules: [], linkedTaskId: null } } as ActionDraft); }}>
      <label className="grid gap-1 text-sm">行动名称<input aria-label="行动名称" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className={field} disabled={busy} /></label>
      <label className="grid gap-1 text-sm">截止日期（可选）<input aria-label="行动截止日期" type="date" value={due} min={editing?.data.startsOn ?? today} onChange={(e) => setDue(e.target.value)} className={field} disabled={busy} /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">备注<textarea aria-label="行动备注" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={field} disabled={busy} /></label>
      <div className="flex gap-2"><button disabled={busy || !snapshot || !title.trim()} className={`${button} bg-emerald-700 text-white`}>{editing ? "保存行动" : "添加待办"}</button>{editing && <button type="button" className={button} disabled={busy} onClick={() => { setEditing(null); setTitle(""); setNote(""); setDue(""); }}>取消编辑</button>}</div>
    </form>
    {snapshot && ["pending", "overdue", "done", "paused", "archived"].map((state) => {
      const items = snapshot.items.filter((i) => i.data.kind === "todo" && todoState(i, today) === state);
      if (!items.length) return null;
      return <section key={state} className="space-y-2"><h3 className="font-medium">{{ pending: "待完成", overdue: "逾期", done: "已完成", paused: "已暂停", archived: "已归档" }[state]}（{items.length}）</h3>{items.map((item) => <article key={item.id} className="rounded-xl border p-4 text-sm"><h4 className="break-words font-semibold">{item.data.title}</h4><p className="mt-1 whitespace-pre-wrap break-words text-zinc-500">{item.data.note}</p><p className="mt-1 text-xs">{item.data.dueOn ? `截止 ${item.data.dueOn}` : "无截止日"}{item.data.completedOn && ` · 实际完成 ${item.data.completedOn}`} · v{item.version}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || (item.data.status !== "active" && !item.data.completedOn)} className={button} onClick={() => void record(item)}>{item.data.completedOn ? "撤销完成" : "标记完成"}</button><button disabled={busy || Boolean(title || note || due || editing)} className={button} onClick={() => { setEditing(item); setTitle(item.data.title); setNote(item.data.note); setDue(item.data.dueOn ?? ""); }}>编辑行动</button><button disabled={busy} className={button} onClick={() => void save({ operation: "update", id: item.id, expectedVersion: item.version, title: item.data.title, note: item.data.note, dueOn: item.data.dueOn, goalId: item.data.goalId, status: item.data.status === "active" ? "paused" : "active" } as ActionDraft)}>{item.data.status === "active" ? "暂停行动" : "恢复行动"}</button><button disabled={busy || item.data.status === "archived"} className={button} onClick={() => { if (window.confirm("归档保留行动历史，不删除原提醒。继续？")) void save({ operation: "update", id: item.id, expectedVersion: item.version, title: item.data.title, note: item.data.note, dueOn: item.data.dueOn, goalId: item.data.goalId, status: "archived" } as ActionDraft); }}>归档</button></div></article>)}</section>;
    })}
    {snapshot && snapshot.items.length === 0 && <p className="text-sm text-zinc-500">还没有行动。从一个手动待办开始；不会因此自动创建提醒。</p>}
  </div>;
}
