"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { GameToolkitPanel } from "./GameToolkitPanel";
import { AppLink } from "@/components/platform/AppLink";
import { ExplorationPanel } from "./ExplorationPanel";
import type { ExplorationAction } from "@/lib/game/exploration/contracts";
import { SEMANTIC_LABELS, type SemanticInput, type SemanticKind } from "@/lib/game/exploration/semanticContracts";
import { sessionExplorationTemplate } from "@/lib/game/exploration/templateReference";
import { findExplorationTemplate } from "@/lib/game/exploration/templateCatalog";
import type { GameToolRequest } from "@/lib/game/toolkit";
import { GameTurnHistory } from "./GameTurnHistory";
import {
  createGameTurn,
  exportGameSession,
  getGameSession,
  updateGameSessionStatus,
  type GameSessionDetail,
} from "@/lib/api/gameSessionClient";
import type { GameRuleCheckRequest } from "@/lib/game/checks";
import { GAME_DICE_SIDES, type GameDiceRequest } from "@/lib/game/dice";
import { initialGameState, type GameState } from "@/lib/game/state";
import { getFileExportAdapter } from "@/lib/platform/fileExport";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";

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

function message(error: unknown): string {
  return error instanceof Error ? error.message : "游戏操作失败，请稍后重试。";
}

export function GamePlayPanel({ detail, onChange, onError, onNotice }: Props) {
  const turns = useMemo(() => detail.turns ?? [], [detail.turns]);
  const activeLeafTurnId = detail.activeLeafTurnId ?? null;
  const [content, setContent] = useState("");
  const [inputKind, setInputKind] = useState<SemanticKind>("action");
  const [targetId, setTargetId] = useState("");
  const [channel, setChannel] = useState<"direct" | "public">("direct");
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
  const selectedState = useMemo<GameState>(() => {
    const parent = parentTurnId ? byId.get(parentTurnId) : null;
    return parent?.stateSnapshot ?? initialGameState(detail.worldName, detail.worldPremise, detail.characters);
  }, [byId, detail.characters, detail.worldName, detail.worldPremise, parentTurnId]);
  const checkCharacters = Object.entries(selectedState.characters);
  const present = Object.values(selectedState.exploration?.characters ?? {}).filter((person) => person.controller !== "user" && person.locationId === selectedState.exploration?.locationId);
  const selectedTarget = present.find((person) => person.id === targetId)?.id ?? present[0]?.id ?? "";
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
    onNotice(selectedState.exploration && ["private_thought", "ooc_instruction"].includes(inputKind) ? "正在保存本局记录，不调用AI。" : "AI 正在回应所选输入，请稍候…");
    try {
      const diceRequests: GameDiceRequest[] = !selectedState.exploration && useDice
        ? [{
            count: diceCount,
            sides: diceSides,
            modifier: diceModifier,
            purpose: dicePurpose.trim(),
          }]
        : [];
      const checkRequest: GameRuleCheckRequest | null = !selectedState.exploration && useCheck
        ? {
            characterId: resolvedCheckCharacterId,
            attribute: resolvedCheckAttribute,
            difficulty: checkDifficulty,
            count: diceCount,
            sides: diceSides,
            purpose: checkPurpose.trim(),
          }
        : null;
      const semanticInput: SemanticInput | undefined = selectedState.exploration ? [inputKind === "dialogue"
        ? { kind: "dialogue", targetId: selectedTarget, channel, text: content.trim() }
        : { kind: inputKind, text: content.trim() }] : undefined;
      const key = JSON.stringify({ session: detail.id, parentTurnId, version: detail.version, semanticInput });
      if (semanticInput && toolRetry.current?.key !== key) toolRetry.current = { key, requestId: crypto.randomUUID() };
      const next = await createGameTurn(
        detail.id,
        content.trim(),
        parentTurnId,
        detail.version,
        diceRequests,
        checkRequest,
        semanticInput ? { semanticInput, requestId: toolRetry.current!.requestId } : {},
      );
      onChange(next);
      setContent("");
      toolRetry.current = null;
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

  const runExploration = async (explorationAction: ExplorationAction, playerContent?: string, narrate = false, semanticInput?: SemanticInput) => {
    if (busy || detail.status !== "active") return false;
    setBusy(true); onError(null); onNotice(explorationAction.action === "encounter" ? "AI 相遇请求处理中，用量以返回记录为准。" : narrate ? "AI 正在回应；只有这次明确发送会调用模型。" : null);
    const key = JSON.stringify({ session: detail.id, parentTurnId, version: detail.version, explorationAction, playerContent, narrate, semanticInput });
    if (toolRetry.current?.key !== key) toolRetry.current = { key, requestId: crypto.randomUUID() };
    try {
      const next = await createGameTurn(detail.id, playerContent ?? `探索动作：${explorationAction.action}`, parentTurnId, detail.version, [], null, { requestId: toolRetry.current.requestId, explorationAction, narrate, ...(semanticInput ? { semanticInput } : {}) });
      onChange(next); setBranchSelection(null); toolRetry.current = null;
      onNotice(explorationAction.action === "encounter" ? "相遇结果已保存；模型用量见上方（可能产生费用）。" : narrate ? "人物对话与宿主结果已保存。" : "探索动作已保存；未调用 AI。");
      return true;
    } catch (error) { onError(message(error)); onNotice(null); await recoverConflict(error); return false; }
    finally { setBusy(false); }
  };

  const templateReference = sessionExplorationTemplate(detail.worldRules);
  const explorationPreset = templateReference !== null;
  const templateTitle = templateReference ? findExplorationTemplate(templateReference)?.title ?? detail.worldName : "探索世界";
  const selectBranch = (parentTurnId: string | null) => {
    if (!busy && requestNavigationPermission()) setBranchSelection({ sessionId: detail.id, parentTurnId });
  };
  const openWorld = async () => {
    if (busy || turns.length || !templateReference) return;
    setBusy(true); onError(null);
    try {
      const active = detail.status === "setup" ? await updateGameSessionStatus(detail.id, "active", detail.version) : detail;
      onChange(active);
      const key = `open:${active.id}:${active.version}`;
      if (toolRetry.current?.key !== key) toolRetry.current = { key, requestId: crypto.randomUUID() };
      onChange(await createGameTurn(active.id, `开启探索：${templateTitle}`, null, active.version, [], null, { requestId: toolRetry.current.requestId, explorationAction: { action: "start", ...templateReference } }));
      toolRetry.current = null; setBranchSelection(null); onNotice("探索世界已开启。从地图选择行动，或到人物页自由交流。");
    } catch (error) { onError(message(error)); await recoverConflict(error); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6 dark:border-violet-900 dark:bg-zinc-950">
      {selectedState.exploration && parentTurnId && <AppLink className="inline-block rounded-lg border border-[var(--workspace-border)] px-3 py-2 text-sm text-violet-600" href={`/entertainment?view=draws&session=${detail.id}&parent=${parentTurnId}`}>获取 / 抽卡 →</AppLink>}
      {selectedState.exploration && parentTurnId && <AppLink className="inline-block rounded-lg border border-[var(--workspace-border)] px-3 py-2 text-sm text-violet-600" href={`/entertainment?view=events&session=${detail.id}&parent=${parentTurnId}`}>事件建议 / 创作 →</AppLink>}
      {selectedState.exploration ? <ExplorationPanel key={detail.id} state={selectedState.exploration} sessionId={detail.id} parentTurnId={parentTurnId} disabled={busy || detail.status !== "active"} run={runExploration} onError={onError} /> : !explorationPreset && <GameToolkitPanel toolkit={selectedState.toolkit} busy={busy} enabled={detail.status === "active"} onRun={runTool} onError={onError} />}
      {explorationPreset && turns.length === 0 && ["setup", "active"].includes(detail.status) && <div className="rounded-xl border border-violet-200 p-4"><p className="mb-3 text-sm text-zinc-500">这份新存档尚未开启探索；不会生成收费的 AI 开场。</p><button disabled={busy} onClick={() => void openWorld()} className="ui-button ui-button-primary">开启探索世界</button></div>}
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
          {detail.status === "setup" && !explorationPreset && <button type="button" onClick={() => void changeStatus("active")} disabled={busy} className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">开始故事</button>}
          {detail.status === "paused" && <button type="button" onClick={() => void changeStatus("active")} disabled={busy} className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">继续故事</button>}
          {detail.status === "active" && <button type="button" onClick={() => void changeStatus("paused")} disabled={busy} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">暂停</button>}
        </div>
      </div>

      <GameTurnHistory detail={detail} parentTurnId={parentTurnId} busy={busy} explorationPreset={explorationPreset} selectBranch={selectBranch} />

      {detail.status === "active" && (!explorationPreset || selectedState.exploration) && (
        <form onSubmit={submitTurn} className="space-y-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          {!selectedState.exploration && <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
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
          </details>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="game-turn-content" className="text-sm font-semibold">你的行动或台词</label>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>{parentTurnId ? `续写回合 ${turns.findIndex((turn) => turn.id === parentTurnId) + 1}` : "从故事开头创建分支"}</span>
              {turns.length > 0 && <button type="button" onClick={() => selectBranch(turns.find((turn) => turn.stateSnapshot.exploration)?.id ?? null)} className="font-medium text-violet-700 dark:text-violet-300">从开头分支</button>}
            </div>
          </div>
          {selectedState.exploration && <div className="flex flex-wrap gap-3 text-xs">
            <label>探索输入类型<select aria-label="探索输入类型" value={inputKind} onChange={(event) => setInputKind(event.target.value as SemanticKind)} className="ml-2 rounded-lg border border-zinc-300 bg-[var(--workspace-surface)] p-2">{Object.entries(SEMANTIC_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            {inputKind === "dialogue" && <><label>回复人物<select aria-label="回复人物" value={selectedTarget} onChange={(event) => setTargetId(event.target.value)} className="ml-2 rounded-lg border border-zinc-300 bg-[var(--workspace-surface)] p-2">{!present.length && <option value="">当前没有可交流人物</option>}{present.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>交流范围<select aria-label="台词交流范围" value={channel} onChange={(event) => setChannel(event.target.value as "direct" | "public")} className="ml-2 rounded-lg border border-zinc-300 bg-[var(--workspace-surface)] p-2"><option value="direct">定向</option><option value="public">公开给在场人物</option></select></label></>}
          </div>}
          <textarea id="game-turn-content" required maxLength={selectedState.exploration ? 2000 : 8000} rows={4} value={content} onChange={(event) => setContent(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-950" placeholder="请明确区分台词、行动意图和私人想法，不要混写。" />
          {selectedState.exploration && <p className="text-xs text-zinc-500">台词只传给选定人物；行动意图 / 旁白建议交给主持，不视为已发生。私人想法 / 场外指令仅保存、不调用AI，也不让NPC知情。世界编辑与发布将在后续创作工作台提供。</p>}
          {!selectedState.exploration && <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
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
          </div>}
          <button type="submit" disabled={busy || !content.trim() || Boolean(selectedState.exploration && inputKind === "dialogue" && !selectedTarget) || (!selectedState.exploration && ((useDice && !dicePurpose.trim()) || (useCheck && (!resolvedCheckCharacterId || !resolvedCheckAttribute || !checkPurpose.trim()))))} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "正在处理…" : parentTurnId === activeLeafTurnId ? "发送并继续" : "创建新分支"}</button>
        </form>
      )}
    </section>
  );
}
