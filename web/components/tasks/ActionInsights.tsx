"use client";
import { useEffect, useState } from "react";
import { actionClient } from "@/lib/api/actionClient";
import { datesBetween, monthWindow, habitStats, achieved } from "@/lib/tasks/actionStats";
import { isPlanned, type ActionSnapshot } from "@/lib/tasks/actions";
export function ActionInsights({ snapshot: latest }: { snapshot: ActionSnapshot }) {
  const [month, setMonth] = useState(latest.today.slice(0,7)), [selected, setSelected] = useState(latest.today), [snapshot, setSnapshot] = useState(latest), [loadedMonth, setLoadedMonth] = useState(""), [error, setError] = useState("");
  const bounds = monthWindow(month);
  useEffect(() => {
    let active = true;
    const range = monthWindow(month);
    void actionClient.load(range.from, range.to).then((data) => { if (active) { setSnapshot(data); setLoadedMonth(month); setError(""); } }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "日历读取失败。"); });
    return () => { active = false; };
  }, [month, latest]);
  const onMonth = (next: string) => { setMonth(next); setError(""); };
  const habits = snapshot.items.filter((i) => i.data.kind === "habit");
  const selectedEntries = snapshot.entries.filter((e) => e.day === selected);
  return <section className="space-y-4 rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">行动日历与周进度</h3><label className="text-sm">统计月份 <input aria-label="统计月份" type="month" min="2000-01" max="2100-12" value={month} className="min-h-11 rounded-lg border bg-transparent px-3" onChange={(e) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) onMonth(e.target.value); }} /></label></div>
    <p className="text-xs text-zinc-500">达标率仅计算本月截至今天的每日 / 指定星期计划；请假排除，跳过计未完成，撤销恢复待完成。每周 N 天单列完整周进度，进行中的周不判失败；首尾周含相邻月份。累计与连续均限本次加载区间，不冒充终身统计。</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loadedMonth !== month ? <p role="status">正在读取所选月份…</p> : <>
    <div className="grid grid-cols-7 gap-1" aria-label="行动月历">{["一","二","三","四","五","六","日"].map((v) => <span key={v} className="text-center text-xs text-zinc-500">{v}</span>)}{datesBetween(bounds.from, bounds.to).map((day) => { const completed = snapshot.entries.filter((e) => e.day === day && (achieved(e) || (!e.rule && e.state === "done"))).length; const planned = habits.filter((i) => isPlanned(i,day)).length; return <button type="button" key={day} aria-pressed={selected === day} aria-label={`${day} 已完成${completed}项`} className={`min-h-16 min-w-0 rounded-lg border px-1 text-xs aria-pressed:border-emerald-600 ${day < bounds.first || day > bounds.last ? "opacity-50" : ""}`} onClick={() => setSelected(day)}><span>{Number(day.slice(-2))}</span><span className="mt-1 block break-words text-[10px]">{completed ? `${completed}项完成` : day > snapshot.today ? "未到期" : planned ? "有计划" : "—"}</span></button>; })}</div>
    <div className="space-y-1 text-xs"><h4 className="font-medium">{selected} 的记录</h4>{!selectedEntries.length && <p>暂无打卡记录。</p>}{selectedEntries.map((e) => <p key={e.itemId}>{snapshot.items.find((i) => i.id === e.itemId)?.data.title ?? "事项"}：{{ done:"已记录", skipped:"跳过", excused:"请假", revoked:"已撤销" }[e.state]} {e.value} {e.rule?.unit} {e.backfill && "（补记）"} {e.note} · 操作时间 {e.recordedAt}</p>)}</div>
    <div className="grid gap-3 sm:grid-cols-2">{habits.map((item) => { const stats = habitStats(item, snapshot.entries, bounds.first, bounds.last, snapshot.today); return <article key={item.id} className="rounded-xl border p-3 text-sm"><h4 className="break-words font-medium">{item.data.title}</h4><p className="mt-1">本月累计达标 {stats.cumulativeDays} 天；日计划 {stats.completed}/{stats.planned}，达标率 {stats.rate === null ? "不适用" : `${Math.round(stats.rate * 100)}%`}</p><p className="text-xs text-zinc-500">请假 {stats.excused} · 跳过 {stats.skipped} · 本月连续 {stats.streak} / 最长 {stats.longest} 个计划日（今天尚未结束不提前断签）</p>{stats.weeks.length > 0 && <p className="text-xs">本区间连续达标 {stats.weeklyStreak} 周 / 最长 {stats.longestWeeklyStreak} 周</p>}{stats.weeks.map((w) => <p key={w.start} className="mt-1 text-xs">{w.start} 周：{w.completed}/{w.target} 天 · {!w.target ? "本周免计划" : w.closed ? w.completed >= w.target ? "周目标达成" : "周目标未达成" : "进行中，不计失败"}</p>)}</article>; })}</div>
    </>}
  </section>;
}
