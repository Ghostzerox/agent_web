import { expect, test } from "@playwright/test";

test("manages an Agent task and creates a personal briefing on mobile", async ({
  page,
}) => {
  type MockTask = {
    id: string;
    title: string;
    prompt: string | null;
    kind:
      | "reminder"
      | "agent_prompt"
      | "personal_briefing"
      | "book_recommendation"
      | "reflection_question";
    scheduleType: "once" | "daily" | "weekly";
    scheduleValue: Record<string, string | number>;
    timezone: string;
    nextRunAt: string | null;
    status: "active" | "paused";
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  let tasks: MockTask[] = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/tasks**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.pathname.split("/").at(-1);
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });

    if (request.method() === "POST") {
      const input = request.postDataJSON();
      const task: MockTask = {
        id: "task-1",
        title: input.title,
        prompt: input.prompt,
        kind: input.kind,
        scheduleType: input.schedule.type,
        scheduleValue:
          input.schedule.type === "daily"
            ? { time: input.schedule.time }
            : input.schedule,
        timezone: "Asia/Shanghai",
        nextRunAt: "2030-01-01T12:00:00.000Z",
        status: "active",
        version: 1,
        createdAt: "2026-09-10T00:00:00.000Z",
        updatedAt: "2026-09-10T00:00:00.000Z",
      };
      tasks = [task];
      return respond(task, 201);
    }
    if (request.method() === "PATCH") {
      const input = request.postDataJSON();
      tasks = tasks.map((task) =>
        task.id === id
          ? {
              ...task,
              title: input.title,
              prompt: input.prompt,
              status: input.status,
              nextRunAt:
                input.status === "paused"
                  ? null
                  : "2030-01-01T12:00:00.000Z",
              version: task.version + 1,
            }
          : task,
      );
      return respond(tasks.find((task) => task.id === id));
    }
    if (request.method() === "DELETE") {
      tasks = tasks.filter((task) => task.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return respond(tasks);
  });

  await page.goto("/tasks");
  await page.getByRole("button", { name: "定时任务", exact: true }).click();
  await expect(page.getByText("还没有任务")).toBeVisible();

  await page.getByLabel("任务类型").selectOption("agent_prompt");
  await page.getByLabel("标题").fill("复习英语");
  await page.getByLabel("给 AI 的任务要求").fill("生成 20 个英语单词练习");
  await page.getByRole("button", { name: /20:00/ }).click();
  const timeDialog = page.getByRole("dialog", { name: "选择提醒时间" });
  const hourWheel = timeDialog.getByRole("listbox", { name: "时" });
  const minuteWheel = timeDialog.getByRole("listbox", { name: "分" });
  await hourWheel.focus();
  await hourWheel.press("Home");
  await hourWheel.press("ArrowUp");
  await expect(hourWheel.getByRole("option", { name: "23" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await minuteWheel.focus();
  await minuteWheel.press("End");
  await minuteWheel.press("ArrowDown");
  await expect(minuteWheel.getByRole("option", { name: "00" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await hourWheel.getByRole("option", { name: "08", exact: true }).click();
  await minuteWheel.getByRole("option", { name: "30", exact: true }).click();
  await timeDialog.getByRole("button", { name: "确定" }).click();
  await expect(page.getByRole("button", { name: /08:30/ })).toBeVisible();
  await page.getByRole("button", { name: "创建任务" }).click();
  await expect(page.getByRole("heading", { name: "复习英语" })).toBeVisible();
  await expect(page.getByText("AI 生成", { exact: true })).toBeVisible();
  await expect(page.getByText("每天 08:30")).toBeVisible();

  await page.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("标题").fill("复习英语单词");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(
    page.getByRole("heading", { name: "复习英语单词" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.getByText("已暂停", { exact: true }).first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("还没有任务")).toBeVisible();

  await page.getByLabel("任务类型").selectOption("personal_briefing");
  await page.getByLabel("标题").fill("每日科技简报");
  await page
    .getByLabel("关注主题或简报要求")
    .fill("国际人工智能政策与教育技术");
  await expect(page.getByText("到期后由服务端搜索并生成")).toBeVisible();
  await page.getByRole("button", { name: "创建任务" }).click();
  await expect(page.getByRole("heading", { name: "每日科技简报" })).toBeVisible();
  await expect(
    page.getByLabel("任务列表").getByText("个人简报", { exact: true }),
  ).toBeVisible();

  await page.goto("/tasks?task=task-1&edit=1");
  await expect(page.getByRole("heading", { name: "修改任务" })).toBeVisible();
  await expect(page.getByLabel("关注主题或简报要求")).toHaveValue(
    "国际人工智能政策与教育技术",
  );
  await expect(page.getByRole("button", { name: "保存修改" })).toBeVisible();
});
