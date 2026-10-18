import type { GameSessionExportFormat } from "@/lib/game/contracts";
import { gameTurnPath } from "@/lib/game/turnTree";
import type { GameSessionDetail } from "@/lib/repositories/gameSessionRepository";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";

function safeFilename(value: string): string {
  const cleaned = value.trim().replace(/[\\/:：*?"<>|]+/gu, "-").slice(0, 60);
  return cleaned || "game-session";
}

function markdown(session: GameSessionDetail, exportedAt: Date): string {
  const activeIds = new Set(
    gameTurnPath(session.turns, session.activeLeafTurnId).map((turn) => turn.id),
  );
  const eventsByTurn = new Map<string, typeof session.events>();
  for (const event of session.events) {
    const events = eventsByTurn.get(event.turnId) ?? [];
    events.push(event);
    eventsByTurn.set(event.turnId, events);
  }
  const sections = session.turns.map((turn, index) => {
    const toolEvents = (eventsByTurn.get(turn.id) ?? []).map((event) => {
      if (event.kind === "rule_check" && "dice" in event.payload) {
        const check = event.payload;
        return [
          `- 规则检定 · ${check.characterName} / ${check.attribute}：${check.dice.notation} → [${check.dice.results.join(", ")}] = ${check.total}，难度 ${check.difficulty}，结果 ${check.outcome}`,
          `  - seed：\`${check.dice.seed}\``,
          `  - algorithm：\`${check.dice.algorithm}\``,
        ].join("\n");
      }
      const roll = event.payload;
      if (!("notation" in roll)) return "- 未知工具事件";
      return [
        `- 可信骰子 · ${roll.purpose}：${roll.notation} → [${roll.results.join(", ")}] = ${roll.total}`,
        `  - seed：\`${roll.seed}\``,
        `  - algorithm：\`${roll.algorithm}\``,
      ].join("\n");
    });
    return [
    `## 回合 ${index + 1}${activeIds.has(turn.id) ? " · 当前剧情线" : " · 历史分支"}`,
    "",
    `- 回合 ID：\`${turn.id}\``,
    `- 父回合：${turn.parentTurnId ? `\`${turn.parentTurnId}\`` : "根节点"}`,
    `- 模型：${turn.model}`,
    `- 时间：${turn.createdAt.toISOString()}`,
    "",
    "### 玩家",
    "",
    turn.playerContent,
    "",
    "### AI",
    "",
    turn.assistantContent,
    "",
    "### 可信工具事件",
    "",
    toolEvents.length > 0 ? toolEvents.join("\n") : "- 本回合没有骰子或规则检定。",
    ...(turn.stateSnapshot.exploration ? ["", "### 探索记录", "", turn.stateSnapshot.exploration.lastResult,
      `- 世界模板：${turn.stateSnapshot.exploration.templateId}@${turn.stateSnapshot.exploration.templateVersion} / exploration.v1`,
      `- 第 ${turn.stateSnapshot.exploration.tick} 时刻；位置 ${turn.stateSnapshot.exploration.locationId}`,
      "- 探索事件与历史的来源回执保留在下方快照，不与旧骰子事件混为一谈。"] : []),
    "",
    "### 状态补丁",
    "",
    "```json",
    JSON.stringify(turn.statePatch, null, 2),
    "```",
    "",
    "### 回合后状态快照",
    "",
    "```json",
    JSON.stringify(turn.stateSnapshot, null, 2),
    "```",
  ].join("\n");
  });

  return [
    `# ${session.title}`,
    "",
    "> 这是独立 GameSession 的虚构记录，不代表现实事实。",
    "",
    `- 类型：${session.kind}`,
    `- 状态：${session.status}`,
    `- 世界：${session.worldName}`,
    `- 导出时间：${exportedAt.toISOString()}`,
    "",
    "## 世界前提",
    "",
    session.worldPremise,
    "",
    "## 检查点",
    "",
    ...(session.checkpoints.length > 0
      ? session.checkpoints.flatMap((checkpoint) => [
          `- ${checkpoint.name} · 回合 \`${checkpoint.turnId}\`${checkpoint.note ? ` · ${checkpoint.note}` : ""}`,
        ])
      : ["- 无检查点。"]),
    "",
    ...sections,
  ].join("\n");
}

export function exportGameSessionArtifact(
  session: GameSessionDetail,
  format: GameSessionExportFormat,
  exportedAt = new Date(),
): PromptExportArtifact {
  const base = `${safeFilename(session.title)}-${exportedAt.toISOString().slice(0, 10)}`;
  if (format === "json") {
    return {
      filename: `${base}.json`,
      mediaType: "application/json",
      content: JSON.stringify({ schemaVersion: 3, exportedAt, session }, null, 2),
      directory: "game-exports",
      shareTitle: "分享游戏记录",
      shareText: "独立 GameSession 的虚构世界、角色卡与完整分支记录。",
      dialogTitle: "分享游戏 JSON",
    };
  }
  return {
    filename: `${base}.md`,
    mediaType: "text/markdown",
    content: markdown(session, exportedAt),
    directory: "game-exports",
    shareTitle: "分享游戏记录",
    shareText: "独立 GameSession 的虚构剧情记录。",
    dialogTitle: "分享游戏 Markdown",
  };
}
