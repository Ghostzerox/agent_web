import { afterEach, describe, expect, it, vi } from "vitest";
import { qualityWorkflows } from "@/evals/r3/qualityWorkflows";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { PROMPT_ENTRY_POINTS } from "@/evals/r3/promptInventory";

const questionOutput = JSON.stringify({ candidates: [
  { question: "英语学习安排中哪个未经验证的假设最值得检查？", type: "assumption", why: "检验英语学习前提。", emotionalLoad: 1 },
  { question: "本周先做哪个英语学习小动作来验证方法是否有效？", type: "action", why: "用小行动复盘英语学习。", emotionalLoad: 1 },
  { question: "哪些英语学习证据能改变你对当前方法的判断？", type: "evidence", why: "关注英语学习反例。", emotionalLoad: 1 },
] });
const outputs: Record<string, string> = {
  chat: "合成回答。", "agent-task": "合成任务结果。",
  news: "## 今日重点\n记录有三次十分钟练习。[S1]\n## 为什么值得关注\n可复盘时间投入。[S1]",
  books: "## 本次推荐\n### 《合成英语入门》— 林甲\n入门练习。[S1]\n### 《合成阅读方法》— 陈乙\n阅读方法。[S1]\n## 为什么现在推荐\n用途不同。\n## 阅读门槛与投入\n每周九十分钟。\n## 试读与判断\n先看目录。",
  reflection: questionOutput, memorization: '{"score":80,"feedback":"合成反馈","missedPoints":[]}',
  "problem-solving": '{"subject":"math","problemSummary":"合成题意","response":"先核对条件","assessment":"not_applicable","misconception":null,"errorTags":[],"nextQuestion":null}',
  "review-card": '{"front":"如何复核加法？","back":"用逆运算检查。","reason":"方法可迁移。","tags":["加法"]}',
  game: '{"narrative":"雾中响起船笛。","statePatch":{}}',
};
afterEach(() => vi.unstubAllGlobals());
describe("R3.4 controlled quality workflows", () => {
  it("runs five explicit cases per family through real builders and validators without network or credentials", async () => {
    const fetch = vi.fn(() => { throw new Error("No network in offline workflow validation"); });
    vi.stubGlobal("fetch", fetch);
    const workflows = qualityWorkflows();
    expect(workflows).toHaveLength(45);
    for (const { id } of PROMPT_ENTRY_POINTS) expect(workflows.filter((item) => item.entry === id)).toHaveLength(5);
    for (const workflow of workflows) {
      const requests: ModelStreamRequest[] = [];
      await workflow.run({ async *stream(request) { requests.push(request); yield { type: "delta", text: outputs[workflow.entry] }; yield { type: "done" }; } });
      expect(requests, workflow.id).toHaveLength(1);
      expect(requests[0].business, workflow.id).toBe(workflow.entry);
      expect(JSON.stringify(requests)).not.toContain("synthetic-placeholder");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
