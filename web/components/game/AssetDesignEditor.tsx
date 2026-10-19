"use client";
import { useState } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { assetDesignContentSchema, type AssetDesignContent, type AssetField } from "@/lib/game/worlds/assetContracts";
import type { WorldBlueprint } from "@/lib/game/worlds/contracts";
import { ASSET_FIELD_LABELS } from "@/lib/game/worlds/assetBlueprint";
import { worldButtonClass as button, worldFieldClass as field } from "./WorldSectionEditor";

export function AssetDesignEditor({ content, selected, fields, onSelect, world, onChange, onError }: { content: AssetDesignContent; selected: AssetField; fields: AssetField[]; onSelect: (field: AssetField) => void;
  world: WorldBlueprint; onChange: (next: AssetDesignContent) => void; onError: (message: string) => void }) {
  const value = (content as unknown as Record<string, unknown>)[selected];
  const source = JSON.stringify(value, null, 2) ?? "null";
  const [buffer, setBuffer] = useState<{ source: string; raw: string } | null>(null); const raw = buffer?.source === source ? buffer.raw : source;
  useNavigationGuard(raw !== source, "高级字段JSON尚未应用，离开会丢失这部分编辑。");
  const patch = (next: unknown) => onChange({ ...content, [selected]: next } as AssetDesignContent);
  const text = (label: string, current: string, change: (next: string) => void, maxLength = 600) => <label key={label} className="block text-xs">{label}<textarea aria-label={label} className={field} rows={3} maxLength={maxLength} value={current} onChange={(event) => change(event.target.value)} /></label>;
  const lines = (label: string, current: string[], change: (next: string[]) => void) => text(label, current.join("\n"), (next) => change(next.split("\n").filter(Boolean)), 4000);
  const select = (label: string, current: string, choices: { id: string; name: string }[], change: (next: string) => void) => <label className="block text-xs">{label}<select aria-label={label} className={field} value={current} onChange={(event) => change(event.target.value)}>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>;
  return <div className="space-y-4">
    <label className="block text-xs">当前设计字段<select aria-label="当前设计字段" className={field} value={selected} onChange={(event) => { if (raw === source || window.confirm("高级字段JSON尚未应用，放弃这部分修改并切换字段？")) onSelect(event.target.value as AssetField); }}>{fields.map((key) => <option key={key} value={key}>{ASSET_FIELD_LABELS[key]}</option>)}</select></label>
    {content.kind === "item" && selected === "details" ? <>
      {select("道具类别", content.details.category, [{ id: "tool", name: "叙事工具" }, { id: "equipment", name: "装备" }, { id: "consumable", name: "消耗品" }, { id: "material", name: "材料（共用背包）" }], (category) => onChange({ ...content,
        details: { ...content.details, category: category as typeof content.details.category }, slot: category === "equipment" ? world.itemRules.slots[0] ?? null : null,
        consumable: category === "consumable", useEffect: category === "consumable" ? content.useEffect ?? { locationId: null, requiresCondition: null, addCondition: null, removeCondition: null } : null }))}
      {([ ["appearance", "外观"], ["source", "来源"], ["background", "制作与历史背景（公开）"], ["faction", "所属势力或文化"], ["usage", "使用方式（叙事说明）"], ["restrictions", "限制"], ["cost", "代价（叙事说明）"], ["targets", "交互对象"] ] as const).map(([key, label]) => text(label, content.details[key], (next) => patch({ ...content.details, [key]: next })))}
      {lines("用途标签（每行一项，最多8项）", content.details.tags, (tags) => patch({ ...content.details, tags }))}
      <fieldset className="space-y-2 rounded-lg border border-[var(--workspace-border)] p-3"><legend className="text-xs">已声明数值属性（不自动形成战斗结算）</legend>{world.itemRules.attributes.length === 0 && <p className="text-xs text-zinc-500">当前世界没有数值属性，不添加血量、伤害或战力。</p>}{world.itemRules.attributes.map((rule) => <div key={rule.id} className="space-y-1 text-xs"><label><input type="checkbox" checked={rule.id in content.details.attributes} onChange={(event) => { const attributes = { ...content.details.attributes }; if (event.target.checked) attributes[rule.id] = rule.min; else delete attributes[rule.id]; patch({ ...content.details, attributes }); }} /> {rule.name} · {rule.min}–{rule.max}{rule.unit}</label>{rule.id in content.details.attributes && <input aria-label={`属性${rule.name}`} className={field} type="number" min={rule.min} max={rule.max} value={content.details.attributes[rule.id]} onChange={(event) => patch({ ...content.details, attributes: { ...content.details.attributes, [rule.id]: Number(event.target.value) } })} />}</div>)}</fieldset>
    </> : content.kind === "character" && selected === "profile" ? <>
      {text("公开外观", content.profile.appearance, (appearance) => patch({ ...content.profile, appearance }))}
      {text("公开阵营", content.profile.faction, (faction) => patch({ ...content.profile, faction }))}
      {text("公开背景", content.profile.publicBackground, (publicBackground) => patch({ ...content.profile, publicBackground }))}
      <details open><summary className="cursor-pointer text-sm">只给人物本人的资料（不进入公开卡）</summary><div className="mt-3 space-y-3">
        {text("本人知道的经历", content.profile.privateBackground, (privateBackground) => patch({ ...content.profile, privateBackground }))}
        {text("长期目标", content.profile.longTermGoal, (longTermGoal) => patch({ ...content.profile, longTermGoal }))}
        {([["values", "价值观"], ["boundaries", "个人边界"], ["abilities", "本人能力（不自动结算）"], ["needs", "当前需求"]] as const).map(([key, label]) => lines(`${label}（每行一项）`, content.profile[key], (next) => patch({ ...content.profile, [key]: next })))}
        <label className="block text-xs"><input type="checkbox" checked={content.profile.usesSupernatural} onChange={(event) => patch({ ...content.profile, usesSupernatural: event.target.checked })} /> 人物具有超自然能力</label>
      </div></details>
      <details><summary className="cursor-pointer text-sm">本人关系与私密资料（仅明确知情者获得）</summary><div className="mt-3 space-y-3">
        {content.profile.relationships.map((relation, index) => <fieldset key={index} className="space-y-2 rounded-lg border p-3">{select("关系对象", relation.targetId, [{ id: "player", name: "玩家" }, ...world.characters.filter((person) => person.id !== content.id && person.id !== "player").map((person) => ({ id: person.id, name: person.name }))], (targetId) => patch({ ...content.profile, relationships: content.profile.relationships.map((entry, i) => i === index ? { ...entry, targetId } : entry) }))}
          {text("本人理解的关系", relation.description, (description) => patch({ ...content.profile, relationships: content.profile.relationships.map((entry, i) => i === index ? { ...entry, description } : entry) }))}<button className={button} onClick={() => patch({ ...content.profile, relationships: content.profile.relationships.filter((_, i) => i !== index) })}>移除此关系</button></fieldset>)}
        <button className={button} disabled={content.profile.relationships.length >= 8 || content.id === "player" && !world.characters.some((person) => person.id !== "player")} onClick={() => patch({ ...content.profile, relationships: [...content.profile.relationships, { targetId: content.id === "player" ? world.characters.find((person) => person.id !== "player")!.id : "player", description: "待设计的本人理解，不代表对方同样认为" }] })}>添加人物关系</button>
        {content.profile.secrets.map((secret, index) => <fieldset key={index} className="space-y-2 rounded-lg border p-3">{text("本人知道的私密资料", secret.text, (next) => patch({ ...content.profile, secrets: content.profile.secrets.map((entry, i) => i === index ? { ...entry, text: next } : entry) }))}
          {select("资料性质", secret.kind, ["fact", "rumor", "legend", "opinion"].map((kind) => ({ id: kind, name: kind })), (kind) => patch({ ...content.profile, secrets: content.profile.secrets.map((entry, i) => i === index ? { ...entry, kind } : entry) }))}
          <p className="text-xs">本人默认知道；其他知情NPC：</p>{world.characters.filter((person) => person.id !== content.id && person.category !== "player").map((person) => <label key={person.id} className="mr-3 text-xs"><input type="checkbox" checked={secret.knownBy.includes(person.id)} onChange={(event) => patch({ ...content.profile, secrets: content.profile.secrets.map((entry, i) => i === index ? { ...entry, knownBy: event.target.checked ? [...entry.knownBy, person.id] : entry.knownBy.filter((key) => key !== person.id) } : entry) })} /> {person.name}</label>)}
          <button className={button} onClick={() => patch({ ...content.profile, secrets: content.profile.secrets.filter((_, i) => i !== index) })}>移除此资料</button></fieldset>)}
        <button className={button} disabled={content.profile.secrets.length >= 4} onClick={() => patch({ ...content.profile, secrets: [...content.profile.secrets, { text: "待设计的本人私密资料", kind: "rumor", knownBy: [] }] })}>添加私密资料</button>
      </div></details>
      <details><summary className="cursor-pointer text-sm">仅主持知道（本人也不自动知道）</summary>{lines("主持备注（每行一项，最多4项）", content.profile.authorNotes, (authorNotes) => patch({ ...content.profile, authorNotes }))}</details>
    </> : content.kind === "item" && selected === "useEffect" ? <>
      <p className="text-xs text-zinc-500">只支持明确地点 / 状态前置与增加 / 移除状态；不执行自由描述、战斗数值或代码。先在“道具类别”选消耗品。</p>
      {content.useEffect && <>{select("使用地点", content.useEffect.locationId ?? "", [{ id: "", name: "不限地点" }, ...world.region.locations], (locationId) => patch({ ...content.useEffect, locationId: locationId || null }))}
        {([["requiresCondition", "需要状态"], ["addCondition", "增加状态"], ["removeCondition", "移除状态"]] as const).map(([key, label]) => text(label, content.useEffect![key] ?? "", (next) => patch({ ...content.useEffect, [key]: next || null }), 120))}</>}
    </> : content.kind === "item" && ["quality", "rating", "tier"].includes(selected) ? select(ASSET_FIELD_LABELS[selected], String(value), world.ranks[selected as "quality" | "rating" | "tier"], patch)
      : selected === "locationId" ? select("人物初始地点", String(value), world.region.locations, patch)
      : selected === "category" && content.kind === "character" ? select("人物类别", content.category, (content.id === "player" ? ["player"] : ["npc", "important"]).map((id) => ({ id, name: id === "important" ? "重要角色" : id === "player" ? "玩家（用户控制）" : "NPC" })), patch)
      : selected === "slot" && content.kind === "item" ? select("装备槽", content.slot ?? "", [{ id: "", name: "不装备" }, ...world.itemRules.slots.map((id) => ({ id, name: id }))], (slot) => onChange({ ...content, slot: slot || null, details: { ...content.details, category: slot ? "equipment" : "tool" }, consumable: false, useEffect: null }))
      : typeof value === "boolean" ? <label className="text-sm"><input type="checkbox" checked={value} onChange={(event) => selected === "consumable" && content.kind === "item" ? onChange({ ...content, consumable: event.target.checked, slot: null,
        details: { ...content.details, category: event.target.checked ? "consumable" : "tool" }, useEffect: event.target.checked ? { locationId: null, requiresCondition: null, addCondition: null, removeCondition: null } : null }) : patch(event.target.checked)} /> {ASSET_FIELD_LABELS[selected]}</label>
      : selected === "level" && content.kind === "item" && !world.ranks.levelsPerTier ? <button className={button} onClick={() => { const { level, ...rest } = content; void level; onChange(rest); }}>按当前世界移除等级</button>
      : selected === "level" && value === undefined ? <button className={button} onClick={() => patch(1)}>明确设为1级</button>
      : typeof value === "number" ? <label className="block text-xs">{ASSET_FIELD_LABELS[selected]}<input aria-label={ASSET_FIELD_LABELS[selected]} type="number" className={field} value={value} onChange={(event) => patch(Number(event.target.value))} /></label>
      : Array.isArray(value) ? lines(`${ASSET_FIELD_LABELS[selected]}（每行一项，最多3项、每项120字）`, value as string[], patch)
      : typeof value === "string" ? text(ASSET_FIELD_LABELS[selected], value, patch, selected === "name" ? 120 : 600) : <p className="text-xs">当前字段为空，需按所属类别配置。</p>}
    <details className="rounded-lg border border-[var(--workspace-border)] p-3"><summary className="cursor-pointer text-xs">高级：当前字段JSON</summary><textarea aria-label="当前设计字段JSON" className={`${field} font-mono`} rows={10} value={raw} onChange={(event) => setBuffer({ source, raw: event.target.value })} />
      <button className={button} onClick={() => { try { onChange(assetDesignContentSchema.parse({ ...content, [selected]: JSON.parse(raw) })); } catch (error) { onError(error instanceof Error ? error.message : "结构无效"); } }}>应用字段JSON</button></details>
  </div>;
}
