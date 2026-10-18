import { expect, test } from "@playwright/test";
import { checkSpelling } from "@/lib/memorization/spelling";
import { summarizeMaterial, type MemorizationMaterial } from "../lib/memorization/domain";

test("previews material import, submits explicit spelling mode, and edits with an expected version", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = "11111111-1111-4111-8111-111111111111";
  let material: MemorizationMaterial | null = null; let version = 0; let writes = 0;
  await page.route("**/api/v1/memorization", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: material ? [summarizeMaterial(material)] : [] } });
    const input = route.request().postDataJSON(); writes++; version = 1;
    material = { schemaVersion: 1, id, title: input.title, sourceText: input.sourceText, units: [{ ...input.units[0], id: crypto.randomUUID(), reviewCount: 0, lastScore: null, nextReviewAt: null, weakPoints: [] }], attempts: [], createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z" };
    return route.fulfill({ status: 201, json: { data: { material, storageVersion: version } } });
  });
  await page.route(`**/api/v1/memorization/${id}/review`, async (route) => {
    const input = route.request().postDataJSON(); writes++;
    expect(input).toMatchObject({ mode: "verbatim", expectedVersion: 1, spellingOptions: { caseSensitive: true, ignorePunctuation: false, ignoreWhitespace: false } });
    const spelling = checkSpelling(material!.units[0].content, input.recitation, input.spellingOptions);
    version++;
    return route.fulfill({ json: { data: { material, storageVersion: version, evaluation: { score: spelling.score, localScore: spelling.score, source: "deterministic", feedback: "逐字检查，无模型调用。", missedPoints: [], model: null, spelling }, taskDraft: null, taskDraftUnavailable: true } } });
  });
  await page.route(`**/api/v1/memorization/${id}`, async (route) => {
    const input = route.request().postDataJSON(); writes++;
    expect(route.request().method()).toBe("PATCH"); expect(input.expectedVersion).toBe(2);
    expect(input.units[0].content).toBe("Hello, world");
    material = { ...material!, units: [{ ...material!.units[0], content: input.units[0].content }] }; version++;
    return route.fulfill({ json: { data: { material, storageVersion: version } } });
  });
  await page.route("**/api/v1/model/**", () => { throw new Error("Unexpected model request"); });
  await page.goto("/study/memorization");
  await page.getByText("从导出 JSON 预览导入", { exact: true }).click();
  await page.getByLabel("导入材料 JSON").fill(JSON.stringify({ format: "agent-web/memorization-v1", title: "English", sourceText: "Hello world", units: [{ cue: "问好", content: "Hello world" }] }));
  await page.getByRole("button", { name: "校验并预览，不保存" }).click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "确认单元并开始复习" }).click();
  await page.getByLabel("评价方式", { exact: true }).selectOption("verbatim");
  await page.getByLabel("请凭记忆复述").fill("hello world");
  await page.getByRole("button", { name: "提交复述并评分" }).click();
  await expect(page.getByText("逐字规则分", { exact: true })).toBeVisible();
  await expect(page.getByText("替换：原文位置 0–1「H」→「h」", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑材料（修改单元将重置该单元成绩）" }).click();
  await expect(page.getByRole("heading", { name: "编辑背书材料", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "目标原文", exact: true }).fill("Hello, world");
  await page.getByRole("button", { name: "确认单元并开始复习" }).click();
  await expect(page.getByText("回忆提示", { exact: true })).toBeVisible();
  expect(writes).toBe(3);
});
