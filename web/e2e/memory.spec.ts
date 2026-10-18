import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("reviews, edits and confirms a memory candidate on mobile", async ({ page }) => {
  let memories: Array<{
    id: string;
    candidateId: string;
    sourceConversationId: string | null;
    sourceMessageId: string | null;
    kind: "goal";
    content: string;
    evidenceQuote: string;
    sensitivity: "low";
    pinned: boolean;
    validUntil: string | null;
    lastUsedAt: string | null;
    useCount: number;
    version: number;
    createdAt: string;
    updatedAt: string;
  }> = [];
  let candidate = {
    id: "00000000-0000-4000-8000-000000000011",
    sourceConversationId: "00000000-0000-4000-8000-000000000012",
    sourceMessageId: "00000000-0000-4000-8000-000000000013",
    kind: "goal",
    content: "我的长期目标是完成作品集",
    evidenceQuote: "请记住：我的长期目标是完成作品集",
    sensitivity: "low",
    confidence: 95,
    reason: "用户明确要求记住；仍需确认。",
    status: "pending",
    resolvedAt: null as string | null,
    version: 1,
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T10:00:00.000Z",
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/memory-candidates**", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      candidate = {
        ...candidate,
        content: input.content ?? candidate.content,
        status: input.action === "confirm" ? "confirmed" : "rejected",
        resolvedAt: "2026-09-27T10:01:00.000Z",
        version: candidate.version + 1,
        updatedAt: "2026-09-27T10:01:00.000Z",
      };
      if (input.action === "confirm") {
        memories = [
          {
            id: "00000000-0000-4000-8000-000000000021",
            candidateId: candidate.id,
            sourceConversationId: candidate.sourceConversationId,
            sourceMessageId: candidate.sourceMessageId,
            kind: "goal",
            content: candidate.content,
            evidenceQuote: candidate.evidenceQuote,
            sensitivity: "low",
            pinned: false,
            validUntil: null,
            lastUsedAt: null,
            useCount: 0,
            version: 1,
            createdAt: candidate.updatedAt,
            updatedAt: candidate.updatedAt,
          },
        ];
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: route.request().method() === "GET" ? [candidate] : candidate }),
    });
  });

  await page.route("**/api/v1/memories**", async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").at(-1);
    if (request.method() === "PATCH") {
      const input = request.postDataJSON();
      memories = memories.map((memory) =>
        memory.id === id
          ? {
              ...memory,
              content: input.content,
              kind: input.kind,
              pinned: input.pinned,
              validUntil: input.validUntil,
              version: memory.version + 1,
              updatedAt: "2026-09-27T10:02:00.000Z",
            }
          : memory,
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: memories.find((memory) => memory.id === id) }),
      });
    }
    if (request.method() === "DELETE") {
      memories = memories.filter((memory) => memory.id !== id);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { deleted: true } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: memories }),
    });
  });

  await page.goto("/memory?view=candidates");
  await expect(page.getByRole("heading", { name: "记忆先确认，再生效" })).toBeVisible();
  await expect(page.getByText("原始证据：")).toBeVisible();
  const editor = page.getByLabel(/编辑候选/);
  await editor.fill("我的长期目标是完成并公开展示作品集");
  await page.getByRole("button", { name: "确认记住" }).click();

  await expect(page.getByText("已确认", { exact: true })).toBeVisible();
  await expect(page.getByText("等待你确认")).toBeVisible();
  await page.getByRole("navigation", { name: "个人数据子页" }).getByRole("link", { name: "长期记忆", exact: true }).click();

  const memoryEditor = page.getByLabel(/编辑记忆/);
  await expect(memoryEditor).toHaveValue("我的长期目标是完成并公开展示作品集");
  await memoryEditor.fill("我的长期目标是完成作品集并进行公开演示");
  await page.getByText("固定这条记忆").click();
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("下一次相关问题会立即使用新版本")).toBeVisible();
  await expect(page.getByText("已固定")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path!, "utf8"));
  expect(exported).toMatchObject({
    format: "ai-study-companion.memories",
    schemaVersion: 1,
    memories: [
      expect.objectContaining({
        content: "我的长期目标是完成作品集并进行公开演示",
        pinned: true,
      }),
    ],
  });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByText("后续回答不会再使用它")).toBeVisible();
});
