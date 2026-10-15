import { describe, expect, it, vi } from "vitest";
import type { ReadingProfileRecord } from "@/lib/db/schema";
import type { WebSearchProvider } from "@/lib/search/webSearch";
import type { AgentPromptGeneratorPort } from "@/lib/tasks/agentPromptGenerator";
import {
  BookRecommendationGenerationError,
  createBookRecommendationGenerator,
} from "@/lib/tasks/bookRecommendationGenerator";

const profile: ReadingProfileRecord = {
  userId: "00000000-0000-4000-8000-000000000001",
  topics: ["认知科学"],
  readBooks: ["思考，快与慢 — 丹尼尔·卡尼曼"],
  wantToReadBooks: [],
  dislikedBooks: ["空泛成功学"],
  difficulty: "intermediate",
  weeklyMinutes: 180,
  goal: "systematic",
  version: 1,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

const sources = [
  {
    id: "S1",
    title: "The Scout Mindset by Julia Galef",
    url: "https://books.example/scout(mindset)",
    snippet: "Book information and author biography.",
    source: "books.example",
    publishedAt: "2021-04-13T00:00:00.000Z",
    fetchedAt: "2026-09-27T00:00:00.000Z",
  },
  {
    id: "S2",
    title: "The Righteous Mind by Jonathan Haidt",
    url: "https://publisher.example/righteous",
    snippet: "Publisher description and table of contents.",
    source: "publisher.example",
    publishedAt: null,
    fetchedAt: "2026-09-27T00:00:00.000Z",
  },
];

const validContent = [
  "## 本次推荐",
  "### 《侦察兵思维》— 朱莉娅·加利夫",
  "帮助校准判断。[S1]",
  "### 《正义之心》— 乔纳森·海特",
  "帮助理解道德判断差异。[S2]",
  "## 为什么现在推荐",
  "两本书分别补充个体判断和群体视角。[S1][S2]",
  "## 阅读门槛与投入",
  "以每周 180 分钟分阶段阅读。",
  "## 试读与判断",
  "先查看目录和公开样章，再决定是否继续。",
].join("\n\n");

function search(results = sources): WebSearchProvider {
  return { search: vi.fn().mockResolvedValue(results) };
}

function agent(content = validContent): AgentPromptGeneratorPort {
  return { generate: vi.fn().mockResolvedValue({ content, model: "book-model" }) };
}

describe("book recommendation generator", () => {
  it("normalizes only known footnote markers and rejects unknown source ids", async () => {
    const generate = (content: string) => createBookRecommendationGenerator({ search: search(), agent: agent(content), profiles: { get: async () => profile } }).generate("主题", new Date("2026-10-16T00:00:00Z"));
    expect((await generate(validContent.replaceAll("[S1]", "[^S1]"))).content).not.toContain("[^S1]");
    await expect(generate(validContent.replaceAll("[S1]", "[^S99]"))).rejects.toMatchObject({ code: "BOOK_OUTPUT_INVALID" });
    await expect(generate(validContent.replaceAll("《正义之心》", "《侦察兵思维》"))).rejects.toMatchObject({ code: "BOOK_OUTPUT_INVALID" });
  });
  it("combines explicit reading preferences with cited bibliographic evidence", async () => {
    const searchProvider = search();
    const agentGenerator = agent();
    const generator = createBookRecommendationGenerator({
      search: searchProvider,
      agent: agentGenerator,
      profiles: { get: vi.fn().mockResolvedValue(profile) },
    });
    const result = await generator.generate(
      "批判性思维",
      new Date("2026-09-27T01:00:00.000Z"),
    );

    expect(searchProvider.search).toHaveBeenCalledWith(
      expect.stringContaining("批判性思维 认知科学 图书 作者 出版社"),
      undefined,
    );
    const prompt = vi.mocked(agentGenerator.generate).mock.calls[0][0];
    expect(prompt.match(/^## .+$/gmu)).toEqual(["## 本次推荐", "## 为什么现在推荐", "## 阅读门槛与投入", "## 试读与判断"]);
    expect(prompt).toContain("不同译名或版本不算不同的书");
    expect(prompt).toContain("估算");
    expect(prompt).toContain("思考，快与慢");
    expect(prompt).toContain("不得编造章节名");
    expect(prompt).toContain("不要输出原文长摘录");
    expect(result).toMatchObject({ model: "book-model", sourceCount: 2 });
    expect(result.content).toContain("## 书目信息来源");
    expect(result.content).toContain("https://books.example/scout%28mindset%29");
    expect(result.content).toContain("推荐目标：系统学习");
    expect(result.content).toContain("每周预算：180 分钟");
  });

  it("fails safely for missing evidence and malformed model output", async () => {
    await expect(
      createBookRecommendationGenerator({
        search: search([]),
        agent: agent(),
        profiles: { get: vi.fn().mockResolvedValue(profile) },
      }).generate("主题", new Date()),
    ).rejects.toMatchObject({
      code: "BOOK_NO_SOURCES",
      retryable: false,
    } satisfies Partial<BookRecommendationGenerationError>);

    await expect(
      createBookRecommendationGenerator({
        search: search(),
        agent: agent(validContent.replace("帮助理解道德判断差异。[S2]", "帮助理解差异。")),
        profiles: { get: vi.fn().mockResolvedValue(profile) },
      }).generate("主题", new Date()),
    ).rejects.toMatchObject({ code: "BOOK_OUTPUT_INVALID" });
  });
});
