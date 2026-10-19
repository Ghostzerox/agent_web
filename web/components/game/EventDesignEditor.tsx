"use client";
import { useState } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import type { EventDesignDraft } from "@/lib/api/gameEventDesignClient";
import { EVENT_FIELDS, eventDefinitionSchema, type EventDefinition, type EventField } from "@/lib/game/events/contracts";
import { worldButtonClass as button, worldFieldClass as field } from "./WorldSectionEditor";

export const EVENT_FIELD_LABELS: Record<EventField, string> = { name: "事件名称", scope: "作用范围", locationId: "事件地点", actorIds: "参与者", trigger: "触发条件", details: "起因、可见范围与知识", stages: "行动、成本与后果" };
export function EventDesignEditor({ row, selected, onSelect, onChange, onError }: { row: EventDesignDraft; selected: EventField; onSelect: (field: EventField) => void; onChange: (content: EventDefinition) => void; onError: (error: string) => void }) {
  const content = row.content; const source = JSON.stringify(content[selected], null, 2); const [buffer, setBuffer] = useState<{ source: string; value: string } | null>(null);
  const raw = buffer?.source === source ? buffer.value : source; useNavigationGuard(raw !== source, "事件高级JSON尚未应用。");
  const patch = (value: unknown) => onChange({ ...content, [selected]: value });
  const text = (label: string, value: string, update: (value: string) => void) => <label key={label} className="block text-xs">{label}<textarea aria-label={label} maxLength={600} rows={3} className={field} value={value} onChange={(event) => update(event.target.value)} /></label>;
  const select = (label: string, value: string, options: { id: string; name: string }[], update: (value: string) => void) => <label className="block text-xs">{label}<select aria-label={label} className={field} value={value} onChange={(event) => update(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
  return <div className="space-y-3">
    <label className="block text-xs">当前事件字段<select aria-label="当前事件字段" className={field} value={selected} onChange={(event) => { if (raw === source || window.confirm("当前事件字段JSON尚未应用，确定放弃后切换字段？")) { setBuffer(null); onSelect(event.target.value as EventField); } }}>{EVENT_FIELDS.map((key) => <option key={key} value={key}>{EVENT_FIELD_LABELS[key]}</option>)}</select></label>
    {selected === "name" && text("事件名称", content.name, patch)}
    {selected === "scope" && select("作用范围", content.scope, [{ id: "local", name: "当地事件" }, { id: "character", name: "跟随首位NPC的人物事件" }, { id: "world", name: "世界变化（不自动全世界知情）" }], patch)}
    {selected === "locationId" && select("事件地点", content.locationId, row.references.locations, patch)}
    {selected === "actorIds" && <div className="flex flex-wrap gap-3">{row.references.characters.map((person) => <label className="text-sm" key={person.id}><input type="checkbox" checked={content.actorIds.includes(person.id)} onChange={(event) => patch(event.target.checked ? [...content.actorIds, person.id] : content.actorIds.filter((id) => id !== person.id))} /> {person.name}</label>)}</div>}
    {selected === "trigger" && <>
      <label className="block text-xs">最早探索回合（非真实日期）<input aria-label="最早探索回合" type="number" min={0} max={1000000} className={field} value={content.trigger.minTick ?? 0} onChange={(event) => patch({ ...content.trigger, minTick: Number(event.target.value) })} /></label>
      {text("所需剧情旗标（可空）", content.trigger.flag ?? "", (flag) => { const next = { ...content.trigger }; if (flag) next.flag = flag; else delete next.flag; patch(next); })}
      {select("所需物品", content.trigger.item ?? "", [{ id: "", name: "不需要物品" }, ...row.references.items], (item) => { const next = { ...content.trigger }; if (item) next.item = item; else delete next.item; patch(next); })}
      <p className="text-xs text-zinc-500">所有条件同时满足。已学史料与关系门槛可在下方JSON设置；条件不满足不会变成已发生历史。</p>
    </>}
    {selected === "details" && <>
      {select("事件类型", content.details.category, [{ id: "exploration", name: "探索发现" }, { id: "social", name: "社会互动" }, { id: "commission", name: "交易 / 委托" }, { id: "personal", name: "人物个人事件" }, { id: "world", name: "世界变化" }, { id: "epic", name: "有门槛史诗" }], (category) => patch({ ...content.details, category }))}
      {text("起因（只给主持）", content.details.cause, (cause) => patch({ ...content.details, cause }))}
      {select("玩家发现范围", content.details.visibility, [{ id: "local", name: "玩家到场后发现" }, { id: "participants", name: "仅明确参与的玩家可见" }], (visibility) => patch({ ...content.details, visibility }))}
      <label className="block text-sm"><input type="checkbox" checked={content.details.usesSupernatural} onChange={(event) => patch({ ...content.details, usesSupernatural: event.target.checked })} /> 涉及超自然能力（必须被世界允许）</label>
      <details><summary className="cursor-pointer text-sm">主持备注与明确知情者</summary><div className="mt-3 space-y-2">{text("主持备注（每行一项）", content.details.authorNotes.join("\n"), (value) => patch({ ...content.details, authorNotes: value.split("\n").filter(Boolean) }))}<p className="text-xs">onTriggerKnowledge只在真正触发时传播；每条需text / evidence / recipients / reason。人物不自动获知起因、作者备注或完整后果。请在下方JSON配置。</p></div></details>
    </>}
    {selected === "stages" && content.stages.map((stage, stageIndex) => {
      const update = (value: typeof stage) => patch(content.stages.map((entry, index) => index === stageIndex ? value : entry));
      return <details key={stage.id} open={stageIndex === 0} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{stage.id} · {stage.terminal ? "结束" : "待选择"}</summary><div className="mt-3 space-y-3">
        {text(`阶段${stage.id}描述`, stage.description, (description) => update({ ...stage, description }))}
        {stage.choices.map((choice, index) => { const edit = (value: typeof choice) => update({ ...stage, choices: stage.choices.map((entry, i) => i === index ? value : entry) });
          return <details key={choice.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{choice.label} {choice.refusal ? "· 拒绝 / 替代" : ""}</summary><div className="mt-3 space-y-2">
            {text(`选项${choice.id}文字`, choice.label, (label) => edit({ ...choice, label }))}{text(`选项${choice.id}结果`, choice.result, (result) => edit({ ...choice, result }))}
            <label className="block text-xs">虚构钱币成本<input aria-label={`${choice.id}钱币成本`} type="number" min={0} max={10000} className={field} value={choice.coinCost ?? 0} onChange={(event) => edit({ ...choice, coinCost: Number(event.target.value) })} /></label>
            {select("到达阶段", choice.next, content.stages.map((entry) => ({ id: entry.id, name: entry.id })), (next) => edit({ ...choice, next }))}
            {!choice.refusal && <><label className="block text-xs">虚构钱币奖励 / 变化<input aria-label={`${choice.id}钱币变化`} type="number" min={-10000} max={10000} className={field} value={choice.effect.coins ?? 0} onChange={(event) => edit({ ...choice, effect: { ...choice.effect, coins: Number(event.target.value) } })} /></label>
              {select("物品奖励（首项）", choice.effect.rewards?.[0]?.definitionId ?? "", [{ id: "", name: "无物品奖励" }, ...row.references.items], (definitionId) => edit({ ...choice, effect: { ...choice.effect, rewards: definitionId ? [{ definitionId, quantity: 1 }] : [] } }))}
              {choice.effect.rewards?.length === 1 && <label className="block text-xs">奖励数量<input aria-label="奖励数量" className={field} type="number" min={1} max={99} value={choice.effect.rewards[0].quantity} onChange={(event) => edit({ ...choice, effect: { ...choice.effect, rewards: [{ ...choice.effect.rewards![0], quantity: Number(event.target.value) }] } })} /></label>}
            </>}
            <p className="text-xs text-zinc-500">多奖励、前置、消耗、人物后果与knowledge可在下方JSON编辑；拒绝路径必须保持无前置、无成本和空effect。</p>
          </div></details>;
        })}
      </div></details>;
    })}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">高级：当前事件字段JSON</summary><textarea aria-label="当前事件字段JSON" className={`${field} font-mono`} rows={12} value={raw} onChange={(event) => setBuffer({ source, value: event.target.value })} /><button className={button} onClick={() => { try { onChange(eventDefinitionSchema.parse({ ...content, [selected]: JSON.parse(raw) })); setBuffer(null); } catch { onError("事件字段JSON不符合结构，未应用。"); } }}>应用事件字段JSON</button></details>
  </div>;
}
