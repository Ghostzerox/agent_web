"use client";
import { useState } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { worldBlueprintSchema, type WorldBlueprint, type WorldSection } from "@/lib/game/worlds/contracts";

export const worldFieldClass = "mt-1 w-full min-w-0 rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-2 text-sm";
export const worldButtonClass = "rounded-lg border border-[var(--workspace-border)] px-3 py-2 text-sm disabled:opacity-40";
const names: Record<string, string> = { name: "名称", premise: "世界前提", tone: "基调", era: "时代", technology: "技术水平", supernatural: "超自然规则与代价", cultures: "文化（每行一项）", factions: "势力（每行一项）", history: "历史背景（每行一项）", text: "内容", playerRole: "玩家定位", description: "描述", acceptText: "参与选项文字", outcome: "参与结果", declineOutcome: "拒绝结果", discovery: "可调查线索", identity: "身份", goal: "近期目标", personality: "性格", speech: "说话方式" };

export function WorldSectionEditor({ content, section, onChange, onError }: { content: WorldBlueprint; section: WorldSection;
  onChange: (next: WorldBlueprint) => void; onError: (message: string) => void }) {
  const source = JSON.stringify(content[section], null, 2);
  const [buffer, setBuffer] = useState<{ source: string; raw: string } | null>(null);
  const raw = buffer?.source === source ? buffer.raw : source;
  useNavigationGuard(raw !== source, "高级结构尚未应用，请先应用或放弃编辑再离开。");
  const patch = (value: unknown) => onChange({ ...content, [section]: value } as WorldBlueprint);
  const textField = (key: string, value: string, update: (value: string) => void) => <label key={key} className="block text-xs">{names[key] ?? key}<textarea className={worldFieldClass} rows={key === "name" ? 1 : 3} value={value} maxLength={key === "name" ? 120 : 600} onChange={(event) => update(event.target.value)} /></label>;
  const locationSelect = (value: string, update: (value: string) => void) => <label className="block text-xs">所在地点<select aria-label="所在地点" className={worldFieldClass} value={value} onChange={(event) => update(event.target.value)}>{content.region.locations.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>;
  return <div className="space-y-4">
    {(section === "overview" || section === "opening" || section === "hook") && <div className="grid gap-3 sm:grid-cols-2">{Object.entries(content[section]).map(([key, value]) => {
      if (key === "id") return <p key={key} className="text-xs text-zinc-500">稳定ID：{String(value)}</p>;
      if (key === "locationId") return <div key={key}>{locationSelect(String(value), (next) => patch({ ...content[section], [key]: next }))}</div>;
      if (typeof value === "boolean") return <label key={key} className="text-sm"><input type="checkbox" checked={value} onChange={(event) => patch({ ...content[section], [key]: event.target.checked })} /> 使用超自然能力（须符合硬约束）</label>;
      return textField(key, Array.isArray(value) ? value.join("\n") : String(value), (next) => patch({ ...content[section], [key]: Array.isArray(value) ? next.split("\n").filter(Boolean) : next }));
    })}</div>}
    {section === "region" && <>
      {textField("name", content.region.name, (name) => patch({ ...content.region, name }))}
      <label className="block text-xs">起点<select className={worldFieldClass} value={content.region.startId} onChange={(event) => patch({ ...content.region, startId: event.target.value })}>{content.region.locations.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
      {content.region.locations.map((place, index) => <fieldset key={place.id} className="space-y-2 rounded-xl border border-[var(--workspace-border)] p-3"><legend className="text-sm">{place.name} · {place.id}</legend>
        {(["name", "description", "discovery"] as const).map((field) => textField(field, place[field], (value) => patch({ ...content.region, locations: content.region.locations.map((entry, i) => i === index ? { ...entry, [field]: value } : entry) })))}
        <p className="text-xs">可前往（需保证连通与可返回）</p><div className="flex flex-wrap gap-3">{content.region.locations.filter((entry) => entry.id !== place.id).map((entry) => <label key={entry.id} className="text-xs"><input type="checkbox" checked={place.exits.includes(entry.id)} onChange={(event) => patch({ ...content.region, locations: content.region.locations.map((item, i) => i === index ? { ...item, exits: event.target.checked ? [...item.exits, entry.id] : item.exits.filter((id) => id !== entry.id) } : item) })} /> {entry.name}</label>)}</div>
      </fieldset>)}
    </>}
    {section === "characters" && content.characters.map((person, index) => <fieldset key={person.id} className="space-y-2 rounded-xl border border-[var(--workspace-border)] p-3"><legend className="text-sm">{person.name} · {person.id}</legend>
      {(["name", "identity", "goal", "personality", "speech"] as const).map((field) => textField(field, person[field], (value) => patch(content.characters.map((entry, i) => i === index ? { ...entry, [field]: value } : entry))))}
      {locationSelect(person.locationId, (locationId) => patch(content.characters.map((entry, i) => i === index ? { ...entry, locationId } : entry)))}
    </fieldset>)}
    {section === "lore" && <>{content.lore.length === 0 && <p className="text-sm text-zinc-500">暂无史料，可在高级结构编辑中添加；AI生成也可以提供公开资料与主持秘密。</p>}{content.lore.map((entry, index) => <fieldset key={entry.id} className="space-y-2 rounded-xl border border-[var(--workspace-border)] p-3"><legend className="text-sm">资料 {entry.id}</legend>
      {textField("text", entry.text, (text) => patch(content.lore.map((item, i) => i === index ? { ...item, text } : item)))}
      <label className="block text-xs">可见性<select className={worldFieldClass} value={entry.visibility} onChange={(event) => patch(content.lore.map((item, i) => i === index ? { ...item, visibility: event.target.value } : item))}><option value="public">可通过当地调查发现</option><option value="author">作者秘密，不自动公开</option></select></label>
      <label className="block text-xs">证据性质<select className={worldFieldClass} value={entry.kind} onChange={(event) => patch(content.lore.map((item, i) => i === index ? { ...item, kind: event.target.value } : item))}>{["fact", "rumor", "legend", "opinion"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
      {locationSelect(entry.locationId, (locationId) => patch(content.lore.map((item, i) => i === index ? { ...item, locationId } : item)))}
      <p className="text-xs">明确事先知情的人物（不勾选则不传给人物AI）</p><div className="flex flex-wrap gap-3">{content.characters.map((person) => <label key={person.id} className="text-xs"><input type="checkbox" checked={entry.knownBy.includes(person.id)} onChange={(event) => patch(content.lore.map((item, i) => i === index ? { ...item, knownBy: event.target.checked ? [...item.knownBy, person.id] : item.knownBy.filter((id) => id !== person.id) } : item))} /> {person.name}</label>)}</div>
    </fieldset>)}</>}
    {(section === "authorNotes" || section === "conflicts") && <label className="block text-xs">{section === "conflicts" ? "待解决冲突（解决后移除对应行，非空不能发布）" : "主持备注（不自动传给人物；每行一项）"}<textarea className={worldFieldClass} rows={6} value={content[section].join("\n")} onChange={(event) => patch(event.target.value.split("\n").filter(Boolean))} /></label>}
    {section === "ranks" && <div className="space-y-3 text-sm">{(["rating", "quality", "tier"] as const).map((kind) => <div key={kind}><h4>{kind === "rating" ? "评级" : kind === "quality" ? "品质" : "等阶"}</h4>{content.ranks[kind].map((rank) => <p key={rank.id} className="text-xs text-zinc-500">{rank.name}：{rank.meaning}</p>)}</div>)}<p className="text-xs">{content.ranks.levelsPerTier === undefined ? "定性字典，不强制等级。" : `每阶${content.ranks.levelsPerTier}级。`} 字典结构可在下方编辑。</p></div>}
    <details className="rounded-xl border border-[var(--workspace-border)] p-3"><summary className="cursor-pointer text-sm">高级结构编辑（增删地点、人物、史料及字典）</summary><div className="mt-3 space-y-2">
      <p className="text-xs text-zinc-500">只编辑当前部分；稳定ID用于引用。结构错误不会覆盖表单，引用与连通性由发布校验检查。</p>
      <textarea aria-label="当前部分JSON" className={`${worldFieldClass} font-mono`} rows={14} value={raw} onChange={(event) => setBuffer({ source, raw: event.target.value })} />
      <button type="button" className={worldButtonClass} onClick={() => { try { onChange(worldBlueprintSchema.parse({ ...content, [section]: JSON.parse(raw) })); } catch (error) { onError(error instanceof Error ? error.message : "结构无效"); } }}>应用当前部分结构</button>
    </div></details>
  </div>;
}
