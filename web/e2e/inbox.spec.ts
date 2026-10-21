import { expect, test } from "@playwright/test";

test("renders and manages Agent task results on mobile", async ({ page }) => {
  type MockInboxItem = {
    id: string;
    taskId: string;
    taskRunId: string;
    source:
      | "reminder"
      | "agent_prompt"
      | "personal_briefing"
      | "book_recommendation"
      | "reflection_question";
    title: string;
    body: string;
    briefingSources: unknown[] | null;
    reflectionQuestions: unknown[] | null;
    feedback: "helpful" | "not_relevant" | "duplicate" | null;
    occurredAt: string;
    status: "unread" | "read";
    readAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  let items: MockInboxItem[] = [
    {
      id: "item-1",
      taskId: "task-1",
      taskRunId: "run-1",
      source: "agent_prompt",
      title: "复习今日错题",
      body: "## AI 复习建议\n\n先回顾三道典型题",
      briefingSources: null,
      reflectionQuestions: null,
      feedback: null,
      occurredAt: "2026-09-10T12:30:00.000Z",
      status: "unread",
      readAt: null,
      createdAt: "2026-09-10T12:30:00.000Z",
      updatedAt: "2026-09-10T12:30:00.000Z",
    },
  ];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/inbox**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split("/").at(-1);
    const respond = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });

    if (request.method() === "PATCH") {
      const input = request.postDataJSON() as
        | { status: "unread" | "read" }
        | { feedback: MockInboxItem["feedback"] };
      items = items.map((item) =>
        item.id === id
          ? "status" in input
            ? {
                ...item,
                status: input.status,
                readAt:
                  input.status === "read" ? new Date().toISOString() : null,
              }
            : { ...item, feedback: input.feedback }
          : item,
      );
      return respond(items.find((item) => item.id === id));
    }
    if (request.method() === "DELETE") {
      items = items.filter((item) => item.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }

    const filter = url.searchParams.get("filter");
    return respond(
      filter && filter !== "all"
        ? items.filter((item) => item.status === filter)
        : items,
    );
  });

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "复习今日错题" })).toBeVisible();
  await expect(page.getByText("AI 定时任务", { exact: true })).toBeVisible();
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "复习今日错题", exact: true }) }).getByText("阅读正文", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI 复习建议" })).toBeVisible();
  await expect(page.getByText("先回顾三道典型题")).toBeVisible();

  await page.getByRole("button", { name: "标为已读" }).click();
  await expect(page.getByRole("button", { name: "标为未读" })).toBeVisible();

  await page.getByRole("button", { name: "未读", exact: true }).click();
  await expect(page.getByText("这里暂时没有提醒")).toBeVisible();

  await page.getByRole("button", { name: "已读", exact: true }).click();
  await expect(page.getByRole("heading", { name: "复习今日错题" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除" }).click(); await page.getByRole("dialog", { name: "删除这条消息？" }).getByRole("button", { name: "删除消息", exact: true }).click();
  await expect(page.getByText("这里暂时没有提醒")).toBeVisible();

  items = [
    {
      id: "item-2",
      taskId: "task-2",
      taskRunId: "run-2",
      source: "personal_briefing",
      title: "每日科技简报",
      body: "## 今日重点\n\n新政策已经发布。[S1]",
      briefingSources: [],
      reflectionQuestions: [
        {
          question: "这项政策会怎样改变你下周验证信息的方式？",
          type: "action",
          why: "形成下一步。",
          scores: { relevance: 5, novelty: 4, actionability: 5, emotionalLoad: 1, total: 4.7 },
          candidateCount: 4,
        },
      ],
      feedback: null,
      occurredAt: "2026-09-11T00:00:00.000Z",
      status: "read",
      readAt: "2026-09-11T00:00:00.000Z",
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
  ];
  await page.getByRole("button", { name: "刷新" }).click();
  await expect(page.getByRole("heading", { name: "每日科技简报" })).toBeVisible();
  await page.getByRole("button", { name: "内容重复" }).click();
  await expect(page.getByRole("button", { name: "内容重复" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("link", { name: "调整主题与频率" })).toHaveAttribute(
    "href",
    "/tasks?task=task-2&edit=1",
  );
  await expect(page.getByText("问题质量诊断")).toBeVisible();
  await expect(page.getByText("从 4 个候选中筛选")).toBeVisible();
});
