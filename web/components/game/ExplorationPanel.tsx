"use client";

import { useRef, useState } from "react";
import type { ExplorationAction, ExplorationState, WorldCharacter, WorldItem } from "@/lib/game/exploration/contracts";
import { searchGameHistory } from "@/lib/api/gameSessionClient";
import type { ExplorationHistoryResult } from "@/lib/game/exploration/history";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";

type Run = (action: ExplorationAction, content?: string, narrate?: boolean) => Promise<boolean>;
const button = "rounded-lg border border-[var(--workspace-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--workspace-bg)] disabled:opacity-40 disabled:cursor-not-allowed";
const card = "rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4 space-y-3";
const tabs = [["map", "地图"], ["items", "背包与装备"], ["people", "人物"], ["events", "事件与史诗"], ["history", "历史与传记"]] as const;
type Tab = typeof tabs[number][0];
const relations = { wary: "戒备", neutral: "初识", friendly: "友善", trusted: "信任" };
const kinds = { fact: "事实", rumor: "传闻", legend: "传说", opinion: "观点" };

function ItemCard({ item, definition, state, disabled, run }: { item: ExplorationState["instances"][number]; definition: WorldItem;
  state: ExplorationState; disabled: boolean; run: Run }) {
  const [quantity, setQuantity] = useState(1); const [target, setTarget] = useState("");
  const present = Object.values(state.characters).filter((person) => person.locationId === state.locationId && person.controller !== "user");
  const selected = present.find((person) => person.id === target) ?? present[0];
  const owned = item.owner === "player";
  const stock = present.find((person) => person.id === item.owner && person.interactions.includes("trade"));
  const invalid = disabled || !Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(item.quantity, 99);
  const rankName = (field: "quality" | "tier" | "rating", id: string) => state.view.ranks[field].find((entry) => entry.id === id)?.name ?? id;
  return <article className={card}>
    <div className="flex flex-wrap justify-between gap-2"><h5 className="font-semibold">{definition.name} × {item.quantity}</h5><span className="text-xs text-zinc-500">{owned ? "你的背包" : state.characters[item.owner]?.name ?? "地点物品"}{item.equippedSlot ? ` · 已装备 ${item.equippedSlot}` : ""}</span></div>
    <p className="text-sm text-zinc-500">{definition.description}</p>
    <p className="text-xs">品质 {rankName("quality", definition.quality)} · 等阶 {rankName("tier", definition.tier)} / {definition.level} 级 · 评级 {rankName("rating", definition.rating)}</p>
    <p className="text-xs text-zinc-500">{definition.abilities.join(" / ")} · 来源：{item.source}{definition.unique ? " · 唯一物品" : ""}</p>
    <div className="flex flex-wrap gap-2">
      {owned && definition.slot && <button className={button} disabled={disabled} onClick={() => void run({ action: item.equippedSlot ? "unequip" : "equip", instanceId: item.id })}>{item.equippedSlot ? "卸下" : "装备"}{definition.name}</button>}
      {owned && definition.consumable && <button className={button} disabled={disabled} onClick={() => void run({ action: "use", instanceId: item.id })}>使用{definition.name}（1）</button>}
      {item.owner === state.locationId && <button className={button} disabled={invalid} onClick={() => void run({ action: "take", instanceId: item.id, quantity })}>拾取</button>}
    </div>
    {((owned && present.length > 0) || stock) && <div className="flex flex-wrap items-end gap-2 border-t border-[var(--workspace-border)] pt-3">
      <label className="text-xs">数量<input aria-label={`${definition.name}数量`} type="number" min={1} max={Math.min(item.quantity, 99)} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="ml-2 w-16 rounded border border-[var(--workspace-border)] bg-transparent p-2" /></label>
      {owned && <label className="text-xs">对象<select aria-label={`${definition.name}交互对象`} value={selected?.id ?? ""} onChange={(event) => setTarget(event.target.value)} className="ml-2 rounded border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-2">{present.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      {owned && selected && <button className={button} disabled={invalid || Boolean(item.equippedSlot)} onClick={() => {
        if (window.confirm(`赠出${definition.name} × ${quantity}？赠品不会自动返还，剧情道具可能影响后续选择。`)) void run({ action: "give", instanceId: item.id, targetId: selected.id, quantity });
      }}>赠送</button>}
      {definition.price > 0 && (stock || (owned && selected?.interactions.includes("trade"))) && <button className={button} disabled={invalid || Boolean(item.equippedSlot)} onClick={() => void run({ action: "trade", instanceId: item.id, targetId: stock?.id ?? selected!.id, direction: owned ? "sell" : "buy", quantity })}>{owned ? "出售" : "购买"} · {definition.price * quantity} 钱币</button>}
    </div>}
  </article>;
}

function CharacterCard({ person, here, disabled, run }: { person: WorldCharacter; here: boolean; disabled: boolean; run: Run }) {
  const [content, setContent] = useState("");
  useNavigationGuard(Boolean(content.trim()), "人物对话还有未发送的草稿，切换工作区后需要重新输入。");
  return <article className={card}>
    <div><h5 className="font-semibold">{person.name} <span className="text-xs font-normal text-zinc-500">{person.category === "important" ? "重要角色" : person.category === "player" ? "玩家" : "NPC"} · {here ? "在场" : "其他地点"}</span></h5><p className="mt-1 text-sm text-zinc-500">{person.identity} · {person.faction}</p></div>
    <p className="text-sm">{person.personality}</p><p className="text-xs">近期目标：{person.goals.join("、")}</p>
    {person.category !== "player" && <p className="text-xs">关系：{relations[person.relationship]} · {person.relationshipReason}</p>}
    <details><summary className="cursor-pointer text-xs">公开角色卡与持续记忆</summary><div className="mt-3 space-y-2 text-xs leading-6 text-zinc-500">
      <p>外貌：{person.appearance}</p><p>过往：{person.backstory}</p><p>表达：{person.speech}</p><p>价值：{person.values.join("、")}</p><p>边界：{person.boundaries.join("、")}</p>
      <p>能力：{person.abilities.join("、") || "未展示"}</p><p>已交流信息：{person.knownInformation.join(" / ") || "尚无"}</p>
      <p>承诺：{person.promises.join(" / ") || "无"}</p><p>悬而未决：{person.unresolved.join("、") || "无"}</p><p>个人线：{person.arc}</p>
      <p>近期记忆：{person.memories.join(" / ") || "尚无"}</p><p>控制者 {person.controller}；角色重要性不改变玩家控制权。</p>
    </div></details>
    {here && person.controller !== "user" && <>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={disabled} onClick={() => void run({ action: "talk", targetId: person.id })}>与{person.name}交谈</button>
        {person.topics.map((topic) => <button key={topic.id} className={button} disabled={disabled} onClick={() => void run({ action: "ask", targetId: person.id, topicId: topic.id })}>{topic.label}</button>)}
        {person.interactions.filter((action) => action !== "trade").map((action) => <button key={action} className={button} disabled={disabled} onClick={() => {
          if (action !== "promise" || window.confirm(`明确作出承诺：${person.offeredPromise ?? "当前角色提出的事项"}？这只记入本局故事，不创建现实提醒。`)) void run({ action, targetId: person.id });
        }}>{action === "promise" ? "明确作出承诺" : action === "help" ? "提出协助" : "据理交涉"}</button>)}
      </div>
      <details><summary className="cursor-pointer text-xs text-violet-600">自由 AI 对话（点击发送才调用模型）</summary><div className="mt-3 space-y-2">
        <label className="block text-xs">对{person.name}说<textarea disabled={disabled} maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[var(--workspace-border)] bg-transparent p-3 text-sm" /></label>
        <button className={button} disabled={disabled || !content.trim()} onClick={() => void run({ action: "talk", targetId: person.id }, content.trim(), true).then((saved) => { if (saved) setContent(""); })}>发送给{person.name} · 调用 AI</button>
        <p className="text-xs text-zinc-500">只提供这位角色的已知信息；叙事不直接结算物品、关系或承诺。草稿不会因失败清空。</p>
      </div></details>
    </>}
  </article>;
}

function HistoryPanel({ state, sessionId, parentTurnId, onError }: { state: ExplorationState; sessionId: string; parentTurnId: string | null; onError: (message: string | null) => void }) {
  const [q, setQ] = useState(""); const [actorId, setActorId] = useState("");
  const [result, setResult] = useState<ExplorationHistoryResult | null>(null); const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const entries = result?.entries ?? state.history.slice(-15).reverse();
  return <div className="space-y-3">
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
      event.preventDefault(); const request = ++sequence.current; setBusy(true); onError(null);
      void searchGameHistory(sessionId, { parentTurnId, q, ...(actorId ? { actorId } : {}), limit: 15 }).then((value) => { if (request === sequence.current) setResult(value); }).catch((error: unknown) => onError(error instanceof Error ? error.message : "检索失败")).finally(() => { if (request === sequence.current) setBusy(false); });
    }}>
      <label className="text-xs">历史关键词<input maxLength={120} value={q} onChange={(event) => setQ(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--workspace-border)] bg-transparent p-2 text-sm" /></label>
      <label className="text-xs">人物传记<select value={actorId} onChange={(event) => setActorId(event.target.value)} className="mt-1 block rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-2 text-sm"><option value="">全部人物</option>{Object.values(state.characters).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button className={button} disabled={busy}>{busy ? "检索中…" : "查询所选剧情线"}</button>
    </form>
    <p className="text-xs text-zinc-500">{result ? `命中 ${result.matched} 条，显示 ${result.entries.length} 条；超出条目或字符预算的 ${result.omitted} 条未展开。` : "展示近期 15 条，可检索当前工作年表之外的更早祖先记录。"} 关键词检索，不调用 AI；不同分支不互通。</p>
    {entries.length === 0 && <p className="text-sm text-zinc-500">尚无符合条件的公开记录。</p>}
    {entries.map((entry) => <article key={`${entry.id}:${entry.source}`} className={card}><p className="text-xs text-zinc-500">第 {entry.tick} 时刻 · {kinds[entry.kind]} · {entry.origin === "setting" ? "既往设定" : "游玩新史"}</p><p className="text-sm">{entry.text}</p><p className="break-all text-xs text-zinc-500">来源：{entry.source}{"sourceTurnId" in entry ? ` / 回合 ${entry.sourceTurnId}` : ""}</p>{"sourceTurnId" in entry && <button type="button" className={button} onClick={() => document.getElementById(`game-turn-${String(entry.sourceTurnId)}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>查看来源回合</button>}</article>)}
  </div>;
}

export function ExplorationPanel({ state, sessionId, parentTurnId, disabled, run, onError }: { state: ExplorationState;
  sessionId: string; parentTurnId: string | null; disabled: boolean; run: Run; onError: (message: string | null) => void }) {
  const [tab, setTab] = useState<Tab>("map");
  const current = state.view.locations.find((location) => location.id === state.locationId)!;
  const present = Object.values(state.characters).filter((person) => person.locationId === state.locationId && person.controller !== "user");
  return <section aria-label="大世界探索工作区" className="space-y-4 rounded-2xl bg-[var(--workspace-bg)] p-3 sm:p-5">
    <header className="space-y-2"><p className="text-xs font-semibold tracking-wider text-violet-600">{state.view.world} / {state.view.region}</p><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xl font-semibold">{current.name}</h3><span className="text-xs text-zinc-500">第 {state.tick} 时刻 · {state.coins} 钱币</span></div><p className="text-sm leading-6 text-zinc-500">{current.description}</p>
      <p className="text-xs">评级 {state.view.ranks.rating.find((rank) => rank.id === state.progress.rating)?.name} · 等阶 {state.view.ranks.tier.find((rank) => rank.id === state.progress.tier)?.name} / {state.progress.level} 级 · {state.conditions.join("、") || "状态平稳"}</p>
      <p role="status" className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">{state.lastResult}</p>
    </header>
    <div role="tablist" aria-label="探索局部导航" className="flex flex-wrap gap-1">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls={`exploration-${id}`} id={`exploration-tab-${id}`} onClick={() => { if (tab === id || requestNavigationPermission()) setTab(id); }} className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === id ? "bg-violet-700 text-white" : "text-zinc-500 hover:bg-[var(--workspace-surface)]"}`}>{label}</button>)}</div>
    <div role="tabpanel" id={`exploration-${tab}`} aria-labelledby={`exploration-tab-${tab}`} className="space-y-3">
      {tab === "map" && <>
        <p className="text-xs text-zinc-500">{state.visited.length} 处已访问 / {state.discovered.length} 处已发现；未知地点不展示名称。普通移动不掷骰、不调用 AI。</p>
        <div className="grid gap-3 sm:grid-cols-2">{state.view.locations.map((location) => {
          const path = current.exits.find((exit) => exit.id === location.id);
          return <article key={location.id} className={`${card} ${location.id === current.id ? "ring-1 ring-violet-500" : ""}`}><h4 className="font-semibold">{location.name} <span className="text-xs font-normal text-zinc-500">{location.id === current.id ? "当前位置" : location.visited ? "已访问" : "已发现"}</span></h4><p className="text-xs leading-6 text-zinc-500">{location.description}</p>
            {path && <><p className="text-xs text-zinc-500">↳ {path.reason}</p><button className={button} disabled={disabled || !path.accessible} onClick={() => void run({ action: "move", targetId: location.id })}>前往{location.name}</button></>}
          </article>;
        })}</div>
        <h4 className="pt-2 text-sm font-semibold">这里可以调查</h4><div className="flex flex-wrap gap-2">{current.points.map((point) => <button key={point.id} className={button} disabled={disabled || state.flags[`investigated-${point.id}`]} title={point.description} onClick={() => void run({ action: "investigate", targetId: point.id })}>{state.flags[`investigated-${point.id}`] ? "已调查 · " : "调查"}{point.name}</button>)}<button className={button} disabled={disabled} onClick={() => void run({ action: "inspect", targetId: current.id })}>观察当前位置</button><button className={button} disabled={disabled} onClick={() => void run({ action: "wait" })}>等待片刻</button></div>
        <p className="text-xs text-zinc-500">在场：{present.map((person) => person.name).join("、") || "尚未遇见人物"}；可到“人物”交谈。</p>
      </>}
      {tab === "items" && <><p className="text-xs text-zinc-500">装备槽：{state.view.slots.map((slot) => `${slot} ${state.view.items.find((item) => item.id === state.instances.find((instance) => instance.equippedSlot === slot)?.definitionId)?.name ?? "空"}`).join(" / ")}。赠出剧情道具可能改变后续选择。</p><div className="grid gap-3 sm:grid-cols-2">{state.instances.filter((item) => item.owner === "player" || item.owner === current.id || present.some((person) => person.id === item.owner)).map((item) => {
        const definition = state.view.items.find((entry) => entry.id === item.definitionId);
        return definition && <ItemCard key={item.id} item={item} definition={definition} state={state} disabled={disabled} run={run} />;
      })}</div></>}
      {tab === "people" && <div className="grid gap-3 xl:grid-cols-2">{Object.values(state.characters).length === 0 && <p className="text-sm text-zinc-500">还没遇见人物，先去集市或灯塔看看。</p>}{Object.values(state.characters).map((person) => <CharacterCard key={person.id} person={person} here={person.locationId === current.id} disabled={disabled} run={run} />)}</div>}
      {tab === "events" && <>
        {state.view.events.length === 0 && <p className="text-sm text-zinc-500">尚未触发公开事件。可以自由探索，无需接受任何主线。</p>}
        {state.view.events.map((event) => <article key={event.id} className={card}><h4 className="font-semibold">{event.name} <span className="text-xs font-normal text-zinc-500">{event.scope === "world" ? "世界" : event.scope === "character" ? "人物" : "地方"}事件 · {event.settled ? "已结束" : event.locationId === current.id ? "可在此处理" : "前往对应地点处理"}</span></h4><p className="text-sm text-zinc-500">{event.description}</p>{event.choices.map((choice) => <div key={choice.id} className="space-y-1"><button className={button} disabled={disabled || !choice.available || event.locationId !== current.id} onClick={() => {
          if (window.confirm(`${choice.label}？${choice.cost}。将保存为当前分支的决定，可从旧节点另开分支。`)) void run({ action: "choose", eventId: event.id, choiceId: choice.id });
        }}>{choice.label}</button><p className="text-xs text-zinc-500">{choice.cost}{!choice.available ? " · 条件未满足" : ""}</p></div>)}</article>)}
        {state.view.epics.map((epic) => <article key={epic.id} className={card}><h4 className="font-semibold">故事弧 · {epic.name}</h4><p className="text-xs text-zinc-500">{epic.chapters.join(" → ")}</p><p className="text-sm">已达里程碑：{epic.milestones.join(" / ") || "尚无"}</p><p className="text-sm">{epic.ending ? `本分支结局：${epic.ending}` : "结局未定，也可以不参与。"}</p>{epic.consequences.map((line) => <p key={line} className="text-xs text-zinc-500">{line}</p>)}</article>)}
      </>}
      {tab === "history" && <HistoryPanel key={`${sessionId}:${parentTurnId}`} state={state} sessionId={sessionId} parentTurnId={parentTurnId} onError={onError} />}
    </div>
  </section>;
}
