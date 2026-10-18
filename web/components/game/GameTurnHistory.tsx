"use client";
import { useMemo } from "react";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import type { GameEvent, GameTurn, GameSessionDetail } from "@/lib/api/gameSessionClient";
import { gameTurnPath } from "@/lib/game/turnTree";

const OUTCOME_LABELS = {
  "critical-success": "大成功",
  success: "成功",
  failure: "失败",
  "critical-failure": "大失败",
} as const;

function GameEventCard({ event }: { event: GameEvent }) {
  if (event.kind === "rule_check") {
    const check = event.payload;
    return (
      <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100">
        <span className="font-semibold">规则检定 · {check.characterName} / {check.attribute}</span>
        <span className="ml-2">{check.dice.notation} → [{check.dice.results.join(", ")}] = {check.total} / 难度 {check.difficulty} · {OUTCOME_LABELS[check.outcome]}</span>
        <details className="mt-1 text-[11px] opacity-70">
          <summary className="cursor-pointer">复现信息</summary>
          <div className="mt-1 break-all">seed: {check.dice.seed} · {check.dice.algorithm} · 差值 {check.margin}</div>
        </details>
      </div>
    );
  }
  const roll = event.payload;
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="font-semibold">可信骰子 · {roll.purpose}</span>
      <span className="ml-2">{roll.notation} → [{roll.results.join(", ")}] = {roll.total}</span>
      <details className="mt-1 text-[11px] opacity-70">
        <summary className="cursor-pointer">复现信息</summary>
        <div className="mt-1 break-all">seed: {roll.seed} · {roll.algorithm}</div>
      </details>
    </div>
  );
}

function turnDepth(turn: GameTurn, byId: Map<string, GameTurn>): number {
  let depth = 0;
  let current = turn;
  const visited = new Set<string>();
  while (current.parentTurnId) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = byId.get(current.parentTurnId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}


export function GameTurnHistory({ detail, parentTurnId, busy, explorationPreset, selectBranch }: {
  detail: GameSessionDetail; parentTurnId: string | null; busy: boolean; explorationPreset: boolean;
  selectBranch: (id: string | null) => void;
}) {
  const turns = detail.turns ?? [];
  const activeLeafTurnId = detail.activeLeafTurnId;
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const currentPath = new Set(gameTurnPath(turns, activeLeafTurnId).map((turn) => turn.id));
  const eventsByTurn = useMemo(() => {
    const result = new Map<string, NonNullable<GameSessionDetail["events"]>>();
    for (const item of detail.events ?? []) {
      const items = result.get(item.turnId) ?? [];
      items.push(item);
      result.set(item.turnId, items);
    }
    return result;
  }, [detail.events]);

  return <>      {turns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {explorationPreset ? "点击上方“开启探索世界”进入地图，之后可自由行动。" : detail.status === "setup" ? "点击“开始故事”，然后写下角色的第一个行动。" : "写下第一个行动，AI 会根据世界和角色卡开启故事。"}
        </div>
      ) : (
        <div className="space-y-3" aria-label="剧情分支树">
          {turns.map((turn, index) => {
            const current = turn.id === activeLeafTurnId;
            const selected = turn.id === parentTurnId;
            const onCurrentPath = currentPath.has(turn.id);
            return (
              <article
                key={turn.id}
                id={`game-turn-${turn.id}`}
                className={`rounded-xl border p-4 ${selected ? "border-violet-500 bg-violet-50/70 dark:bg-violet-950/30" : "border-zinc-200 dark:border-zinc-800"}`}
                style={{ marginLeft: `${Math.min(turnDepth(turn, byId), 4) * 0.75}rem` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>回合 {index + 1} · {onCurrentPath ? "当前剧情线" : "历史分支"}{current ? " · 当前叶子" : ""}</span>
                  <button type="button" onClick={() => selectBranch(turn.id)} disabled={busy || detail.status !== "active"} className="font-medium text-violet-700 disabled:opacity-40 dark:text-violet-300">{selected ? "已选为续写起点" : "从此处分支"}</button>
                </div>
                <div className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900"><span className="mr-2 font-semibold">你</span>{turn.playerContent}</div>
                {(eventsByTurn.get(turn.id) ?? []).map((gameEvent) => (
                  <GameEventCard key={gameEvent.id} event={gameEvent} />
                ))}
                <div className="mt-3 text-sm leading-7"><MarkdownMessage content={turn.assistantContent} /></div>
                <p className="mt-3 text-[11px] text-zinc-400">模型：{turn.model}</p>
              </article>
            );
          })}
        </div>
      )}

</>;
}
