"use client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/platform/AppLink";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { replaceCurrentAppPath, navigateToAppPath } from "@/lib/platform/appNavigation";
import { Button, Feedback, fieldClass as field, useConfirmAction } from "@/components/ui/Actions";
import { WORLD_SECTIONS, type WorldBrief, type WorldSection, type WorldGenerationDiagnostics } from "@/lib/game/worlds/contracts";
import { blankWorldBlueprint, WORLD_SECTION_LABELS } from "@/lib/game/worlds/blueprint";
import { worldDraftIssues } from "@/lib/game/worlds/compile";
import { createWorldDraft, getWorldDraft, listWorldDrafts, saveWorldDraft, generateWorldDraft, publishWorldDraft, createPublishedWorldSave,
  WorldGenerationClientError, type WorldDraft, type WorldDraftSummary, type WorldDraftDetail } from "@/lib/api/gameWorldClient";
import { WorldSectionEditor } from "./WorldSectionEditor";
import { WorldGenerationRecovery } from "./WorldGenerationRecovery";
import { WorldCreationNavigation, creatorLink, issueSection } from "./WorldCreationNavigation";
import styles from "./worldCreation.module.css";

const formState = (draft: WorldDraft) => JSON.stringify({ input: draft.input, content: draft.content, locked: draft.lockedSections });
const externalSections = ["design-items", "design-characters", "draw-pools", "design-events"];

export function WorldCreationWorkspace() {
  const query = useAppQuery(); const id = query.get("world");
  const section = query.get("section") ?? "brief";
  const [list, setList] = useState<WorldDraftSummary[]>([]); const [draft, setDraft] = useState<WorldDraft | null>(null);
  const [input, setInput] = useState<WorldBrief>({ brief: "", constraints: [], magic: "forbidden", numericPolicy: "qualitative" });
  const [revisions, setRevisions] = useState<WorldDraftDetail["revisions"]>([]); const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [generating, setGenerating] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null); const [saveId, setSaveId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false); const [whole, setWhole] = useState(false);
  const [pendingStructure, setPendingStructure] = useState(false); const [editorEpoch, setEditorEpoch] = useState(0);
  const [recovery, setRecovery] = useState<WorldGenerationDiagnostics | null>(null);
  const abort = useRef<AbortController | null>(null); const generationAttempt = useRef<{ key: string; id: string } | null>(null);
  const saveAttempt = useRef<{ revision: number; requestId: string } | null>(null);
  const { confirm, confirmation } = useConfirmAction();
  const dirty = pendingStructure || (draft ? formState(draft) !== baseline : !id && Boolean(input.brief.trim()) && !createdId);
  useNavigationGuard(busy || dirty, busy ? "世界操作尚未完成，离开可能中断生成；已产生API费用不会退还。" : "有未保存的世界草稿，离开创作页可能丢失编辑。");
  useEffect(() => { if (createdId && !busy) navigateToAppPath(creatorLink(createdId)); }, [createdId, busy]);
  const install = (next: WorldDraft) => { setDraft(next); setBaseline(formState(next)); setReviewed(false); setPendingStructure(false); setEditorEpoch((value) => value + 1); setRecovery(null); };
  useEffect(() => {
    let active = true;
    void (id ? getWorldDraft(id).then((value) => { if (active) { install(value); setRevisions(value.revisions); } })
      : listWorldDrafts().then((value) => { if (active) setList(value); })).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "读取失败"); });
    return () => { active = false; };
  }, [id]);
  const operate = async (work: () => Promise<void>) => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，编辑已保留。"); if (reason instanceof WorldGenerationClientError && reason.diagnostics) setRecovery(reason.diagnostics); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const edit = (next: WorldDraft) => { setDraft(next); setReviewed(false); };
  const chooseSection = (next: string) => {
    if (!draft || busy) return;
    if (externalSections.includes(next)) { navigateToAppPath(creatorLink(draft.id, next)); return; }
    if (pendingStructure) { setError("高级JSON尚未应用，请先应用修改或放弃JSON编辑，再切换分区。"); return; }
    setWhole(false); replaceCurrentAppPath(creatorLink(draft.id, next));
  };
  const issues = draft ? worldDraftIssues(draft.input, draft.content) : [];
  const selected = WORLD_SECTIONS.includes(section as WorldSection) ? section as WorldSection : null;
  const generationSections = draft?.content && selected && !whole ? [selected] : [...WORLD_SECTIONS];
  const unlockedSections = generationSections.filter((key) => !draft?.lockedSections.includes(key));
  const generationKey = draft ? `${draft.id}:${draft.version}:${generationSections.join(",")}` : "";
  const generationBlocked = pendingStructure ? "高级JSON尚未应用，请先应用或放弃JSON编辑。"
    : dirty ? "请先保存更改，再生成。" : !unlockedSections.length ? "当前部分已锁定，需取消保护并保存后才能生成。"
    : draft && !draft.content && draft.lockedSections.length ? "首次生成需取消空白部分的保护并保存，或先手动填写。"
    : draft?.content?.items.definitions.length && generationSections.includes("items") ? "已有道具不能用整稿生成覆盖，请选择具体部分或进入道具设计。" : "";
  const generate = async () => {
    if (!draft || generationBlocked || busy) return;
    if (!await confirm({ title: "确认AI世界生成", modelCall: true, confirmLabel: "开始生成", description: <><p>将生成并保存：{unlockedSections.map((key) => WORLD_SECTION_LABELS[key]).join("、")}。</p><p>{draft.content ? "这些部分的原内容会被替换，锁定部分不变。" : "根据描述生成可编辑的世界草稿。"}使用模型设置中的当前服务，可能产生API费用；失败不自动重试，取消不退还已用费用。不会发布或改变旧存档。</p></> })) return;
    void operate(async () => {
      if (generationAttempt.current?.key !== generationKey) generationAttempt.current = { key: generationKey, id: crypto.randomUUID() };
      abort.current = new AbortController(); setGenerating(true);
      try { install(await generateWorldDraft(draft.id, draft.version, generationSections, generationAttempt.current.id, abort.current.signal)); generationAttempt.current = null; setNotice("AI草稿已保存，待你审阅；检查与发布后才用于新旅程。"); }
      finally { abort.current = null; setGenerating(false); }
    });
  };
  const startSave = (revision: number) => void operate(async () => {
    if (!draft || !await confirm({ title: "开始新旅程", confirmLabel: "创建新旅程", description: `将使用已发布版本r${revision}创建一个新存档，不替换旧旅程、不调用AI。` })) return;
    if (saveAttempt.current?.revision !== revision) saveAttempt.current = { revision, requestId: crypto.randomUUID() };
    const result = await createPublishedWorldSave(draft.id, revision, saveAttempt.current.requestId); setSaveId(result.id); saveAttempt.current = null; setNotice("新旅程已创建，打开后即可确认开始探索。");
  });
  return <main className={styles.workspace} aria-label="世界创作工作台">
    {confirmation}
    <header className={styles.heading}><div><AppLink href={draft ? "/entertainment?view=creator" : "/entertainment"} className="ui-kicker">娱乐 / 我的世界</AppLink><h2>{draft?.content?.overview.name ?? "世界创作工作台"}</h2><p>把想法变成可自由探索的世界。</p></div>
      {draft && <details className="ui-more"><summary className="ui-button ui-button-quiet">更多</summary><div><Button variant="quiet" disabled={busy} onClick={() => void operate(async () => {
        if ((dirty || recovery) && !await confirm({ title: "放弃本地修改并重新加载？", danger: true, confirmLabel: "放弃并加载", description: "未保存编辑和本次失败生成结果将被丢弃，服务端草稿不受影响。" })) return;
        const fresh = await getWorldDraft(draft.id); install(fresh); setRevisions(fresh.revisions); setNotice("已重新加载。");
      })}>重新加载</Button><p className="p-2 text-xs text-[var(--workspace-muted)]">草稿版本 {draft.version}<br />仅新旅程使用新发布版本</p></div></details>}
    </header>
    <div className={styles.steps}><span aria-current={!draft ? "step" : undefined}>1 描述世界</span><span aria-current={draft && section !== "preview" ? "step" : undefined}>2 完善设定</span><span aria-current={section === "preview" ? "step" : undefined}>3 检查与开始</span></div>
    <Feedback error={error} notice={notice} />
    {recovery && draft && <WorldGenerationRecovery key={`${recovery.worldId}:${recovery.requestId}`} diagnostics={recovery} draft={draft} disabled={busy || dirty} onApply={(content) => { edit({ ...draft, content }); setRecovery(null); setError(""); setNotice("修正结果已应用到表单，尚未保存；保存后可继续检查与发布。没有调用AI。"); }} onDiscard={() => { setRecovery(null); setError(""); }} />}
    {!id && <div className="grid gap-6 lg:grid-cols-2"><form className={`${styles.panel} space-y-4`} onSubmit={(event) => { event.preventDefault(); void operate(async () => { const created = await createWorldDraft(input); setCreatedId(created.id); }); }}>
      <h3>从一个想法开始</h3><label className="block text-sm">粗略世界描述<textarea required disabled={busy || Boolean(createdId)} placeholder="例如：没有魔法的海边城市，人们以手艺和航海为生……" maxLength={4000} rows={6} className={field} value={input.brief} onChange={(event) => setInput({ ...input, brief: event.target.value })} /></label>
      <BriefOptions input={input} onChange={setInput} /><p className={styles.metadata}>先保存描述，再选择AI补全或手动填写；创建本身不调用AI。</p>
      <Button type="submit" variant="primary" disabled={busy || !input.brief.trim() || Boolean(createdId)}>{busy ? "创建中…" : "创建世界"}</Button>
    </form><section className={`${styles.panel} space-y-3`}><h3>我的世界</h3>{!list.length && <p className={styles.metadata}>还没有世界。从描述开始，不必先设计完整人物与故事。</p>}{list.map((row) => <AppLink key={row.id} href={creatorLink(row.id, "overview")} className="module-card"><strong>{row.name}</strong><p className={styles.metadata}>{row.brief}</p><span className="text-sm text-[var(--workspace-accent)]">继续编辑 →</span></AppLink>)}</section></div>}
    {id && !draft && !error && <p role="status">正在读取世界草稿…</p>}
    {draft && <div className={styles.body}><WorldCreationNavigation id={draft.id} section={section} onSelect={chooseSection} /><div className={styles.editor}>
      <section className={`${styles.panel} space-y-5`} aria-label="当前创作部分"><fieldset disabled={busy} className="space-y-4">
        {section === "brief" && <><h3>创作描述</h3><p className={styles.metadata}>你的描述与规则由你决定，AI不会改写。</p><label className="block text-sm">粗略世界描述<textarea maxLength={4000} rows={5} className={field} value={draft.input.brief} onChange={(event) => edit({ ...draft, input: { ...draft.input, brief: event.target.value } })} /></label><BriefOptions input={draft.input} onChange={(value) => edit({ ...draft, input: value })} /></>}
        {selected && <><h3>{WORLD_SECTION_LABELS[selected]}</h3><p className={styles.metadata}>{draft.origins[selected] === "ai" ? "AI补充，待审阅" : "按你的想法编辑；更改后记得保存。"}</p>
          {draft.content ? <WorldSectionEditor key={`${selected}:${editorEpoch}`} content={draft.content} section={selected} onChange={(content) => edit({ ...draft, content })} onError={setError} onPendingChange={setPendingStructure} /> : <p className="text-sm">先选择生成草稿或手动开始。</p>}
          <details><summary className="text-sm text-[var(--workspace-muted)]">保护此部分</summary><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.lockedSections.includes(selected)} onChange={(event) => edit({ ...draft, lockedSections: event.target.checked ? [...draft.lockedSections, selected] : draft.lockedSections.filter((key) => key !== selected) })} /> AI不改写此部分，仍可手动编辑</label></details>
        </>}
      </fieldset>
      {(selected || section === "brief") && <div className={styles.generation}>
        {!draft.content && <><p className="text-sm">还没有草稿。让AI补全，或载入空白表单亲自设计。</p><Button disabled={busy} onClick={() => { edit({ ...draft, content: blankWorldBlueprint(draft.input) }); setNotice("手动表单已载入，尚未保存；可以直接进入各分区编辑。"); }}>手动开始</Button></>}
        <div>{draft.content && selected && <select aria-label="AI生成范围" className={field} disabled={busy} value={whole ? "all" : "section"} onChange={(event) => setWhole(event.target.value === "all")}><option value="section">仅当前部分</option><option value="all">全部未保护部分（覆盖）</option></select>}
          <Button disabled={busy || Boolean(generationBlocked)} aria-describedby="world-generation-help" onClick={() => void generate()}>{draft.content && selected && !whole ? "生成此部分" : "生成草稿"}</Button>
          {generating && <Button onClick={() => abort.current?.abort()}>取消生成</Button>}</div>
        <p id="world-generation-help" className={styles.metadata}>{generationBlocked || "确认范围后才调用AI，可能产生费用；成功后自动保存草稿，不会发布。"}</p>
      </div>}
      {section === "preview" && <><h3>检查与发布</h3>{draft.content && <div className="space-y-3 text-sm"><h4 className="font-semibold">{draft.content.overview.name}</h4><p>{draft.content.overview.premise}</p><p>{draft.content.overview.era} · {draft.content.region.name} · {draft.content.region.locations.length}个地点</p><p>{draft.content.characters.length}名预设人物 · {draft.content.hook ? "含可选初始交互" : "无预设事件，可以自由行动"}</p><details><summary>地图与初始交互</summary>{draft.content.region.locations.map((place) => <p key={place.id}>{place.name} → {place.exits.map((key) => draft.content!.region.locations.find((entry) => entry.id === key)?.name ?? key).join("、")}</p>)}</details><details><summary>作者资料（不会公开给所有人物）</summary><p>{draft.input.constraints.join("；")}</p><p>{draft.content.authorNotes.join("\n")}</p>{draft.content.lore.filter((entry) => entry.visibility === "author").map((entry) => <p key={entry.id}>{entry.text}</p>)}</details></div>}
        {issues.length ? <div role="alert" className="space-y-2 text-sm">{issues.map((issue) => <div key={issue}><span>{issue}</span> <Button variant="quiet" onClick={() => chooseSection(issueSection(issue))}>定位分区</Button></div>)}</div> : <p className="text-sm text-[var(--workspace-accent)]">结构与引用检查通过。请再确认文字设定符合你的想法。</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> 我已审阅当前草稿、硬约束与公开 / 隐藏设定，确认发布本版本</label>
        <Button variant="primary" disabled={busy || dirty || !reviewed || issues.length > 0} onClick={() => void operate(async () => { const result = await publishWorldDraft(draft.id, draft.version); const fresh = await getWorldDraft(draft.id); install(fresh); setRevisions(fresh.revisions); setNotice(`版本r${result.revision}已发布；可以用它开始新旅程，旧局不变。`); })}>发布版本</Button>
        <p className={styles.metadata}>{dirty ? "请先保存更改。" : issues.length ? "先处理检查问题，再发布。" : !reviewed ? "勾选审阅确认后即可发布；不会调用AI。" : "发布将固定当前版本，不改变已有旅程。"}</p>
        {revisions.length > 0 && <section className="space-y-3 border-t border-[var(--workspace-border)] pt-5"><h4 className="font-semibold">已发布，可以开始探索</h4><Button disabled={busy} onClick={() => startSave(revisions.reduce((latest, row) => Math.max(latest, row.revision), 0))}>开始新旅程</Button><details><summary className="text-sm">其他已发布版本</summary>{revisions.map((revision) => <div key={revision.revision} className="flex items-center gap-2"><span className={styles.metadata}>版本r{revision.revision}</span><Button disabled={busy} onClick={() => startSave(revision.revision)}>使用此版本</Button></div>)}</details>{saveId && <AppLink className="ui-button ui-button-primary" href={`/entertainment?session=${saveId}`}>打开新旅程 →</AppLink>}</section>}
      </>}
      </section>
      <div className="ui-actionbar"><span className={styles.metadata}>{busy ? generating ? "正在生成，准确用量返回后显示" : "正在处理…" : pendingStructure ? "JSON修改尚未应用" : dirty ? "未保存更改" : "已保存"}</span><div className="flex flex-wrap gap-2"><Button variant={section === "preview" ? "secondary" : "primary"} disabled={busy || !dirty || pendingStructure} onClick={() => void operate(async () => { install(await saveWorldDraft(draft)); setNotice("更改已保存，旧旅程不受影响。"); })}>保存更改</Button>{section !== "preview" && <Button disabled={busy || pendingStructure} onClick={() => chooseSection("preview")}>检查与发布</Button>}</div></div>
    </div></div>}
  </main>;
}

function BriefOptions({ input, onChange }: { input: WorldBrief; onChange: (value: WorldBrief) => void }) {
  return <details><summary className="text-sm">世界规则与限制（可选）</summary><div className="mt-3 space-y-3"><label className="block text-sm">硬约束（每行一项）<textarea className={field} rows={3} value={input.constraints.join("\n")} onChange={(event) => onChange({ ...input, constraints: event.target.value.split("\n").filter(Boolean) })} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">超自然政策<select className={field} value={input.magic} onChange={(event) => onChange({ ...input, magic: event.target.value as WorldBrief["magic"] })}><option value="forbidden">禁止超自然能力</option><option value="allowed">允许，须定义规则与代价</option></select></label><label className="text-sm">数值策略<select className={field} value={input.numericPolicy} onChange={(event) => onChange({ ...input, numericPolicy: event.target.value as WorldBrief["numericPolicy"] })}><option value="qualitative">定性世界</option><option value="light">轻数值世界</option><option value="specified">仅指定属性（不强制等级）</option></select></label></div>
  </div></details>;
}
