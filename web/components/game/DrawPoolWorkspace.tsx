"use client";
import { useEffect, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { getWorldDraft, saveWorldDraft, type WorldDraft } from "@/lib/api/gameWorldClient";
import { drawPoolsSchema, type DrawEntry, type DrawPool } from "@/lib/game/draws/contracts";
import { drawPoolIssues } from "@/lib/game/draws/pools";
import { buttonClass as button, fieldClass as field } from "@/components/ui/Actions";

export function DrawPoolWorkspace({ worldId }: { worldId: string }) {
  const [world, setWorld] = useState<WorldDraft | null>(null); const [pools, setPools] = useState<DrawPool[]>([]); const [baseline, setBaseline] = useState("[]");
  const [selected, setSelected] = useState(0); const [busy, setBusy] = useState(false); const [reviewed, setReviewed] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const dirty = JSON.stringify(pools) !== baseline;
  useNavigationGuard(busy || dirty, "卡池有未保存的更改，请保存或放弃后离开。");
  useEffect(() => { let active = true; void getWorldDraft(worldId).then((row) => { if (!active) return; setWorld(row); setPools(row.content?.drawPools ?? []); setBaseline(JSON.stringify(row.content?.drawPools ?? [])); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败"); }); return () => { active = false; }; }, [worldId]);
  const update = (next: DrawPool[]) => { setPools(next); setReviewed(false); setNotice(""); };
  const pool = pools[selected]; const patch = (value: Partial<DrawPool>) => update(pools.map((row, i) => i === selected ? { ...row, ...value } : row));
  const patchEntry = (index: number, value: DrawEntry) => patch({ entries: pool.entries.map((entry, i) => i === index ? value : entry) });
  const content = world?.content; const issues = content ? drawPoolIssues(pools, { items: content.items.definitions, locations: content.region.locations, ranks: content.ranks, numericPolicy: world!.input.numericPolicy, slots: content.itemRules.slots }) : ["请先完成世界起始草稿。"];
  const addEntry = (source: "fixed" | "generated") => {
    if (!content) return; const id = `entry-${crypto.randomUUID().slice(0, 8)}`;
    const entry: DrawEntry = source === "fixed" ? { id, source, definitionId: content.items.definitions[0]?.id ?? "missing", weight: 1, minQuantity: 1, maxQuantity: 1 }
      : { id, source, theme: "符合当地工艺的材料", category: "material", quality: content.ranks.quality[0].id, tier: content.ranks.tier[0].id, rating: content.ranks.rating[0].id,
        ...(world!.input.numericPolicy === "light" ? { level: 1 } : {}), unique: false, weight: 1, minQuantity: 1, maxQuantity: 1 };
    patch({ entries: [...pool.entries, entry] });
  };
  return <main aria-label="卡池配置工作台" className="mx-auto max-w-4xl space-y-4">
    <AppLink className="text-sm text-violet-600" href={`/entertainment?view=creator&world=${worldId}`}>← 世界创作工作台</AppLink>
    <h2 className="text-2xl font-semibold">卡池配置</h2><p className="text-sm text-zinc-500">配置与概率 → 确认保存 → 发布新修订 → 新存档内获取。仅虚构资源；单抽、无充值 / 保底，不热改旧局。</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-600">{notice}</p>}
    {!world ? <p>正在读取…</p> : !content ? <p>请先在工作台填写或生成世界草稿。</p> : <fieldset disabled={busy} className="space-y-4">
      <div className="flex flex-wrap gap-2">{pools.map((entry, index) => <button className={button} aria-pressed={selected === index} key={index} onClick={() => setSelected(index)}>{entry.name}</button>)}
        <button className={button} disabled={pools.length >= 8} onClick={() => { update([...pools, { id: `pool-${crypto.randomUUID().slice(0, 8)}`, name: "新物资池", explanation: "场外虚构奖励，不赋予NPC抽取知识。", locationId: null, minTick: 0, coinCost: 0, maxDraws: 10, replacement: false, entries: [] }]); setSelected(pools.length); }}>添加卡池</button></div>
      {pool && <section className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4">
        <label className="block text-xs">卡池名称<input aria-label="卡池名称" maxLength={120} className={field} value={pool.name} onChange={(event) => patch({ name: event.target.value })} /></label>
        <label className="block text-xs">世界内来源 / 场外奖励说明<textarea aria-label="来源说明" maxLength={600} className={field} value={pool.explanation} onChange={(event) => patch({ explanation: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">可获取地点<select aria-label="可获取地点" className={field} value={pool.locationId ?? ""} onChange={(event) => patch({ locationId: event.target.value || null })}><option value="">不限地点</option>{content.region.locations.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
          {([ ["coinCost", "每抽虚构钱币", 10000], ["maxDraws", "本分支最多抽取次数", 100], ["minTick", "最早探索回合", 1000000] ] as const).map(([key, label, max]) => <label className="text-xs" key={key}>{label}<input aria-label={label} className={field} type="number" min={key === "maxDraws" ? 1 : 0} max={max} value={pool[key]} onChange={(event) => patch({ [key]: Number(event.target.value) })} /></label>)}</div>
        <label className="block text-sm"><input type="checkbox" checked={pool.replacement} onChange={(event) => patch({ replacement: event.target.checked })} /> 允许条目放回（仍受分支次数与唯一性限制）</label>
        <details open><summary className="cursor-pointer text-sm">条目、品质与权重</summary><p className="my-2 text-xs text-zinc-500">权重按当前可用条目重新归一；0权重不抽。数量在上下限内均匀抽取。人物不会自动知道抽样、关键词或背景。</p>
          <div className="space-y-3">{pool.entries.map((entry, index) => <fieldset key={entry.id} className="space-y-2 rounded-lg border p-3"><legend className="text-sm">{entry.source === "fixed" ? "固定定义" : "关键词生成"} · {entry.id}</legend>
            {entry.source === "fixed" ? <label className="block text-xs">固定物品<select aria-label="固定物品" className={field} value={entry.definitionId} onChange={(event) => patchEntry(index, { ...entry, definitionId: event.target.value })}>{content.items.definitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.details.category}</option>)}</select></label> : <>
              <label className="block text-xs">生成主题<textarea aria-label="生成主题" className={field} maxLength={600} value={entry.theme} onChange={(event) => patchEntry(index, { ...entry, theme: event.target.value })} /></label>
              <label className="block text-xs">物品类别<select aria-label="物品类别" className={field} value={entry.category} onChange={(event) => patchEntry(index, { ...entry, category: event.target.value as typeof entry.category, minQuantity: 1, maxQuantity: 1 })}>{([ ["material", "材料"], ["tool", "工具"], ["equipment", "装备"], ["consumable", "消耗品"] ] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <div className="grid gap-2 sm:grid-cols-3">{([ ["quality", "品质"], ["tier", "等阶"], ["rating", "评级"] ] as const).map(([key, label]) => <label className="text-xs" key={key}>{label}<select aria-label={label} className={field} value={entry[key]} onChange={(event) => patchEntry(index, { ...entry, [key]: event.target.value })}>{content.ranks[key].map((rank) => <option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></label>)}</div>
              {world.input.numericPolicy === "light" && <label className="block text-xs">等级<input aria-label="等级" className={field} type="number" min={1} max={content.ranks.levelsPerTier} value={entry.level ?? 1} onChange={(event) => patchEntry(index, { ...entry, level: Number(event.target.value) })} /></label>}
              <label className="block text-sm"><input type="checkbox" checked={entry.unique} onChange={(event) => patchEntry(index, { ...entry, unique: event.target.checked })} /> 唯一条目（本分支只获取一次）</label>
            </>}
            <div className="grid grid-cols-3 gap-2">{([ ["weight", "权重", 0, 10000], ["minQuantity", "数量下限", 1, 99], ["maxQuantity", "数量上限", 1, 99] ] as const).map(([key, label, min, max]) => <label className="text-xs" key={key}>{label}<input aria-label={label} className={field} type="number" min={min} max={max} value={entry[key]} onChange={(event) => patchEntry(index, { ...entry, [key]: Number(event.target.value) })} /></label>)}</div>
            <p className="text-xs">全部条目可用时概率：{((entry.weight / (pool.entries.reduce((sum, value) => sum + value.weight, 0) || 1)) * 100).toFixed(2)}%（实际按分支资格显示）</p>
            <button className={button} onClick={() => patch({ entries: pool.entries.filter((_, i) => i !== index) })}>移除此条目</button>
          </fieldset>)}</div>
          <div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={!content.items.definitions.length || pool.entries.length >= 20} onClick={() => addEntry("fixed")}>添加固定条目</button><button className={button} disabled={pool.entries.length >= 20} onClick={() => addEntry("generated")}>添加生成条目</button></div>
        </details>
        <button className={button} onClick={() => { update(pools.filter((_, i) => i !== selected)); setSelected(0); }}>删除此卡池（需保存确认）</button>
      </section>}
      {issues.length > 0 && <div role="alert" className="text-sm text-red-600">{issues.map((issue) => <p key={issue}>{issue}</p>)}</div>}
      <label className="block text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> 我已审阅卡池的概率、数量、次数、放回、来源与虚构成本，确认保存</label>
      <button className={`${button} ui-button-primary`} disabled={!dirty || !reviewed || issues.length > 0} onClick={() => { setBusy(true); setError(""); void saveWorldDraft({ ...world, content: { ...content, drawPools: drawPoolsSchema.parse(pools) } }, true).then((row) => { setWorld(row); setBaseline(JSON.stringify(row.content?.drawPools ?? [])); setReviewed(false); setNotice("卡池已保存到世界草稿；请发布新修订并创建新存档，旧局不变。"); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "保存失败")).finally(() => setBusy(false)); }}>保存卡池</button><p className="text-xs text-[var(--workspace-muted)]">{!reviewed ? "请先勾选规则审阅确认。" : issues.length ? "先修正上方检查问题。" : "保存到世界草稿；发布并开始新旅程后生效。"}</p>
      <AppLink className="block text-sm text-violet-600" href={`/entertainment?view=creator&world=${worldId}&section=preview`}>前往预览与发布 →</AppLink>
    </fieldset>}
  </main>;
}
