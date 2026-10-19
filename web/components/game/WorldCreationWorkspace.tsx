"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { WORLD_SECTIONS, type WorldBrief, type WorldSection } from "@/lib/game/worlds/contracts";
import { blankWorldBlueprint, WORLD_SECTION_LABELS } from "@/lib/game/worlds/blueprint";
import { worldDraftIssues } from "@/lib/game/worlds/compile";
import { createWorldDraft, getWorldDraft, listWorldDrafts, saveWorldDraft, generateWorldDraft, publishWorldDraft, createPublishedWorldSave,
  type WorldDraft, type WorldDraftSummary, type WorldDraftDetail } from "@/lib/api/gameWorldClient";
import { WorldSectionEditor, worldButtonClass as button, worldFieldClass as field } from "./WorldSectionEditor";

const formState = (draft: WorldDraft) => JSON.stringify({ input: draft.input, content: draft.content, locked: draft.lockedSections });
const creatorLink = (id?: string, section = "brief") => `/entertainment?view=creator${id ? `&world=${encodeURIComponent(id)}&section=${section}` : ""}`;

export function WorldCreationWorkspace() {
  const query = useAppQuery(); const id = query.get("world"); const section = query.get("section") ?? "brief";
  const [list, setList] = useState<WorldDraftSummary[]>([]); const [draft, setDraft] = useState<WorldDraft | null>(null);
  const [input, setInput] = useState<WorldBrief>({ brief: "", constraints: [], magic: "forbidden", numericPolicy: "qualitative" });
  const [revisions, setRevisions] = useState<WorldDraftDetail["revisions"]>([]); const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null); const [saveId, setSaveId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const abort = useRef<AbortController | null>(null); const generationAttempt = useRef<{ key: string; id: string } | null>(null);
  const saveAttempt = useRef<{ revision: number; requestId: string } | null>(null);
  const dirty = draft ? formState(draft) !== baseline : !id && Boolean(input.brief.trim()) && !createdId;
  useNavigationGuard(busy || dirty, busy ? "世界操作尚未完成，离开可能中断生成；已产生API费用不会退还。" : "有未保存的世界草稿，离开创作页可能丢失编辑。");
  const install = (next: WorldDraft) => { setDraft(next); setBaseline(formState(next)); setReviewed(false); };
  useEffect(() => {
    let active = true;
    void (id ? getWorldDraft(id).then((value) => { if (active) { install(value); setRevisions(value.revisions); } })
      : listWorldDrafts().then((value) => { if (active) setList(value); })).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败"); });
    return () => { active = false; };
  }, [id]);
  const operate = async (work: () => Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，编辑已保留。"); } finally { setBusy(false); } };
  const edit = (next: WorldDraft) => { setDraft(next); setReviewed(false); };
  const issues = draft ? worldDraftIssues(draft.input, draft.content) : [];
  const selected = WORLD_SECTIONS.includes(section as WorldSection) ? section as WorldSection : null;
  return <main className="mx-auto max-w-6xl space-y-5" aria-label="世界创作工作台">
    <header className="space-y-2"><AppLink href="/entertainment?view=worlds" className="text-sm text-violet-600">← 世界与存档</AppLink><h2 className="text-2xl font-semibold">世界创作工作台</h2><p className="text-sm text-zinc-500">粗略描述 → 可编辑草稿 → 校验 / 审阅 → 发布修订 → 创建可玩存档。不会覆盖正在玩的世界。</p></header>
    {error && <p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-300 p-3 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-violet-300 p-3 text-sm">{notice}</p>}
    {!id && <div className="grid gap-5 lg:grid-cols-2">
      <form className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4" onSubmit={(event) => { event.preventDefault(); void operate(async () => { const created = await createWorldDraft(input); setCreatedId(created.id); setNotice("原始描述已存到服务端；尚未调用AI或创建游戏存档。"); }); }}>
        <h3 className="font-semibold">从一个想法开始</h3>
        <label className="block text-xs">粗略世界描述<textarea required disabled={Boolean(createdId)} maxLength={4000} rows={5} className={field} value={input.brief} onChange={(event) => setInput({ ...input, brief: event.target.value })} /></label>
        {!createdId && <BriefOptions input={input} onChange={setInput} />}
        <button disabled={busy || !input.brief.trim() || Boolean(createdId)} className={button}>保存创作起点（不调用AI）</button>
        {createdId && <AppLink href={creatorLink(createdId)} className="block text-sm text-violet-600">进入已保存草稿 →</AppLink>}
      </form>
      <section className="space-y-3 rounded-xl border border-[var(--workspace-border)] p-4"><h3 className="font-semibold">服务端草稿</h3>{list.length === 0 && <p className="text-sm text-zinc-500">还没有草稿。创建后可以随时回来编辑。</p>}{list.map((row) => <AppLink key={row.id} href={creatorLink(row.id)} className="block rounded-lg border border-[var(--workspace-border)] p-3 text-sm"><span className="font-semibold">{row.name}</span><p className="mt-1 text-xs text-zinc-500">{row.brief} · 草稿v{row.version}</p></AppLink>)}</section>
    </div>}
    {id && !draft && !error && <p>正在读取世界草稿…</p>}
    {draft && <>
      <nav className="flex flex-wrap gap-2 text-xs" aria-label="世界创作局部导航">{[["brief", "原始描述"], ...WORLD_SECTIONS.map((key) => [key, WORLD_SECTION_LABELS[key]]), ["design-items", "道具设计"], ["design-characters", "人物设计"], ["preview", "预览与发布"]].map(([key, title]) => <AppLink key={key} href={creatorLink(draft.id, key)} className={`rounded-lg border px-3 py-2 ${section === key ? "border-violet-500 text-violet-600" : "border-[var(--workspace-border)]"}`}>{title}</AppLink>)}</nav>
      <div className="flex flex-wrap gap-2 text-xs text-zinc-500"><span>草稿v{draft.version} · {dirty ? "有未保存更改" : "已保存"}</span><button className={button} disabled={busy || !dirty} onClick={() => void operate(async () => { install(await saveWorldDraft(draft)); setNotice("草稿已保存；未改变任何游玩存档。"); })}>保存草稿</button>
        <button className={button} disabled={busy} onClick={() => void operate(async () => { if (dirty && !window.confirm("将放弃本地未保存的表单编辑；需要保留的内容请先复制。确定从服务端重读？")) return; const fresh = await getWorldDraft(draft.id); install(fresh); setRevisions(fresh.revisions); setNotice("已从服务端重读。"); })}>从服务端重读</button>
      </div>
      <section className="space-y-4 rounded-xl border border-[var(--workspace-border)] p-4" aria-label="当前创作部分">
        <fieldset disabled={busy} className="space-y-4">
        {section === "brief" && <><h3 className="font-semibold">原始描述与硬约束（用户提供）</h3><label className="block text-xs">粗略世界描述<textarea maxLength={4000} rows={5} className={field} value={draft.input.brief} onChange={(event) => edit({ ...draft, input: { ...draft.input, brief: event.target.value } })} /></label><BriefOptions input={draft.input} onChange={(value) => edit({ ...draft, input: value })} /><p className="text-xs text-zinc-500">AI不能改写这些字段。任意自然语言约束仍需人工审阅，结构校验不等于证明故事完全一致。</p></>}
        {selected && <><h3 className="font-semibold">{WORLD_SECTION_LABELS[selected]}</h3><p className="text-xs text-zinc-500">来源：{draft.origins[selected] === "ai" ? "AI补充，尚需你审阅" : draft.origins[selected] === "user" ? "用户编辑" : "尚未填写"}</p>
          <label className="text-sm"><input type="checkbox" checked={draft.lockedSections.includes(selected)} onChange={(event) => edit({ ...draft, lockedSections: event.target.checked ? [...draft.lockedSections, selected] : draft.lockedSections.filter((key) => key !== selected) })} /> 锁定此部分，AI不得重生成（仍可手动编辑）</label>
          {draft.content ? <WorldSectionEditor content={draft.content} section={selected} onChange={(content) => edit({ ...draft, content })} onError={setError} /> : <p className="text-sm text-zinc-500">先生成完整草稿，或从手动起始表单填写。</p>}
        </>}
        </fieldset>
        {(selected || section === "brief") && <div className="space-y-3 border-t border-[var(--workspace-border)] pt-3">
          {!draft.content && <button disabled={busy} className={button} onClick={() => edit({ ...draft, content: blankWorldBlueprint(draft.input) })}>填写手动起始表单（不调用AI）</button>}
          <button className={button} disabled={busy || dirty} onClick={() => void operate(async () => {
            if (!window.confirm("将调用已配置模型并产生API费用。不会自动重试或改动存档，继续？")) return;
            const sections = draft.content && selected ? [selected] : [...WORLD_SECTIONS];
            const key = `${draft.id}:${draft.version}:${sections.join(",")}`;
            if (generationAttempt.current?.key !== key) generationAttempt.current = { key, id: crypto.randomUUID() };
            abort.current = new AbortController(); setGenerating(true);
            try { install(await generateWorldDraft(draft.id, draft.version, sections, generationAttempt.current.id, abort.current.signal)); generationAttempt.current = null; setNotice("AI草稿已保存，请分部分审阅；不会自动发布。"); } finally { abort.current = null; setGenerating(false); }
          })}>{draft.content && selected ? "AI重生成当前部分（可能费用）" : "AI生成完整草稿（可能费用）"}</button>
          {generating && <button className={button} onClick={() => abort.current?.abort()}>取消生成（已用费用不退）</button>}
          {dirty && <p className="text-xs text-amber-600">请先保存更改再生成或发布。</p>}
        </div>}
        {section === "preview" && <>
          <h3 className="font-semibold">预览与发布</h3>{draft.content && <div className="space-y-3 text-sm"><h4>{draft.content.overview.name}</h4><p>{draft.content.overview.premise}</p><p>时代：{draft.content.overview.era} · 技术：{draft.content.overview.technology}</p><p>区域：{draft.content.region.name} · {draft.content.region.locations.length}个地点 · {draft.content.characters.length}名基础人物</p><p>数值：{draft.input.numericPolicy === "qualitative" ? "定性（无强制等级或战斗属性）" : (draft.input.numericPolicy === "specified" ? "指定属性（无强制等级）" : "轻数值（字典与等级）")}</p>
            <details><summary className="cursor-pointer">地图与初始交互</summary>{draft.content.region.locations.map((place) => <p key={place.id}>{place.name} → {place.exits.map((key) => draft.content!.region.locations.find((entry) => entry.id === key)?.name ?? key).join("、")}</p>)}<p>{draft.content.hook.name}：{draft.content.hook.description}</p></details>
            <details><summary className="cursor-pointer">硬约束与作者秘密（仅设计视图）</summary><p>{draft.input.constraints.join("；") || "无额外文本约束"}</p><p>{draft.content.authorNotes.join("\n")}</p>{draft.content.lore.filter((entry) => entry.visibility === "author").map((entry) => <p key={entry.id}>{entry.text} · 知情者：{entry.knownBy.join("、") || "无NPC"}</p>)}</details>
          </div>}
          {issues.length > 0 ? <div role="alert" className="space-y-1 text-sm text-red-600">{issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : <p className="text-sm text-emerald-600">结构、引用、连通性和明确政策校验通过；不代表所有文字语义已确认。</p>}
          <label className="block text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> 我已审阅当前草稿、硬约束与公开 / 隐藏设定，确认发布本版本</label>
          <button className={button} disabled={busy || dirty || !reviewed || issues.length > 0} onClick={() => void operate(async () => { const result = await publishWorldDraft(draft.id, draft.version); const fresh = await getWorldDraft(draft.id); install(fresh); setRevisions(fresh.revisions); setNotice(`已发布修订r${result.revision}，尚未创建存档；旧局仍引用原修订。`); })}>确认发布当前草稿</button>
          <section className="space-y-2 border-t border-[var(--workspace-border)] pt-3"><h4 className="text-sm font-semibold">已发布修订（创建存档不调用AI）</h4>{revisions.map((revision) => <div key={revision.revision} className="flex flex-wrap items-center gap-2 text-xs"><span>r{revision.revision} · 来自草稿v{revision.draftVersion}</span><button className={button} disabled={busy} onClick={() => void operate(async () => {
            if (!window.confirm(`基于r${revision.revision}创建新存档？不会替换已有故事。`)) return;
            if (saveAttempt.current?.revision !== revision.revision) saveAttempt.current = { revision: revision.revision, requestId: crypto.randomUUID() };
            const result = await createPublishedWorldSave(draft.id, revision.revision, saveAttempt.current.requestId); setSaveId(result.id); saveAttempt.current = null; setNotice("新存档已创建，打开后确认开启探索；没有模型调用。");
          })}>以r{revision.revision}创建存档</button></div>)}{saveId && <AppLink className="block text-sm text-violet-600" href={`/entertainment?session=${saveId}`}>打开新存档并开启探索 →</AppLink>}</section>
        </>}
      </section>
    </>}
  </main>;
}

function BriefOptions({ input, onChange }: { input: WorldBrief; onChange: (value: WorldBrief) => void }) {
  return <div className="space-y-3"><label className="block text-xs">硬约束（每行一项）<textarea className={field} rows={3} value={input.constraints.join("\n")} onChange={(event) => onChange({ ...input, constraints: event.target.value.split("\n").filter(Boolean) })} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">超自然政策<select className={field} value={input.magic} onChange={(event) => onChange({ ...input, magic: event.target.value as WorldBrief["magic"] })}><option value="forbidden">禁止超自然能力</option><option value="allowed">允许，须定义规则与代价</option></select></label><label className="text-xs">数值策略<select className={field} value={input.numericPolicy} onChange={(event) => onChange({ ...input, numericPolicy: event.target.value as WorldBrief["numericPolicy"] })}><option value="qualitative">定性世界</option><option value="light">轻数值世界</option><option value="specified">仅指定属性（不强制等级）</option></select></label></div>
  </div>;
}
