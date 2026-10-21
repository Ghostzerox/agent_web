"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { getWorldDraft, type WorldDraftDetail } from "@/lib/api/gameWorldClient";
import { createAssetDesign, getAssetDesign, listAssetDesigns, saveAssetDesign, generateAssetDesign, confirmAssetDesign, rebaseAssetDesign,
  type AssetDesignDraft, type AssetDesignSummary } from "@/lib/api/gameAssetDesignClient";
import { ASSET_FIELDS, type AssetField } from "@/lib/game/worlds/assetContracts";
import { assetDesignIssues } from "@/lib/game/worlds/assetValidation";
import { AssetDesignEditor } from "./AssetDesignEditor";
import { buttonClass as button, fieldClass as field, Button, useConfirmAction } from "@/components/ui/Actions";
import { navigateToAppPath } from "@/lib/platform/appNavigation";
import { ASSET_FIELD_LABELS } from "@/lib/game/worlds/assetBlueprint";

const editable = (row: AssetDesignDraft) => JSON.stringify({ brief: row.brief, content: row.content, lockedFields: row.lockedFields });
export function AssetDesignWorkspace({ worldId, kind }: { worldId: string; kind: "item" | "character" }) {
  const { confirm, confirmation } = useConfirmAction();
  const [allFields, setAllFields] = useState(false);
  const [pendingStructure, setPendingStructure] = useState(false);
  const query = useAppQuery(); const id = query.get("design"); const part = query.get("part") ?? "edit";
  const [world, setWorld] = useState<WorldDraftDetail | null>(null); const [list, setList] = useState<AssetDesignSummary[]>([]);
  const [draft, setDraft] = useState<AssetDesignDraft | null>(null); const [baseline, setBaseline] = useState("");
  const [brief, setBrief] = useState(""); const [targetId, setTargetId] = useState(""); const [createdId, setCreatedId] = useState("");
  const [selected, setSelected] = useState<AssetField>("name"); const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false); const [generating, setGenerating] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null); const attempt = useRef<{ key: string; id: string } | null>(null);
  const dirty = pendingStructure || (draft ? editable(draft) !== baseline : Boolean(brief.trim()) && !createdId);
  useNavigationGuard(busy || dirty, busy ? "设计尚未完成，离开可能中断；实际API费用不退。" : "设计有未保存编辑，离开会丢失本地更改。");
  const link = (design?: string, nextPart = "edit") => `/entertainment?view=creator&world=${worldId}&section=design-${kind === "item" ? "items" : "characters"}${design ? `&design=${design}&part=${nextPart}` : ""}`;
  useEffect(() => { if (createdId && !busy) navigateToAppPath(`/entertainment?view=creator&world=${worldId}&section=design-${kind === "item" ? "items" : "characters"}&design=${createdId}&part=edit`); }, [createdId, busy, worldId, kind]);
  const worldLink = `/entertainment?view=creator&world=${worldId}`;
  const install = (row: AssetDesignDraft) => { setDraft(row); setBaseline(editable(row)); setReviewed(false); };
  useEffect(() => { let active = true;
    void Promise.all([getWorldDraft(worldId), listAssetDesigns(worldId), id ? getAssetDesign(id) : null]).then(([current, rows, design]) => {
      if (!active) return; setWorld(current); setList(rows);
      if (design) { if (design.worldId !== worldId || design.content.kind !== kind) throw new Error("设计与所选世界或类别不一致。"); install(design); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败"); });
    return () => { active = false; };
  }, [worldId, id, kind]);
  const operate = async (work: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作未完成，原稿保留。"); } finally { setBusy(false); } };
  const edit = (next: AssetDesignDraft) => { setDraft(next); setReviewed(false); };
  const issues = draft ? assetDesignIssues(draft.sourceSnapshot.input, draft.sourceSnapshot.content, draft.content) : [];
  const stale = Boolean(draft && world && draft.sourceWorldVersion !== world.version); const readonly = Boolean(draft?.appliedWorldVersion);
  const fields = draft ? ASSET_FIELDS.filter((key) => key in draft.content || key === "level" && draft.content.kind === "item" && draft.sourceSnapshot.input.numericPolicy === "light") : [];
  const candidates = kind === "item" ? world?.content?.items.definitions ?? [] : world?.content?.characters ?? [];
  return <section aria-label="道具与人物设计工作台" className="mx-auto max-w-5xl space-y-5">
    {confirmation}<header className="space-y-2"><AppLink className="text-sm text-violet-600" href={worldLink}>← 所属世界创作</AppLink><h2 className="text-2xl font-semibold">{kind === "item" ? "道具与材料设计" : "人物设计"}</h2><p className="text-sm text-zinc-500">设计 → 审阅 → 确认纳入世界草稿 → 发布 / 新建存档。不会自动改变旧局或发奖。</p></header>
    {error && <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-300 p-3 text-sm text-red-600">{error}</p>}{notice && <p role="status" className="rounded-xl border border-violet-300 p-3 text-sm">{notice}</p>}
    {!world && !error && <p>正在读取所属世界…</p>}
    {world && !id && <div className="grid gap-4 lg:grid-cols-2"><form className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4" onSubmit={(event) => { event.preventDefault(); void operate(async () => {
      const row = await createAssetDesign({ worldId, expectedWorldVersion: world.version, kind, brief, ...(targetId ? { targetId } : {}) }); setCreatedId(row.id); setNotice("设计起点已保存；未调用AI，未写入世界或库存。");
    }); }}><h3 className="font-semibold">从部分描述开始</h3><label className="block text-xs">设计描述<textarea aria-label="设计描述" required maxLength={2000} className={field} rows={5} disabled={Boolean(createdId) || busy} value={brief} onChange={(event) => setBrief(event.target.value)} /></label>
      <label className="block text-xs">设计对象<select className={field} disabled={busy || Boolean(createdId)} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">新增{kind === "item" ? "道具 / 材料" : "NPC / 重要角色"}</option>{kind === "character" && !candidates.some((entry) => entry.id === "player") && <option value="player">设计玩家（用户控制）</option>}{candidates.map((entry) => <option key={entry.id} value={entry.id}>重新设计：{entry.name}</option>)}</select></label>
      <details><summary className="cursor-pointer text-xs">半成品创意（只填描述，不调用AI）</summary>{(kind === "item" ? ["一枚磨旧的铜哨，只做定性探索用途，补全工艺、来源与使用限制。", "几片用于修复当地器具的金属材料，补全来源与用途标签。"] : ["一位守护旧记录的重要人物，有自己的需求、误解与不愿透露的往事。", "一个在当地谋生的普通NPC，给出近期目标与有辨识度的表达。"] ).map((idea) => <button type="button" key={idea} className="mt-2 block text-left text-xs text-violet-600" disabled={busy || Boolean(createdId)} onClick={() => setBrief(idea)}>{idea}</button>)}</details>
      <p className="text-xs text-[var(--workspace-muted)]">{!world.content ? "请先为世界生成或填写起始草稿。" : "先创建可编辑设计，不调用AI，也不直接加入世界。"}</p><Button type="submit" variant="primary" disabled={busy || !world.content || !brief.trim() || Boolean(createdId)}>创建设计</Button></form>
      <section className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4"><h3 className="font-semibold">本世界设计草稿</h3>{list.filter((row) => row.kind === kind).map((row) => <AppLink key={row.id} href={link(row.id)} className="block rounded-lg border border-[var(--workspace-border)] p-3 text-sm">{row.name} · 设计v{row.version}<p className="mt-1 text-xs text-zinc-500">绑定世界草稿v{row.sourceWorldVersion} · {row.appliedWorldVersion ? `已纳入v${row.appliedWorldVersion}` : "尚未纳入世界"}</p></AppLink>)}</section></div>}
    {draft && world && <>
      <nav aria-label="设计局部导航" className="flex flex-wrap gap-2 text-xs">{[["edit", "逐字段编辑"], ["preview", "预览与确认"]].map(([key, label]) => <AppLink key={key} href={link(draft.id, key)} className={`rounded-lg border px-3 py-2 ${part === key ? "border-violet-500 text-violet-600" : "border-[var(--workspace-border)]"}`}>{label}</AppLink>)}</nav>
      <div className="space-y-2 text-xs text-zinc-500"><p>{readonly ? "已加入世界 · 只读" : dirty ? "未保存更改" : "已保存，尚未加入世界"}</p><details><summary>来源与版本</summary><p>设计v{draft.version} · 所属世界v{draft.sourceWorldVersion} / 当前v{world.version} · {draft.content.id}</p></details><div className="flex flex-wrap gap-2"><button className={`${button} ui-button-primary`} disabled={busy || readonly || !dirty || pendingStructure} onClick={() => void operate(async () => { install(await saveAssetDesign(draft)); setNotice("设计已保存，仍未改变世界或库存。"); })}>保存设计草稿</button>
        <button className={button} disabled={busy} onClick={() => void operate(async () => { if (dirty && !await confirm({ title: "放弃修改并重新加载？", description: "未保存的设计修改会丢失，已保存内容保持不变。", confirmLabel: "放弃并加载", danger: true })) return; install(await getAssetDesign(draft.id)); setWorld(await getWorldDraft(worldId)); })}>重新加载</button></div>
        {stale && !readonly && <div className="rounded-lg border border-amber-300 p-3"><p>所属世界已变化，暂停生成与确认。保留设计，重新绑定当前世界后逐项审阅，不自动抹去冲突。</p><button className={button} disabled={busy || dirty} onClick={() => void operate(async () => { if (!await confirm({ title: "适配当前世界？", description: "保留设计内容，更新引用的世界版本，之后需要重新审阅约束和引用。", confirmLabel: "适配世界" })) return; install(await rebaseAssetDesign(draft, world.version)); setNotice("已重新绑定，内容未自动修正，请检查冲突。"); })}>重新适配当前世界</button></div>}
        {readonly && <p className="rounded-lg border p-3">已确认纳入世界草稿v{draft.appliedWorldVersion}，本设计只读；不等于发放库存。继续修改请创建重新设计稿。</p>}
      </div>
      {part === "edit" ? <section className="space-y-4 rounded-xl border border-[var(--workspace-border)] p-4"><fieldset className="space-y-4" disabled={busy || readonly}>
        <label className="block text-xs">设计描述<textarea aria-label="设计描述" className={field} maxLength={2000} rows={3} value={draft.brief} onChange={(event) => edit({ ...draft, brief: event.target.value })} /></label>
        <p className="text-xs text-zinc-500">来源：{draft.origins[selected] === "ai" ? "AI补充，待审阅" : "用户 / 手动起始结构"}</p><label className="text-sm"><input type="checkbox" checked={draft.lockedFields.includes(selected)} onChange={(event) => edit({ ...draft, lockedFields: event.target.checked ? [...draft.lockedFields, selected] : draft.lockedFields.filter((key) => key !== selected) })} /> 锁定当前字段（仍可手动编辑）</label>
        <AssetDesignEditor key={selected} content={draft.content} selected={selected} fields={fields} onSelect={setSelected} world={draft.sourceSnapshot.content} onPendingChange={setPendingStructure} onChange={(content) => edit({ ...draft, content })} onError={setError} />
      </fieldset><div className="flex flex-wrap gap-2 border-t border-[var(--workspace-border)] pt-3"><label className="text-sm">生成范围<select className={field} value={allFields ? "all" : "selected"} onChange={(event) => setAllFields(event.target.value === "all")} disabled={busy}><option value="selected">仅当前字段</option><option value="all">全部未保护字段（覆盖）</option></select></label><button className={button} disabled={busy || readonly || dirty || stale || (allFields ? fields.every((key) => draft.lockedFields.includes(key)) : draft.lockedFields.includes(selected))} onClick={() => void operate(async () => {
        const requested = allFields ? fields.filter((key) => !draft.lockedFields.includes(key)) : [selected];
        if (!await confirm({ title: "生成设计内容", modelCall: true, description: `将覆盖：${requested.map((key) => ASSET_FIELD_LABELS[key]).join("、")}。使用当前模型，可能产生API费用；成功后保存到设计稿，不直接加入世界，失败不自动重试。`, confirmLabel: "开始生成" })) return;
         const key = `${draft.id}:${draft.version}:${requested.join(",")}`; if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
        abort.current = new AbortController(); setGenerating(true);
        try { install(await generateAssetDesign(draft, requested, attempt.current.id, abort.current.signal)); attempt.current = null; setNotice("补充设计已保存，尚未确认纳入世界。"); } finally { setGenerating(false); abort.current = null; }
      })}>生成设计</button>{generating && <button className={button} onClick={() => abort.current?.abort()}>取消生成</button>}</div><p className="text-xs text-[var(--workspace-muted)]">{pendingStructure ? "JSON修改尚未应用，请先应用到表单。" : dirty ? "请先保存更改。" : stale ? "世界已变化，请先适配当前世界。" : readonly ? "已加入世界的设计只读。" : draft.lockedFields.includes(selected) && !allFields ? "当前字段已保护；取消保护并保存后可生成。" : "生成前会确认范围与可能费用；取消不退还已用费用。"}</p></section>
      : <section className="space-y-4 rounded-xl border border-[var(--workspace-border)] p-4"><h3 className="font-semibold">{draft.content.name} · 确认前预览</h3>
        {draft.content.kind === "item" ? <div className="space-y-2 text-sm"><p>{draft.content.description}</p><p>品质 {draft.content.quality} · 评级 {draft.content.rating} · 等阶 {draft.content.tier}{draft.content.level !== undefined ? ` · ${draft.content.level}级` : " · 无强制等级"}</p><p>{draft.content.details.appearance} · {draft.content.details.source}</p><details><summary className="cursor-pointer">背景、限制与使用规则</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ details: draft.content.details, useEffect: draft.content.useEffect }, null, 2)}</pre></details><p className="text-xs text-zinc-500">只纳入定义，不发放实例。初始放置在世界草稿另行配置；发布并新建存档后才出现。</p></div>
          : <div className="space-y-2 text-sm"><p>{draft.content.category} · {draft.content.identity} · {draft.content.personality}</p><p>公开：{draft.content.profile.publicBackground}</p><details><summary className="cursor-pointer">设计视图：本人资料、秘密与主持备注</summary><pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(draft.content.profile, null, 2)}</pre><p className="text-xs">本人只得到自己的经历 / 动机与授权资料；主持备注不传给本人，其他NPC不自动知情。玩家始终由用户控制。</p></details></div>}
        {issues.length > 0 ? <div role="alert" className="text-sm text-red-600">{issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : <p className="text-sm text-emerald-600">结构与已声明规则检查通过；文字语义与世界观一致性仍需审阅。</p>}
        <label className="block text-sm"><input type="checkbox" checked={reviewed} disabled={readonly} onChange={(event) => setReviewed(event.target.checked)} /> 我已审阅世界约束、公开 / 本人 / 主持范围，确认纳入当前世界草稿</label>
        <button className={`${button} ui-button-primary`} disabled={busy || readonly || dirty || stale || !reviewed || issues.length > 0} onClick={() => void operate(async () => { const result = await confirmAssetDesign(draft); install(await getAssetDesign(draft.id)); setWorld(await getWorldDraft(worldId)); setNotice(`已纳入世界草稿v${result.appliedWorldVersion}；尚未发布，旧局和库存不变。`); })}>加入世界</button><p className="text-xs text-[var(--workspace-muted)]">{readonly ? "已经加入世界，发布新版本后用于新旅程。" : dirty ? "请先保存更改。" : stale ? "请先适配当前世界。" : !reviewed ? "请先勾选审阅确认。" : issues.length ? "请先修正检查问题。" : "只加入世界草稿，不发放物品，不改变旧旅程。"}</p>
        <AppLink className="block text-sm text-violet-600" href={`${worldLink}&section=${kind === "item" ? "items" : "characters"}`}>查看世界定义 / 初始配置 →</AppLink><AppLink className="block text-sm text-violet-600" href={`${worldLink}&section=preview`}>前往世界预览与发布 →</AppLink>
      </section>}
    </>}
  </section>;
}
