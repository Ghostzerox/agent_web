import { describe, expect, it, vi } from "vitest";
import type { WebSearchProvider } from "@/lib/search/webSearch";
import type { AgentPromptGeneratorPort } from "@/lib/tasks/agentPromptGenerator";
import {
  briefingSourceSignal,
  createPersonalBriefingGenerator,
  novelBriefingCitations,
  PersonalBriefingGenerationError,
} from "@/lib/tasks/personalBriefingGenerator";

const sources = [
  {
    id: "S1",
    title: "AI policy [weekly] update",
    url: "https://example.com/report(1)",
    snippet: "A new artificial intelligence policy report was published.",
    source: "example.com",
    publishedAt: "2026-09-25T00:00:00.000Z",
    fetchedAt: "2026-09-26T00:00:00.000Z",
  },
  {
    id: "S2",
    title: "Unrelated source",
    url: "https://example.org/unused",
    snippet: "This result was retrieved but not cited by the generated briefing.",
    source: "example.org",
    publishedAt: null,
    fetchedAt: "2026-09-26T00:00:00.000Z",
  },
];

function search(results = sources): WebSearchProvider {
  return { search: vi.fn().mockResolvedValue(results) };
}

function agent(content: string): AgentPromptGeneratorPort {
  return {
    generate: vi.fn().mockResolvedValue({ content, model: "briefing-model" }),
  };
}

const validContent = [
  "## 今日重点",
  "一项新的人工智能政策报告已经发布。[S1]",
  "## 为什么值得关注",
  "它与用户选择的人工智能政策主题直接相关。[S1]",
].join("\n\n");

describe("personal briefing generator", () => {
  it("searches the selected topic and appends a deterministic dated source list", async () => {
    const searchProvider = search();
    const agentGenerator = agent(validContent);
    const reflection = {
      generate: vi.fn().mockResolvedValue({
        content: "## 给你的思考问题\n\n**这项政策会怎样改变你下周验证信息的方式？**",
        model: "reflection-model",
        candidateCount: 3,
        questions: [
          {
            question: "这项政策会怎样改变你下周验证信息的方式？",
            type: "action" as const,
            why: "形成下一步。",
            scores: { relevance: 5, novelty: 5, actionability: 5, emotionalLoad: 1, total: 5 },
            candidateCount: 3,
          },
        ],
      }),
    };
    const generator = createPersonalBriefingGenerator({
      search: searchProvider,
      agent: agentGenerator,
      reflection,
    });

    const result = await generator.generate(
      "国际人工智能政策",
      new Date("2026-09-26T01:00:00.000Z"),
      "task-1",
      new AbortController().signal,
    );

    expect(searchProvider.search).toHaveBeenCalledWith(
      expect.stringContaining("国际人工智能政策 最新 进展 新闻 2026年9月26日"),
      expect.any(AbortSignal),
    );
    expect(vi.mocked(agentGenerator.generate).mock.calls[0][0]).toContain(
      "不可信外部数据",
    );
    const prompt = vi.mocked(agentGenerator.generate).mock.calls[0][0];
    expect(prompt.match(/^## .+$/gmu)).toEqual(["## 今日重点", "## 为什么值得关注"]);
    expect(prompt).toContain("区分发布日期与事件发生日");
    expect(prompt).toContain("证据不足可少条");
    expect(result).toMatchObject({ model: "briefing-model", sourceCount: 1 });
    expect(result.questions).toHaveLength(1);
    expect(result.content).toContain("## 给你的思考问题");
    expect(reflection.generate).toHaveBeenCalledWith(
      "国际人工智能政策",
      validContent,
      new Date("2026-09-26T01:00:00.000Z"),
      expect.any(AbortSignal),
    );
    expect(result.sources).toEqual([briefingSourceSignal(sources[0])]);
    expect(result.content).toContain("2026年9月26日");
    expect(result.content).toContain("## 来源");
    expect(result.content).toContain("AI policy \\[weekly\\] update");
    expect(result.content).toContain("https://example.com/report%281%29");
    expect(result.content).not.toContain("https://example.org/unused");
    expect(result.content).toContain("关注理由：这是你设定的“国际人工智能政策”个人简报");
  });

  it("uses stable retry semantics for unavailable search and no results", async () => {
    await expect(
      createPersonalBriefingGenerator({ agent: agent(validContent) }).generate(
        "主题",
        new Date(),
        "task-1",
      ),
    ).rejects.toMatchObject({
      code: "BRIEFING_SEARCH_UNAVAILABLE",
      retryable: true,
    } satisfies Partial<PersonalBriefingGenerationError>);

    await expect(
      createPersonalBriefingGenerator({
        search: search([]),
        agent: agent(validContent),
      }).generate("主题", new Date(), "task-1"),
    ).rejects.toMatchObject({
      code: "BRIEFING_NO_SOURCES",
      retryable: false,
    } satisfies Partial<PersonalBriefingGenerationError>);
  });

  it("rejects invented citations and malformed briefing sections", async () => {
    const unknownCitation = validContent.replaceAll("[S1]", "[S9]");
    await expect(
      createPersonalBriefingGenerator({
        search: search(),
        agent: agent(unknownCitation),
      }).generate("主题", new Date(), "task-1"),
    ).rejects.toMatchObject({ code: "BRIEFING_OUTPUT_INVALID" });

    await expect(
      createPersonalBriefingGenerator({
        search: search(),
        agent: agent(validContent.replace("## 为什么值得关注", "## 给你的思考问题")),
      }).generate("主题", new Date(), "task-1"),
    ).rejects.toMatchObject({ code: "BRIEFING_OUTPUT_INVALID" });

    await expect(
      createPersonalBriefingGenerator({
        search: search(),
        agent: agent(
          [validContent, "## 延伸阅读", "额外章节"].join("\n\n"),
        ),
      }).generate("主题", new Date(), "task-1"),
    ).rejects.toMatchObject({ code: "BRIEFING_OUTPUT_INVALID" });
  });

  it("clusters repeated events across runs and skips a fully repeated search", async () => {
    const previous = briefingSourceSignal(sources[0]);
    const history = {
      listRecentBriefingSignals: vi.fn().mockResolvedValue([
        { ...previous, feedback: null },
      ]),
    };
    const generator = createPersonalBriefingGenerator({
      search: search(),
      agent: agent(validContent),
      history,
    });

    const result = await generator.generate(
      "主题",
      new Date("2026-09-26T01:00:00.000Z"),
      "task-1",
    );

    expect(history.listRecentBriefingSignals).toHaveBeenCalledWith(
      "task-1",
      new Date("2026-08-27T01:00:00.000Z"),
    );
    expect(result.sources).toEqual([briefingSourceSignal(sources[1])]);
    expect(result.content).not.toContain(sources[0].url);

    await expect(
      createPersonalBriefingGenerator({
        search: search([sources[0]]),
        agent: agent(validContent),
        history,
      }).generate("主题", new Date(), "task-1"),
    ).rejects.toMatchObject({
      code: "BRIEFING_NO_NOVEL_SOURCES",
      retryable: false,
    } satisfies Partial<PersonalBriefingGenerationError>);
  });

  it("uses stronger suppression after negative feedback", () => {
    const candidate = {
      ...sources[0],
      title: "OpenAI 正式发布 GPT-6 新模型",
      url: "https://another.example/new-model",
    };
    const previous = briefingSourceSignal({
      ...sources[0],
      title: "OpenAI 发布 GPT-6 模型",
    });

    expect(
      novelBriefingCitations([candidate], [
        { ...previous, feedback: "duplicate" },
      ]),
    ).toEqual([]);
  });
});
