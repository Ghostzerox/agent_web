import { inputTextCharacters, resolveGenerationBudget } from "@/lib/ai/server/tokenBudget";
import type { ChatCompletionMessage } from "@/lib/ai/messages";
import type { ModelBusiness } from "@/lib/ai/modelUsage";

function commonPrefix(left: string, right: string): number {
  let index = 0;
  while (index < Math.min(left.length, right.length) && left[index] === right[index]) index++;
  return index;
}

export function runTokenCostEval() {
  const system: ChatCompletionMessage = { role: "system", content: "保持专业性、事实边界与数据隔离。" };
  const user = (content: string): ChatCompletionMessage => ({ role: "user", content });
  const history: ChatCompletionMessage[] = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content: `${index}: ${"保留当前分支的完整历史。".repeat(30)}` }));
  const staticTask = "根据证据回答，不编造来源；固定输出结构。";
  const snapshotA: ChatCompletionMessage = { role: "system", content: '{"scene":"甲","health":10}' };
  const snapshotB: ChatCompletionMessage = { role: "system", content: '{"scene":"乙","health":9}' };
  const pairs: Array<{ name: string; business: ModelBusiness; before: [ChatCompletionMessage[], ChatCompletionMessage[]]; after: [ChatCompletionMessage[], ChatCompletionMessage[]] }> = [
    { name: "short-chat", business: "chat", before: [[system, user("解释极限")], [system, user("解释导数")]], after: [[system, user("解释极限")], [system, user("解释导数")]] },
    { name: "long-chat-no-lossy-summary", business: "chat", before: [[system, ...history, user("继续")], [system, ...history, user("再解释")]], after: [[system, ...history, user("继续")], [system, ...history, user("再解释")]] },
    { name: "historical-retry-selected-branch", business: "chat", before: [[system, ...history.slice(0, 8), user("问题")], [system, ...history.slice(0, 8), user("问题")]], after: [[system, ...history.slice(0, 8), user("问题")], [system, ...history.slice(0, 8), user("问题")]] },
    { name: "search-evidence-metadata", business: "chat", before: [[system, user('{"snippet":"证据","publishedAt":"2026-10-01","fetchedAt":"2026-10-01T01:00:00.000Z"}')], [system, user('{"snippet":"证据","publishedAt":"2026-10-01","fetchedAt":"2026-10-01T02:00:00.000Z"}')]], after: [[system, user('{"publishedAt":"2026-10-01","retrievedOn":"2026-10-01","snippet":"证据"}')], [system, user('{"publishedAt":"2026-10-01","retrievedOn":"2026-10-01","snippet":"证据"}')]] },
    { name: "scheduled-news-prefix", business: "news", before: [[system, user(`日期1\n${staticTask}`)], [system, user(`日期2\n${staticTask}`)]], after: [[system, user(`${staticTask}\n日期1`)], [system, user(`${staticTask}\n日期2`)]] },
    { name: "learning-structured-output", business: "memorization", before: [[system, user("评价目标与复述：甲")], [system, user("评价目标与复述：乙")]], after: [[system, user("评价目标与复述：甲")], [system, user("评价目标与复述：乙")]] },
    { name: "game-dynamic-snapshot", business: "game", before: [[system, snapshotA, ...history, user("行动1")], [system, snapshotB, ...history, user("行动2")]], after: [[system, ...history, snapshotA, user("行动1")], [system, ...history, snapshotB, user("行动2")]] },
  ];
  return {
    schemaVersion: 1, kind: "synthetic-structural-baseline", modelCalls: 0,
    limitations: ["Characters and shared JSON prefixes are NOT tokenizer counts or cached tokens.", "Synthetic fixtures are not an API billing benchmark or answer-quality evaluation.", "Long chat is deliberately unchanged until summary quality and net costs are validated."],
    cases: pairs.map((pair) => ({
      name: pair.name, beforeInputCharacters: inputTextCharacters(pair.before[0]), afterInputCharacters: inputTextCharacters(pair.after[0]),
      beforeSharedJsonPrefixCharacters: commonPrefix(JSON.stringify(pair.before[0]), JSON.stringify(pair.before[1])),
      afterSharedJsonPrefixCharacters: commonPrefix(JSON.stringify(pair.after[0]), JSON.stringify(pair.after[1])),
      configuredOutputCeiling: resolveGenerationBudget({ baseUrl: "https://api.deepseek.com" }, pair.business, {}).maxOutputTokens,
      actualInputTokens: null, actualCachedTokens: null, actualCost: null,
    })),
  };
}
