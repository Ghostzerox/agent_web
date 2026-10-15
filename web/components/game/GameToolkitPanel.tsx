"use client";

import { useState } from "react";
import { gameToolRequestSchema, type GameToolRequest, type GameToolkit } from "@/lib/game/toolkit";

export function GameToolkitPanel({ toolkit, busy, enabled, onRun, onError }: { toolkit?: GameToolkit; busy: boolean; enabled: boolean; onRun: (request: GameToolRequest) => Promise<void>; onError: (message: string) => void }) {
  const [action, setAction] = useState<GameToolRequest["action"]>("deck-create");
  const [deckId, setDeckId] = useState("事件牌");
  const [entries, setEntries] = useState("风平浪静\n远处灯火\n突然来客");
  const [count, setCount] = useState(1);
  const [discardIds, setDiscardIds] = useState("");
  const [purpose, setPurpose] = useState("场景事件");
  const run = () => {
    try {
      const lines = entries.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
      const request = gameToolRequestSchema.parse(action === "deck-create" ? { action, deckId, cards: lines } : action === "deck-draw" ? { action, deckId, count } : action === "deck-discard" ? { action, deckId, cardIds: discardIds.split(/[，,\s]+/u).filter(Boolean) } : action === "deck-reset" ? { action, deckId } : { action, entries: lines, purpose });
      void onRun(request);
    } catch { onError("请检查工具参数：牌堆名只用文字、数字、下划线或短横线；每行一张卡/事件，弃牌须填手牌 ID。"); }
  };
  return <details className="rounded-xl border border-violet-200 p-4 dark:border-violet-800"><summary className="cursor-pointer font-medium">牌堆与随机表（随所选剧情分支保存）</summary><div className="mt-3 space-y-3 text-sm">
    <p className="text-xs text-zinc-500">只运行代码，不调用 AI。每次操作保存为剧情节点；读档恢复该节点牌堆。重置会将手牌和弃牌全部洗回。</p>
    {Object.entries(toolkit?.decks ?? {}).map(([id, deck]) => <div key={id} className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900"><strong>{id}</strong> · 剩余 {deck.drawPile.length} / 手牌 {deck.hand.length} / 弃牌 {deck.discard.length}<ul className="mt-1 text-xs">{deck.hand.map((cardId) => <li key={cardId}>{cardId} · {deck.cards.find((card) => card.id === cardId)?.label}</li>)}</ul></div>)}
    <label className="block">操作<select aria-label="游戏工具操作" value={action} onChange={(event) => setAction(event.target.value as GameToolRequest["action"])} className="ml-2 min-h-11 rounded-lg border bg-transparent px-2"><option value="deck-create">创建牌堆并洗牌</option><option value="deck-draw">抽牌</option><option value="deck-discard">弃牌</option><option value="deck-reset">重置洗牌</option><option value="random-table">随机表</option></select></label>
    {action !== "random-table" ? <label className="block">牌堆名<input aria-label="牌堆名" value={deckId} maxLength={40} onChange={(event) => setDeckId(event.target.value)} className="ml-2 min-h-11 rounded-lg border bg-transparent px-2" /></label> : <label className="block">事件用途<input value={purpose} maxLength={120} onChange={(event) => setPurpose(event.target.value)} className="ml-2 min-h-11 rounded-lg border bg-transparent px-2" /></label>}
    {(action === "deck-create" || action === "random-table") && <label className="block">卡牌或事件（一行一项，最多 100）<textarea aria-label="卡牌或事件列表" value={entries} maxLength={16100} rows={4} onChange={(event) => setEntries(event.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-2" /></label>}
    {action === "deck-draw" && <label className="block">抽取数量<input type="number" aria-label="抽牌数量" min={1} max={20} value={count} onChange={(event) => setCount(Number(event.target.value))} className="ml-2 min-h-11 w-20 rounded-lg border bg-transparent px-2" /></label>}
    {action === "deck-discard" && <label className="block">手牌 ID（逗号分隔）<input value={discardIds} onChange={(event) => setDiscardIds(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border bg-transparent px-2" /></label>}
    <button type="button" disabled={busy || !enabled} onClick={run} className="min-h-11 rounded-lg bg-violet-700 px-4 text-white disabled:opacity-50">运行并保存工具回合（不调用 AI）</button>
    {toolkit?.lastResult && <details className="text-xs"><summary>该分支最近工具结果与复现信息</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(toolkit.lastResult, null, 2)}</pre></details>}
  </div></details>;
}
