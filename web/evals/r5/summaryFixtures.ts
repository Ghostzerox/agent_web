import { DEFAULT_SUMMARY_SETTINGS, summarySources, type SummaryMessage, type SummaryPayload } from "@/lib/conversation/summary";
export function summaryFixture() {
  const id = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
  const anchors = new Map([[0, "这是合成练习项目，预算最多30元，最终期限周五。"], [6, "待确认事项是导师答复，不得声称已经答复。"], [12, "本次只讨论计划，禁止创建真实任务。"]]);
  const rows: SummaryMessage[] = Array.from({ length: 24 }, (_, n) => ({ id: id(n + 1), parentMessageId: n ? id(n) : null, role: n % 2 ? "assistant" : "user", status: "complete", content: anchors.get(n) ?? `第${n + 1}条合成讨论：${"复核已有资料，保持约束，不推断已经完成，先核实再作决定。".repeat(14)}` }));
  const payload: SummaryPayload = { points: [...anchors].map(([n, quote], i) => ({ kind: i === 1 ? "open" : "constraint", text: quote, evidence: [{ messageId: rows[n].id, quote }] })) };
  const question = "只依据对话给出JSON：budget为预算上限数字，deadline为期限，pending为尚待确认事项名称，不要说已完成。";
  return { rows, sources: summarySources(rows, DEFAULT_SUMMARY_SETTINGS), payload, question, gold: { budget: 30, deadline: "周五", pending: "导师答复" } };
}
