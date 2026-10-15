"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { GameToolkitPanel } from "./GameToolkitPanel";
import type { GameToolRequest } from "@/lib/game/toolkit";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import {
  createGameTurn,
  exportGameSession,
  getGameSession,
  updateGameSessionStatus,
  type GameEvent,
  type GameSessionDetail,
  type GameTurn,
} from "@/lib/api/gameSessionClient";
import type { GameRuleCheckRequest } from "@/lib/game/checks";
import { GAME_DICE_SIDES, type GameDiceRequest } from "@/lib/game/dice";
import type { GameState } from "@/lib/game/state";
import { getFileExportAdapter } from "@/lib/platform/fileExport";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

type Props = {
  detail: GameSessionDetail;
  onChange: (detail: GameSessionDetail) => void;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
};

const STATUS_LABELS = {
  setup: "尚未开始",
  active: "进行中",
  paused: "已暂停",
  archived: "已归档",
} as const;

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

function message(error: unknown): string {
  return error instanceof Error ? error.message : "游戏操作失败，请稍后重试。";
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

function activePath(turns: readonly GameTurn[], leafId: string | null): Set<string> {
  const result = new Set<string>();
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  let current = leafId ? byId.get(leafId) : undefined;
  while (current && !result.has(current.id)) {
    result.add(current.id);
    current = current.parentTurnId ? byId.get(current.parentTurnId) : undefined;
  }
  return result;
}

export function GamePlayPanel({ detail, onChange, onError, onNotice }: Props) {
  const turns = useMemo(() => detail.turns ?? [], [detail.turns]);
  const activeLeafTurnId = detail.activeLeafTurnId ?? null;
  const [content, setContent] = useState("");
  const [branchSelection, setBranchSelection] = useState<{
    sessionId: string;
    parentTurnId: string | null;
  } | null>(null);
  const parentTurnId = branchSelection?.sessionId === detail.id
    ? branchSelection.parentTurnId
    : activeLeafTurnId;
  const [busy, setBusy] = useState(false);
  const toolRetry = useRef<{ key: string; requestId: string } | null>(null);
  const [useDice, setUseDice] = useState(false);
  const [useCheck, setUseCheck] = useState(false);
  const [diceCount, setDiceCount] = useState(1);
  const [diceSides, setDiceSides] = useState<(typeof GAME_DICE_SIDES)[number]>(20);
  const [diceModifier, setDiceModifier] = useState(0);
  const [dicePurpose, setDicePurpose] = useState("行动检定");
  const [checkCharacterId, setCheckCharacterId] = useState("");
  const [checkAttribute, setCheckAttribute] = useState("");
  const [checkDifficulty, setCheckDifficulty] = useState(10);
  const [checkPurpose, setCheckPurpose] = useState("规则检定");
  const [exporting, setExporting] = useState<"json" | "markdown" | null>(null);
  useNavigationGuard(busy || Boolean(content.trim()), busy ? "游戏回合尚未完成；离开不会取消服务端处理，可返回查看结果。" : "有游戏行动尚未发送，离开后需要重新输入。");
  const byId = useMemo(() => new Map(turns.map((turn) => [turn.id, turn])), [turns]);
  const currentPath = useMemo(
    () => activePath(turns, activeLeafTurnId),
    [turns, activeLeafTurnId],
  );
  const eventsByTurn = useMemo(() => {
    const result = new Map<string, NonNullable<GameSessionDetail["events"]>>();
    for (const item of detail.events ?? []) {
      const items = result.get(item.turnId) ?? [];
      items.push(item);
      result.set(item.turnId, items);
    }
    return result;
  }, [detail.events]);
  const selectedState = useMemo<GameState>(() => {
    const parent = parentTurnId ? byId.get(parentTurnId) : null;
    return parent?.stateSnapshot ?? {
      scene: `${detail.worldName}：${detail.worldPremise}`.slice(0, 1_000),
      sceneFacts: [],
      sceneExits: [],
      objectives: [],
      flags: {},
      resources: {},
      inventory: {},
      characters: Object.fromEntries(detail.characters.map((character) => [
        character.id,
        {
          name: character.name,
          health: character.maxHealth,
          maxHealth: character.maxHealth,
          attributes: character.attributes,
          conditions: [],
        },
      ])),
      items: {},
    };
  }, [byId, detail.characters, detail.worldName, detail.worldPremise, parentTurnId]);
  const checkCharacters = Object.entries(selectedState.characters);
  const resolvedCheckCharacterId = checkCharacters.some(([id]) => id === checkCharacterId)
    ? checkCharacterId
    : checkCharacters[0]?.[0] ?? "";
  const resolvedCheckCharacter = selectedState.characters[resolvedCheckCharacterId];
  const checkAttributes = Object.keys(resolvedCheckCharacter?.attributes ?? {});
  const resolvedCheckAttribute = checkAttributes.includes(checkAttribute)
    ? checkAttribute
    : checkAttributes[0] ?? "";

  const recoverConflict = async (error: unknown) => {
    if (!error || typeof error !== "object" || !("code" in error)) return;
    if (!String(error.code).endsWith("VERSION_CONFLICT")) return;
    onChange(await getGameSession(detail.id));
    onError("其他设备已推进这局游戏，页面已刷新，请检查当前剧情线后重试。");
  };

  const changeStatus = async (status: "active" | "paused") => {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      onChange(await updateGameSessionStatus(detail.id, status, detail.version));
      onNotice(status === "active" ? "游戏已开始，可以输入行动。" : "游戏已暂停，剧情和分支均已保存。");
    } catch (error) {
      onError(message(error));
      await recoverConflict(error);
    } finally {
      setBusy(false);
    }
  };

  const submitTurn = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim() || detail.status !== "active") return;
    setBusy(true);
    onError(null);
    onNotice("AI 正在续写所选剧情线，请稍候…");
    try {
      const diceRequests: GameDiceRequest[] = useDice
        ? [{
            count: diceCount,
            sides: diceSides,
            modifier: diceModifier,
            purpose: dicePurpose.trim(),
          }]
        : [];
      const checkRequest: GameRuleCheckRequest | null = useCheck
        ? {
            characterId: resolvedCheckCharacterId,
            attribute: resolvedCheckAttribute,
            difficulty: checkDifficulty,
            count: diceCount,
            sides: diceSides,
            purpose: checkPurpose.trim(),
          }
        : null;
      const next = await createGameTurn(
        detail.id,
        content.trim(),
        parentTurnId,
        detail.version,
        diceRequests,
        checkRequest,
      );
      onChange(next);
      setContent("");
      setBranchSelection(null);
      setUseDice(false);
      setUseCheck(false);
      onNotice(parentTurnId === activeLeafTurnId
        ? "新回合已保存。"
        : "新分支已创建并切换为当前剧情线。");
    } catch (error) {
      onError(message(error));
      onNotice(null);
      await recoverConflict(error);
    } finally {
      setBusy(false);
    }
  };

  const startExport = async (format: "json" | "markdown") => {
    setExporting(format);
    onError(null);
    onNotice(null);
    try {
      const artifact = await exportGameSession(detail.id, format);
      const result = await getFileExportAdapter().export(artifact);
      onNotice(result.method === "share"
        ? "已打开系统分享面板。"
        : `已下载 ${artifact.filename}。`);
    } catch (error) {
      onError(message(error));
    } finally {
      setExporting(null);
    }
  };

  const runTool = async (toolRequest: GameToolRequest) => {
    if (busy || detail.status !== "active") return;
    setBusy(true); onError(null); onNotice(null);
    const key = JSON.stringify({ session: detail.id, parentTurnId, version: detail.version, toolRequest });
    if (toolRetry.current?.key !== key) toolRetry.current = { key, requestId: crypto.randomUUID() };
    try {
      const next = await createGameTurn(detail.id, `宿主工具：${toolRequest.action}`, parentTurnId, detail.version, [], null, { requestId: toolRetry.current.requestId, toolRequest, toolOnly: true });
      onChange(next); setBranchSelection(null); toolRetry.current = null;
      onNotice("工具回合已保存；没有调用 AI。可从任何已有节点开新分支，或通过检查点恢复。");
    } catch (error) { onError(message(error)); await recoverConflict(error); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6 dark:border-violet-900 dark:bg-zinc-950">
      <GameToolkitPanel toolkit={selectedState.toolkit} busy={busy} enabled={detail.status === "active"} onRun={runTool} onError={onError} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">剧情回合</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {STATUS_LABELS[detail.status]} · {turns.length} 个回合节点 · 每个节点都可作为新分支起点
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void startExport("json")} disabled={Boolean(exporting)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-zinc-700">{exporting === "json" ? "导出中…" : "导出 JSON"}</button>
          <button type="button" onClick={() => void startExport("markdown")} disabled={Boolean(exporting)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-zinc-700">{exporting === "markdown" ? "导出中…" : "导出 Markdown"}</button>
          {detail.status === "setup" && <button type="button" onClick={() => void changeStatus("active")} disabled={busy} className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">开始故事</button>}
          {detail.status === "paused" && <button type="button" onClick={() => void changeStatus("active")} disabled={busy} className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">继续故事</button>}
          {detail.status === "active" && <button type="button" onClick={() => void changeStatus("paused")} disabled={busy} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">暂停</button>}
        </div>
      </div>

      {turns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {detail.status === "setup" ? "点击“开始故事”，然后写下角色的第一个行动。" : "写下第一个行动，AI 会根据世界和角色卡开启故事。"}
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
                className={`rounded-xl border p-4 ${selected ? "border-violet-500 bg-violet-50/70 dark:bg-violet-950/30" : "border-zinc-200 dark:border-zinc-800"}`}
                style={{ marginLeft: `${Math.min(turnDepth(turn, byId), 4) * 0.75}rem` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>回合 {index + 1} · {onCurrentPath ? "当前剧情线" : "历史分支"}{current ? " · 当前叶子" : ""}</span>
                  <button type="button" onClick={() => setBranchSelection({ sessionId: detail.id, parentTurnId: turn.id })} disabled={busy || detail.status !== "active"} className="font-medium text-violet-700 disabled:opacity-40 dark:text-violet-300">{selected ? "已选为续写起点" : "从此处分支"}</button>
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

      {detail.status === "active" && (
        <form onSubmit={submitTurn} className="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <summary className="cursor-pointer font-medium">所选分支的结构化状态</summary>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <p className="sm:col-span-2"><span className="font-semibold">场景：</span>{selectedState.scene || "未记录"}</p>
              <p><span className="font-semibold">场景事实：</span>{selectedState.sceneFacts.join("、") || "无"}</p>
              <p><span className="font-semibold">可用出口：</span>{selectedState.sceneExits.join("、") || "无"}</p>
              <p><span className="font-semibold">目标：</span>{selectedState.objectives.join("、") || "无"}</p>
              <p><span className="font-semibold">物品：</span>{Object.entries(selectedState.inventory).map(([key, value]) => `${selectedState.items[key]?.name ?? key} × ${value}`).join("、") || "无"}</p>
              <p><span className="font-semibold">资源：</span>{Object.entries(selectedState.resources).map(([key, value]) => `${key}: ${value}`).join("、") || "无"}</p>
              <p><span className="font-semibold">标记：</span>{Object.entries(selectedState.flags).map(([key, value]) => `${key}: ${String(value)}`).join("、") || "无"}</p>
              <div className="space-y-1 sm:col-span-2"><span className="font-semibold">角色状态：</span>{Object.entries(selectedState.characters).map(([id, character]) => (
                <p key={id} className="ml-2">{character.name} · 生命 {character.health}/{character.maxHealth} · {Object.entries(character.attributes).map(([key, value]) => `${key} ${value >= 0 ? "+" : ""}${value}`).join("、") || "无数值属性"}{character.conditions.length > 0 ? ` · 状态：${character.conditions.join("、")}` : ""}</p>
              ))}</div>
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="game-turn-content" className="text-sm font-semibold">你的行动或台词</label>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>{parentTurnId ? `续写回合 ${turns.findIndex((turn) => turn.id === parentTurnId) + 1}` : "从故事开头创建分支"}</span>
              {turns.length > 0 && <button type="button" onClick={() => setBranchSelection({ sessionId: detail.id, parentTurnId: null })} className="font-medium text-violet-700 dark:text-violet-300">从开头分支</button>}
            </div>
          </div>
          <textarea id="game-turn-content" required maxLength={8_000} rows={4} value={content} onChange={(event) => setContent(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-950" placeholder="例如：我把旧信放在吧台上，问老板是否认识落款的人。" />
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={useDice} onChange={(event) => {
                setUseDice(event.target.checked);
                if (event.target.checked) setUseCheck(false);
              }} />
              本回合使用服务端可信骰子
            </label>
            {useDice && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-xs">数量
                  <select value={diceCount} onChange={(event) => setDiceCount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 dark:border-amber-800 dark:bg-zinc-950">
                    {[1, 2, 3, 4, 5, 6, 8, 10, 20].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs">面数
                  <select value={diceSides} onChange={(event) => setDiceSides(Number(event.target.value) as (typeof GAME_DICE_SIDES)[number])} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 dark:border-amber-800 dark:bg-zinc-950">
                    {GAME_DICE_SIDES.map((value) => <option key={value} value={value}>d{value}</option>)}
                  </select>
                </label>
                <label className="text-xs">修正值
                  <input type="number" min={-100} max={100} value={diceModifier} onChange={(event) => setDiceModifier(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 dark:border-amber-800 dark:bg-zinc-950" />
                </label>
                <label className="text-xs">用途
                  <input required={useDice} maxLength={120} value={dicePurpose} onChange={(event) => setDicePurpose(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 dark:border-amber-800 dark:bg-zinc-950" />
                </label>
              </div>
            )}
            <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-amber-200 pt-3 text-sm font-medium dark:border-amber-900">
              <input type="checkbox" checked={useCheck} onChange={(event) => {
                setUseCheck(event.target.checked);
                if (event.target.checked) setUseDice(false);
              }} />
              本回合执行角色规则检定
            </label>
            {useCheck && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="text-xs">角色
                  <select value={resolvedCheckCharacterId} onChange={(event) => {
                    setCheckCharacterId(event.target.value);
                    setCheckAttribute("");
                  }} className="mt-1 w-full rounded-lg border border-cyan-300 bg-white px-2 py-2 dark:border-cyan-800 dark:bg-zinc-950">
                    {checkCharacters.map(([id, character]) => <option key={id} value={id}>{character.name}</option>)}
                  </select>
                </label>
                <label className="text-xs">属性
                  <select value={resolvedCheckAttribute} onChange={(event) => setCheckAttribute(event.target.value)} className="mt-1 w-full rounded-lg border border-cyan-300 bg-white px-2 py-2 dark:border-cyan-800 dark:bg-zinc-950">
                    {checkAttributes.map((attribute) => <option key={attribute} value={attribute}>{attribute}（{resolvedCheckCharacter?.attributes[attribute] ?? 0}）</option>)}
                  </select>
                </label>
                <label className="text-xs">难度
                  <input type="number" min={-100} max={200} value={checkDifficulty} onChange={(event) => setCheckDifficulty(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-cyan-300 bg-white px-2 py-2 dark:border-cyan-800 dark:bg-zinc-950" />
                </label>
                <label className="text-xs">数量
                  <select value={diceCount} onChange={(event) => setDiceCount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-cyan-300 bg-white px-2 py-2 dark:border-cyan-800 dark:bg-zinc-950">
                    {[1, 2, 3, 4, 5, 6, 8, 10, 20].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="text-xs">面数
                  <select value={diceSides} onChange={(event) => setDiceSides(Number(event.target.value) as (typeof GAME_DICE_SIDES)[number])} className="mt-1 w-full rounded-lg border border-cyan-300 bg-white px-2 py-2 dark:border-cyan-800 dark:bg-zinc-950">
                    {GAME_DICE_SIDES.map((value) => <option key={value} value={value}>d{value}</option>)}
                  </select>
                </label>
                <label className="text-xs">用途
                  <input required={useCheck} maxLength={120} value={checkPurpose} onChange={(event) => setCheckPurpose(event.target.value)} className="mt-1 w-full rounded-lg border border-cyan-300 bg-white px-2 py-2 dark:border-cyan-800 dark:bg-zinc-950" />
                </label>
                {(!resolvedCheckCharacterId || !resolvedCheckAttribute) && <p className="col-span-2 text-xs text-red-600 sm:col-span-3">请先在角色卡中配置至少一个数值属性。</p>}
              </div>
            )}
          </div>
          <button type="submit" disabled={busy || !content.trim() || (useDice && !dicePurpose.trim()) || (useCheck && (!resolvedCheckCharacterId || !resolvedCheckAttribute || !checkPurpose.trim()))} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "AI 正在续写…" : parentTurnId === activeLeafTurnId ? "发送并继续" : "创建新分支"}</button>
        </form>
      )}
    </section>
  );
}
