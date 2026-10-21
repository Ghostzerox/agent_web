"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { createEventDesign, listEventDesigns, getEventDesign, saveEventDesign, generateEventDesign, confirmEventDesign, rebaseEventDesign, stopEventGeneration,
  type EventSource, type EventDesignDraft, type EventDesignSummary } from "@/lib/api/gameEventDesignClient";
import { EVENT_FIELDS, type EventField } from "@/lib/game/events/contracts";
import { EventDesignEditor, EVENT_FIELD_LABELS } from "./EventDesignEditor";
import { buttonClass as button, fieldClass as field, Button, useConfirmAction } from "@/components/ui/Actions";
import { navigateToAppPath } from "@/lib/platform/appNavigation";

export const eventDesignLink = (source: EventSource, id?: string, preview = false) => (source.kind === "world" ? `/entertainment?view=creator&world=${source.worldId}&section=design-events` : `/entertainment?view=events&session=${source.sessionId}&parent=${source.parentTurnId}`) + (id ? `&event=${id}${preview ? "&eventPart=preview" : ""}` : "");
const formState = (row: EventDesignDraft) => JSON.stringify({ brief: row.brief, content: row.content, locked: row.lockedFields });
export function EventDesignWorkspace({ source, id }: { source: EventSource; id: string | null }) {
  const { confirm, confirmation } = useConfirmAction();
  const [allFields, setAllFields] = useState(false);
  const [pendingStructure, setPendingStructure] = useState(false);
  const query = useAppQuery(); const preview = query.get("eventPart") === "preview";
  const [row, setRow] = useState<EventDesignDraft | null>(null); const [baseline, setBaseline] = useState(""); const [rows, setRows] = useState<EventDesignSummary[]>([]); const [sourceVersion, setSourceVersion] = useState(0);
  const [brief, setBrief] = useState(""); const [created, setCreated] = useState<string | null>(null); const [selected, setSelected] = useState<EventField>("name");
  const [busy, setBusy] = useState(false); const [generating, setGenerating] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reviewed, setReviewed] = useState(false);
  const abort = useRef<AbortController | null>(null); const attempt = useRef<{ key: string; id: string } | null>(null);
  const dirty = pendingStructure || (row ? formState(row) !== baseline : Boolean(brief.trim()) && !created);
  useNavigationGuard(dirty || busy, busy ? "事件操作正在处理，返回后请重读回执。" : "事件草稿有未保存修改。");
  const install = (value: EventDesignDraft) => { setRow(value); setBaseline(formState(value)); setReviewed(false); };
  const sourceKey = JSON.stringify(source);
  useEffect(() => { let active = true; void (id ? getEventDesign(id).then((value) => { const requested = JSON.parse(sourceKey) as EventSource; if (requested.kind === "world" ? value.worldId !== requested.worldId : value.sessionId !== requested.sessionId) throw new Error("事件不属于此工作台来源。"); if (active) install(value); }) : listEventDesigns(JSON.parse(sourceKey) as EventSource).then((value) => { if (active) { setRows(value.rows); setSourceVersion(value.version); } })).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败"); }); return () => { active = false; }; }, [id, sourceKey]);
  const operate = async (work: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，原稿保留。"); } finally { setBusy(false); } };
  useEffect(() => { if (created && !busy) navigateToAppPath(eventDesignLink(JSON.parse(sourceKey) as EventSource, created)); }, [created, busy, sourceKey]);
  const applied = Boolean(row?.appliedWorldVersion || row?.appliedTurnId); const stale = Boolean(row && row.sourceVersion !== row.currentSourceVersion);
  const currentSource: EventSource = row?.sessionId && row.parentTurnId ? { kind: "session", sessionId: row.sessionId, parentTurnId: row.parentTurnId } : source;
  const generate = (fields: EventField[]) => void operate(async () => {
    if (!row || !await confirm({ title: "生成事件内容", modelCall: true, description: `将覆盖：${fields.filter((field) => !row.lockedFields.includes(field)).map((field) => EVENT_FIELD_LABELS[field]).join("、")}。使用当前模型，可能产生API费用；只保存草稿，不触发事件或发奖，不自动重试。`, confirmLabel: "开始生成" })) return;
    const key = `${row.id}:${row.version}:${fields.join(",")}`; if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    abort.current = new AbortController(); setGenerating(true); try { install(await generateEventDesign(row, fields, attempt.current.id, abort.current.signal)); } finally { setGenerating(false); abort.current = null; }
  });
  return <main aria-label="事件设计工作台" className="mx-auto max-w-4xl space-y-4">
    {confirmation}<AppLink className="text-sm text-violet-600" href={source.kind === "world" ? `/entertainment?view=creator&world=${source.worldId}` : `/entertainment?session=${source.sessionId}&panel=events`}>{source.kind === "world" ? "← 世界创作工作台" : "← 存档事件与历史"}</AppLink>
    <h2 className="text-2xl font-semibold">事件创作与建议</h2><p className="text-sm text-zinc-500">起因 / 条件 → 可拒绝行动 → 成本 / 后果 / 知情范围。草稿不是历史；明确确认后才由宿主判断触发和结算，不做离线自主世界模拟。</p>
    {error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-600">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
    {!id && <div className="grid gap-4 lg:grid-cols-2"><form className="space-y-3 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); void operate(async () => { const next = await createEventDesign(source, sourceVersion, brief); setCreated(next.id); setNotice("事件起点已保存；没有模型调用或世界变化。"); }); }}>
      <label className="block text-xs">事件想法<textarea aria-label="事件想法" className={field} maxLength={600} rows={5} value={brief} disabled={Boolean(created)} onChange={(event) => setBrief(event.target.value)} /></label>
      <p className="text-xs text-[var(--workspace-muted)]">先创建设计稿，不调用AI、不触发事件。</p><Button type="submit" variant="primary" disabled={busy || !brief.trim() || !sourceVersion || Boolean(created)}>创建事件</Button>
    </form><section className="space-y-2 rounded-xl border p-4"><h3 className="font-semibold">当前来源的事件草稿</h3>{rows.map((entry) => <AppLink className="block rounded-lg border p-3 text-sm" key={entry.id} href={eventDesignLink(source, entry.id)}>{entry.name} · {entry.appliedTurnId || entry.appliedWorldVersion ? "已确认（只读）" : "待设计"} · v{entry.version}</AppLink>)}{!rows.length && <p className="text-sm text-zinc-500">暂无草稿。</p>}</section></div>}
    {id && !row && !error && <p>正在读取事件…</p>}
    {row && <>
      <nav className="flex flex-wrap gap-3 text-sm" aria-label="事件局部导航"><AppLink href={eventDesignLink(currentSource)}>事件目录</AppLink><AppLink href={eventDesignLink(currentSource, row.id)}>分字段编辑</AppLink><AppLink href={eventDesignLink(currentSource, row.id, true)}>预览与确认事件</AppLink></nav>
      <p className="text-xs text-[var(--workspace-muted)]">{applied ? "已应用 · 只读" : dirty ? "未保存更改" : "已保存，尚未应用"}</p><details><summary className="text-xs">来源与版本</summary><p className="break-all text-xs">草稿v{row.version} · 来源v{row.sourceVersion} · {row.parentTurnId ?? "世界创作"}</p></details>
      {stale && !applied && <p role="alert" className="text-sm text-amber-600">来源已变化。生成与确认已拦截；原稿保留，可明确适配当前世界 / 活动分支，不会自动修复内容。</p>}
      <div className="flex flex-wrap gap-2"><button className={`${button} ui-button-primary`} disabled={busy || !dirty || pendingStructure || applied || Boolean(row.generation.active)} onClick={() => void operate(async () => install(await saveEventDesign(row)))}>保存事件草稿</button>
        <button className={button} disabled={busy || dirty} onClick={() => void operate(async () => install(await getEventDesign(row.id)))}>重读事件回执</button>
        {stale && !applied && <button className={button} disabled={busy || dirty || Boolean(row.generation.active)} onClick={() => void operate(async () => { if (await confirm({ title: "适配当前来源？", description: "保留内容与保护设置，重新绑定当前世界或活动分支，之后需要重新审阅。", confirmLabel: "适配来源" })) install(await rebaseEventDesign(row)); })}>明确适配当前来源</button>}
      </div>
      {row.generation.error && <p role="status" className="text-sm text-amber-600">{row.generation.error}</p>}
      {row.generation.active && <div className="space-y-2 rounded-lg border p-3 text-sm"><p>生成中 / 等待回执。刷新不重复调用；进程中断后不会自动接管重试。</p><button className={button} disabled={busy} onClick={() => void operate(async () => { if (await confirm({ title: "停止接收生成？", description: "原稿保留，迟到结果不覆盖，已产生费用不退。", confirmLabel: "停止接收" })) install(await stopEventGeneration(row.id)); })}>停止接收此生成</button></div>}
      {!preview ? <section className="space-y-3 rounded-xl border p-4">
        <fieldset disabled={busy || applied || Boolean(row.generation.active)} className="space-y-3"><p className="text-xs">来源：{row.origins[selected] === "ai" ? "AI补充，待审阅" : "用户 / 手动起始表单"}</p><label className="block text-sm"><input type="checkbox" checked={row.lockedFields.includes(selected)} onChange={(event) => { setRow({ ...row, lockedFields: event.target.checked ? [...row.lockedFields, selected] : row.lockedFields.filter((key) => key !== selected) }); setReviewed(false); }} /> 锁定当前事件字段（仍可手动编辑）</label>
          <EventDesignEditor key={selected} row={row} onPendingChange={setPendingStructure} onSelect={setSelected} selected={selected} onChange={(content) => { setRow({ ...row, content }); setReviewed(false); }} onError={setError} />
        </fieldset>
        <div className="flex flex-wrap items-end gap-2"><label className="text-sm">生成范围<select className={field} disabled={busy} value={allFields ? "all" : "selected"} onChange={(event) => setAllFields(event.target.value === "all")}><option value="selected">仅当前字段</option><option value="all">全部未保护字段（覆盖）</option></select></label><button className={button} disabled={busy || dirty || stale || applied || Boolean(row.generation.active) || (allFields ? EVENT_FIELDS.every((field) => row.lockedFields.includes(field)) : row.lockedFields.includes(selected))} onClick={() => generate(allFields ? EVENT_FIELDS.filter((field) => !row.lockedFields.includes(field)) : [selected])}>生成事件内容</button>{generating && <button className={button} onClick={() => abort.current?.abort()}>取消等待</button>}</div><p className="text-xs text-[var(--workspace-muted)]">{pendingStructure ? "JSON修改尚未应用，请先应用到表单。" : dirty ? "请先保存更改。" : stale ? "请先适配当前来源。" : applied ? "已应用的事件只读。" : row.lockedFields.includes(selected) && !allFields ? "当前字段已保护。" : "确认范围后调用AI；取消仍可能产生费用。"}</p>
      </section> : <section className="space-y-3 rounded-xl border p-4" aria-label="事件预览与确认"><h3 className="font-semibold">{row.content.name}</h3><p className="text-sm">类型 {row.content.details.category} · 来源回合 {row.context.tick} · 位置 {row.content.locationId} · 世界政策 {row.references.magic} / {row.references.numericPolicy}</p>
        <details><summary className="cursor-pointer text-sm">主持起因 / 秘密（不会自动给人物）</summary><p className="text-sm">{row.content.details.cause}</p><p className="text-sm">{row.content.details.authorNotes.join("；")}</p></details>
        <div className="space-y-2 text-sm"><p>触发门槛：{row.content.trigger.minTick !== undefined ? `第${row.content.trigger.minTick}探索回合起；` : ""}{row.content.trigger.flag ? `旗标 ${row.content.trigger.flag}；` : ""}{row.content.trigger.item ? `持有 ${row.references.items.find((item) => item.id === row.content.trigger.item)?.name ?? row.content.trigger.item}；` : ""}{row.content.trigger.learned ? `已学史料 ${row.content.trigger.learned}；` : ""}{row.content.trigger.relationship ? `与${row.content.trigger.relationship.actorId}关系至少${row.content.trigger.relationship.atLeast}；` : ""}{Object.keys(row.content.trigger).length === 0 ? "无额外前置，确认生效后可触发" : ""}</p><p>发现方式：{row.content.details.visibility === "local" ? "玩家到场后发现" : "明确参与的玩家可见"}；确认与触发均不自动领奖。</p></div>
        {row.content.stages.map((stage, index) => <details key={stage.id} open={index === 0} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{index === 0 ? "起始" : stage.terminal ? "结束" : "后续"}阶段 · {stage.id}</summary><div className="mt-3 space-y-3"><p className="text-sm">{stage.description}</p>{stage.choices.map((choice) => <article key={choice.id} className="space-y-1 rounded-lg border p-3 text-sm"><h4 className="font-semibold">{choice.label}{choice.refusal ? " · 可拒绝 / 替代" : ""}</h4><p>{choice.result}</p><p className="text-xs text-zinc-500">钱币成本 {choice.coinCost ?? 0} · 变化 {choice.effect.coins ?? 0} · 消耗 {choice.consume ?? "无"} · 后续 {choice.next}</p><p className="text-xs">物品奖励：{choice.effect.rewards?.length ? choice.effect.rewards.map((reward) => `${row.references.items.find((item) => item.id === reward.definitionId)?.name ?? reward.definitionId} × ${reward.quantity}`).join("、") : "无"}</p>{(choice.knowledge.length > 0 || choice.requires || Object.keys(choice.effect).some((key) => !["coins", "rewards"].includes(key))) && <details><summary className="cursor-pointer text-xs">前置 / 其他后果与知情范围</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ requires: choice.requires, effect: choice.effect, knowledge: choice.knowledge }, null, 2)}</pre></details>}</article>)}</div></details>)}
        <details><summary className="cursor-pointer text-sm">完整规则与触发知情范围（高级核对）</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ trigger: row.content.trigger, visibility: row.content.details.visibility, onTriggerKnowledge: row.content.details.onTriggerKnowledge, stages: row.content.stages }, null, 2)}</pre></details>
        {row.issues.length ? <div role="alert" className="space-y-1 text-sm text-red-600">{row.issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : <p className="text-sm text-emerald-600">结构、引用、拒绝路径和无环检查通过；人物动机与自然语言世界规则仍需人工审阅。</p>}
        <label className="block text-sm"><input type="checkbox" checked={reviewed} disabled={applied} onChange={(event) => setReviewed(event.target.checked)} /> 我已审阅事件条件、拒绝路径、成本奖励、人物动机与知情范围，确认纳入</label>
        <button className={`${button} ui-button-primary`} disabled={busy || dirty || stale || applied || !reviewed || Boolean(row.generation.active) || row.issues.length > 0} onClick={() => void operate(async () => { install(await confirmEventDesign(row)); setNotice(row.worldId ? "事件已纳入世界草稿；发布新修订和新局后生效，旧局不变。" : "事件规则已纳入本分支；只有满足条件才触发，尚未替你选择或领奖。"); })}>{row.worldId ? "加入世界事件" : "加入当前分支"}</button>
        {row.appliedWorldVersion && <AppLink className="block text-sm text-violet-600" href={`/entertainment?view=creator&world=${row.worldId}&section=preview`}>发布世界事件新修订 →</AppLink>}
        {row.appliedTurnId && <AppLink className="block text-sm text-violet-600" href={`/entertainment?session=${row.sessionId}&panel=events`}>打开存档事件与后续行动 →</AppLink>}
      </section>}
    </>}
  </main>;
}
