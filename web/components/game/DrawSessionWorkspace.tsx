"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { listGameDraws, getGameDraw, prepareGameDraw, generateDrawItem, editDrawItem, settleGameDraw, cancelGameDraw,
  type DrawContext, type ItemDraw } from "@/lib/api/gameDrawClient";
import { itemDesignSchema, type ItemDesign } from "@/lib/game/worlds/assetContracts";
import { buttonClass as button, fieldClass as field, useConfirmAction } from "@/components/ui/Actions";

const labels = { sampled: "已抽定，待设计", generating: "生成中 / 等待回执", ready: "待审阅入库", failed: "生成未完成，原抽样保留", cancelled: "已取消（未发放）", settled: "已入库" };
export const drawLink = (sessionId: string, parentTurnId: string, draw?: string) => `/entertainment?view=draws&session=${sessionId}&parent=${parentTurnId}${draw ? `&draw=${draw}` : ""}`;
export function DrawSessionWorkspace({ sessionId, parentTurnId, drawId }: { sessionId: string; parentTurnId: string; drawId: string | null }) {
  const { confirm, confirmation } = useConfirmAction();
  const [context, setContext] = useState<DrawContext | null>(null); const [row, setRow] = useState<ItemDraw | null>(null); const [item, setItem] = useState<ItemDesign | null>(null);
  const [poolId, setPoolId] = useState(""); const [keywords, setKeywords] = useState(""); const [confirmed, setConfirmed] = useState(false); const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [raw, setRaw] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const abort = useRef<AbortController | null>(null); const drawAttempt = useRef<{ key: string; id: string } | null>(null); const generationAttempt = useRef<{ key: string; id: string } | null>(null);
  const install = (next: ItemDraw | null) => { setRow(next); setItem(next?.data.item ?? null); setRaw(null); setReviewed(false); };
  const dirty = Boolean(item && (JSON.stringify(item) !== JSON.stringify(row?.data.item) || raw !== null && raw !== JSON.stringify(item, null, 2)));
  useNavigationGuard(dirty || busy, busy ? "获取请求正在服务端处理；返回后请重读原回执，不要重新抽样。" : "物品草稿有未保存更改。");
  useEffect(() => { let active = true; void (async () => {
    const value = await listGameDraws(sessionId, parentTurnId); const selected = drawId ? await getGameDraw(drawId) : null;
    if (selected && (selected.sessionId !== sessionId || selected.parentTurnId !== parentTurnId)) throw new Error("该回执不属于所选存档分支。");
    if (active) { setContext(value); install(selected); }
  })().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败"); }); return () => { active = false; }; }, [sessionId, parentTurnId, drawId]);
  const operate = async (work: () => Promise<void>) => { setBusy(true); setError(""); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "请求未完成，请重读原回执。"); } finally { setBusy(false); } };
  const refresh = async () => { setContext(await listGameDraws(sessionId, parentTurnId)); if (row) install(await getGameDraw(row.id)); };
  const selected = context?.pools.find((entry) => entry.pool.id === poolId) ?? context?.pools[0];
  const rankName = (kind: "quality" | "tier" | "rating", id: string) => context?.ranks[kind].find((rank) => rank.id === id)?.name ?? id;
  const categories = { material: "材料", equipment: "装备", tool: "工具", consumable: "消耗品" };
  const stale = Boolean(row && context && row.expectedVersion !== context.version);
  const canEdit = row && !stale && ["sampled", "failed", "ready"].includes(row.status) && context?.status === "active";
  return <main aria-label="存档获取工作区" className="mx-auto max-w-4xl space-y-4">
    <AppLink href={`/entertainment?session=${sessionId}&panel=items`} className="text-sm text-violet-600">← 返回本存档与背包</AppLink>
    <h2 className="text-2xl font-semibold">获取 / 抽卡</h2><p className="text-sm text-zinc-500">单抽；先查看本分支概率和虚构成本，再确认。模型只补全设计，不能重抽或升级品质；装备不自动穿戴。</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {context && <p className="text-sm text-[var(--workspace-muted)]">本分支可用：{context.coins} 枚虚构钱币 · 抽样后审阅，确认获得才入包扣款。</p>}
    <button className={button} disabled={busy || dirty} onClick={() => void operate(refresh)}>刷新抽取状态</button>
    {context && !row && <fieldset disabled={busy} className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4">
      {!context.pools.length ? <p className="text-sm">此修订没有卡池。请在世界创作工作台配置、发布并创建新局；旧局不会自动升级。</p> : <>
        <label className="block text-xs">选择卡池<select aria-label="选择卡池" className={field} value={selected?.pool.id ?? ""} onChange={(event) => { setPoolId(event.target.value); setConfirmed(false); }}>{context.pools.map(({ pool }) => <option key={pool.id} value={pool.id}>{pool.name}</option>)}</select></label>
        {selected && <><p className="text-sm">{selected.pool.explanation}</p><p className="text-sm">一次1抽 · 每抽 {selected.pool.coinCost} 枚虚构钱币 · 最多 {selected.pool.maxDraws} 次 / 分支 · {selected.pool.replacement ? "放回" : "不放回"}</p>
          <details open><summary className="cursor-pointer text-sm">本分支当前有效概率与规则</summary><div className="mt-2 space-y-2 text-xs">
            <p>地点：{selected.pool.locationId ?? "不限"} · 最早回合 {selected.pool.minTick} · 已有唯一物品、已用条目和零权重会排除；以下为排除后的条件概率。</p>
            {selected.pool.entries.map((entry) => <p key={entry.id}>{entry.source === "fixed" ? context.fixedItems.find((item) => item.id === entry.definitionId)?.name ?? entry.definitionId : `${entry.theme} · ${categories[entry.category]} / ${rankName("quality", entry.quality)}`} · 数量 {entry.minQuantity}–{entry.maxQuantity}（均匀） · {((selected.probabilities.find((value) => value.entryId === entry.id)?.probability ?? 0) * 100).toFixed(2)}%</p>)}
            {!selected.probabilities.length && <p>当前没有可抽取条目（可能是地点 / 回合 / 余额 / 次数 / 唯一性限制）。</p>}
          </div></details>
          {selected.pool.entries.some((entry) => entry.source === "generated") && <label className="block text-xs">补充关键词（可选，不能突破世界规则）<textarea aria-label="补充关键词" className={field} maxLength={600} value={keywords} onChange={(event) => { setKeywords(event.target.value); setConfirmed(false); }} /></label>}
          <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 我确认1次抽取、当前规则与虚构成本；抽样本身不调用模型、不扣费发奖</label>
          <button className={`${button} ui-button-primary`} disabled={!confirmed || !selected.probabilities.length || context.status !== "active"} onClick={() => void operate(async () => {
            const key = JSON.stringify({ sessionId, parentTurnId, version: context.version, poolId: selected.pool.id, keywords });
            if (drawAttempt.current?.key !== key) drawAttempt.current = { key, id: crypto.randomUUID() };
            install(await prepareGameDraw(sessionId, { requestId: drawAttempt.current.id, parentTurnId, expectedVersion: context.version, poolId: selected.pool.id, keywords, confirmed: true }));
          })}>抽取一次</button>
        </>}
      </>}
    </fieldset>}
    {row && <section className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4" aria-label="当前抽取回执">
      <h3 className="font-semibold">{labels[row.status]}</h3><p className="text-sm">{row.data.pool.name} · 已抽定数量 {row.data.sample.quantity}</p>
      {stale && !["settled", "cancelled"].includes(row.status) && <p role="alert" className="text-sm text-amber-600">存档已推进或恢复检查点。此回执不能移入其他分支或新版本，只能保留查看 / 取消。</p>}
      {row.data.error && <p role="status" className="text-sm text-amber-600">{row.data.error}</p>}
      {confirmation}<AppLink className="block text-xs text-violet-600" href={drawLink(sessionId, parentTurnId, row.id)}>本次回执的固定链接（刷新后可恢复） →</AppLink>
      {row.data.sample.entry.source === "fixed" ? <p className="text-sm">固定物品：{context?.fixedItems.find((item) => item.id === (row.data.sample.entry.source === "fixed" ? row.data.sample.entry.definitionId : ""))?.name ?? row.data.sample.entry.definitionId}。无需模型调用。</p> : <>
        <p className="text-sm">品质 {rankName("quality", row.data.sample.entry.quality)} · 等阶 {rankName("tier", row.data.sample.entry.tier)} · 评级 {rankName("rating", row.data.sample.entry.rating)} · {categories[row.data.sample.entry.category]} · 以上抽样不可改写</p>
        {row.status === "generating" && <p className="text-sm">刷新只会读取状态，不会再次调用模型。如果服务进程重启或结果未知，可取消并保留记录；不会自动接管重试。</p>}
        {item && <fieldset disabled={busy || !canEdit} className="space-y-3">
          <label className="block text-xs">物品名称<input aria-label="物品名称" className={field} maxLength={120} value={item.name} onChange={(event) => { setItem({ ...item, name: event.target.value }); setReviewed(false); }} /></label>
          <label className="block text-xs">物品描述<textarea aria-label="物品描述" className={field} maxLength={600} value={item.description} onChange={(event) => { setItem({ ...item, description: event.target.value }); setReviewed(false); }} /></label>
          <details><summary className="cursor-pointer text-sm">背景、用途、限制与代价（公开物品资料）</summary><div className="mt-3 space-y-2">{([ ["appearance", "外观"], ["source", "当地来源"], ["background", "历史背景"], ["faction", "势力与文化"], ["usage", "使用方式"], ["restrictions", "限制"], ["cost", "代价"], ["targets", "交互对象"] ] as const).map(([key, label]) => <label className="block text-xs" key={key}>{label}<textarea aria-label={label} maxLength={600} className={field} value={item.details[key]} onChange={(event) => { setItem({ ...item, details: { ...item.details, [key]: event.target.value } }); setReviewed(false); }} /></label>)}</div></details>
          <details><summary className="cursor-pointer text-sm">高级：完整设计JSON（宿主固定字段不可改）</summary><textarea aria-label="待确认物品JSON" rows={12} className={`${field} font-mono`} value={raw ?? JSON.stringify(item, null, 2)} onChange={(event) => setRaw(event.target.value)} /><button className={button} onClick={() => { try { setItem(itemDesignSchema.parse(JSON.parse(raw ?? JSON.stringify(item)))); setRaw(null); setReviewed(false); } catch { setError("物品JSON格式无效；未保存。"); } }}>应用物品JSON</button></details>
          <button className={button} disabled={!dirty && row.status === "ready" || raw !== null} onClick={() => void operate(async () => install(await editDrawItem(row, item)))}>保存设计</button>
        </fieldset>}
        {canEdit && ["sampled", "failed"].includes(row.status) && <button className={button} disabled={busy || dirty || row.data.attempts.length >= 3} onClick={() => void operate(async () => {
          if (!await confirm({ title: "补全已抽定物品", modelCall: true, description: "将使用当前模型，产生实际API费用。只补全已抽定的物品，不重抽品质或数量；失败不自动重试。", confirmLabel: "开始生成" })) return;
          const key = `${row.id}:${row.version}`; if (generationAttempt.current?.key !== key) generationAttempt.current = { key, id: crypto.randomUUID() };
          abort.current = new AbortController(); setGenerating(true); try { install(await generateDrawItem(row.id, generationAttempt.current.id, abort.current.signal)); } finally { abort.current = null; setGenerating(false); }
        })}>生成物品描述</button>}
      </>}
      {generating && <button className={button} onClick={() => abort.current?.abort()}>停止本次等待（费用可能已产生）</button>}
      <details><summary className="cursor-pointer text-xs">抽样、费用与来源诊断</summary><p className="break-all text-xs">{row.data.sample.algorithm} · seed {row.data.sample.seed} · 模型尝试 {row.data.attempts.length}/3 · 模型 {row.data.model ?? "未生成"} · 消耗 {row.data.pool.coinCost} 枚虚构钱币（确认入库时扣除）</p></details>
      {row.status === "ready" && !stale && <><label className="block text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> 我已审阅物品及世界约束，确认入库并扣除 {row.data.pool.coinCost} 枚虚构钱币</label><button className={`${button} ui-button-primary`} disabled={busy || dirty || !reviewed} onClick={() => void operate(async () => { install(await settleGameDraw(row)); setContext(await listGameDraws(sessionId, parentTurnId)); })}>确认获得</button></>}
      {row.status !== "settled" && row.status !== "cancelled" && <button className={button} disabled={busy} onClick={() => void operate(async () => { if (await confirm({ title: "取消此次抽取？", description: "不发奖或扣除游戏资源，但已发生的API费用不退。", confirmLabel: "取消抽取", danger: true })) install(await cancelGameDraw(row.id)); })}>取消抽取</button>}
      {row.status === "settled" && <AppLink className="block text-sm text-violet-600" href={`/entertainment?session=${sessionId}&panel=items`}>查看背包与新回合 →</AppLink>}
      {drawId ? <AppLink className="block text-xs text-violet-600" href={drawLink(sessionId, parentTurnId)}>返回此来源回合的获取目录 →</AppLink>
        : <button className={button} disabled={busy || dirty} onClick={() => void operate(async () => { install(null); setContext(await listGameDraws(sessionId, parentTurnId)); })}>返回此来源回合的获取目录</button>}
    </section>}
    {context && <details><summary className="cursor-pointer text-sm">此来源回合的待处理与历史（不混入其他分支）</summary><div className="mt-2 space-y-2">{context.draws.map((entry) => <AppLink key={entry.id} href={drawLink(sessionId, parentTurnId, entry.id)} className="block break-all rounded-lg border p-3 text-xs">{entry.data.pool.name} · {labels[entry.status]} · {entry.id}</AppLink>)}{!context.draws.length && <p className="text-xs text-zinc-500">尚无抽取记录。</p>}</div></details>}
    {context && <details><summary className="cursor-pointer text-sm">所选分支已入库记录（{context.history.length}）</summary><div className="mt-2 space-y-2">{context.history.map((entry) => <AppLink key={entry.id} className="block break-all rounded-lg border p-3 text-xs" href={drawLink(sessionId, entry.parentTurnId, entry.id)}>{entry.data.item?.name ?? context.fixedItems.find((item) => item.id === (entry.data.sample.entry.source === "fixed" ? entry.data.sample.entry.definitionId : ""))?.name ?? entry.data.pool.name} × {entry.data.sample.quantity} · 查看原回执 →</AppLink>)}</div></details>}
  </main>;
}
