import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  isoToShanghaiLocal,
  scheduleFromTask,
  shanghaiLocalToIso,
} from "@/components/tasks/taskForm";
import { TaskManager } from "@/components/tasks/TaskManager";
import type { TaskRecord } from "@/lib/api/taskClient";

describe("task presentation", () => {
  it("renders the task form and loading state", () => {
    const html = renderToStaticMarkup(<TaskManager />);
    expect(html).toContain("安排一件事");
    expect(html).toContain("创建任务");
    expect(html).toContain("AI 定时任务");
    expect(html).toContain("个人简报");
    expect(html).toContain("书籍推荐");
    expect(html).toContain("思考问题");
    expect(html).toContain("正在读取任务");
    expect(html).toContain("Asia/Shanghai");
  });

  it("converts datetime-local values without depending on device timezone", () => {
    expect(shanghaiLocalToIso("2026-09-10T20:30")).toBe(
      "2026-09-10T12:30:00.000Z",
    );
    expect(isoToShanghaiLocal("2026-09-10T12:30:00.000Z")).toBe(
      "2026-09-10T20:30",
    );
    expect(() => shanghaiLocalToIso("not-a-date")).toThrow("有效");
  });

  it("reconstructs a typed schedule from a task response", () => {
    const task = {
      id: "task-1",
      title: "每周阅读",
      prompt: null,
      kind: "reminder",
      scheduleType: "weekly",
      scheduleValue: { weekday: 7, time: "09:00" },
      timezone: "Asia/Shanghai",
      nextRunAt: "2026-09-13T01:00:00.000Z",
      status: "active",
      version: 1,
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    } satisfies TaskRecord;
    expect(scheduleFromTask(task)).toEqual({
      type: "weekly",
      weekday: 7,
      time: "09:00",
    });
  });
});
