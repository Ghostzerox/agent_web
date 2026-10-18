import { afterEach, expect, it, vi } from "vitest";
import { streamSessionReply } from "@/lib/ai/sessionReply";
import { sendChatMessage } from "@/lib/ai/chatService";
import type { Session } from "@/lib/conversation/session";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

vi.mock("@/lib/ai/chatService", () => ({ sendChatMessage: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const session: Session = { id: "session", title: "分支", schemaVersion: 2, updatedAt: 1, activeLeafId: "user",
  messages: [{ id: "user", parentId: null, role: "user", content: "当前问题" }, { id: "hidden", parentId: "user", role: "assistant", content: "不属于所选路径" }] };
const options = () => ({ session, trigger: "retry" as const, searchMode: "off" as const,
  knowledgeCollectionIds: ["collection"], useSummary: true, signal: new AbortController().signal,
  onDelta: vi.fn(), onEnvelope: vi.fn() });

it("shares send/retry assembly, stable provisional identity and final citations without persisting a reply", async () => {
  const envelope = await createTestPromptEnvelope();
  const citations = [{ title: "合成来源", url: "https://example.test" }];
  vi.mocked(sendChatMessage).mockImplementation(async (_prompt, _context, _signal, onDelta, onEnvelope, onCitations) => {
    onDelta?.("回", "回"); onDelta?.("答", "回答"); onEnvelope?.(envelope); onCitations?.(citations);
    return "回答";
  });
  const input = options();
  await expect(streamSessionReply(input)).resolves.toEqual({ reply: "回答", citations, verification: null });
  expect(sendChatMessage).toHaveBeenCalledOnce();
  const [prompt, context, signal] = vi.mocked(sendChatMessage).mock.calls[0];
  expect(prompt.filter((message) => message.kind === "conversation").map((message) => message.content)).toEqual(["当前问题"]);
  expect(context).toMatchObject({ trigger: "retry", conversation: { activeLeafId: "user" }, knowledgeCollectionIds: ["collection"], useSummary: true, searchMode: "off" });
  expect(signal).toBe(input.signal);
  expect(input.onDelta.mock.calls.map(([text]) => text)).toEqual(["回", "回答"]);
  expect(input.onDelta.mock.calls[0][1]).toBe(input.onDelta.mock.calls[1][1]);
  expect(input.onEnvelope).toHaveBeenCalledWith(envelope);
});

it("does not start an already cancelled generation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(streamSessionReply({ ...options(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(sendChatMessage).not.toHaveBeenCalled();
});

it("rejects cancellation even if the underlying transport returns a late answer", async () => {
  const controller = new AbortController();
  vi.mocked(sendChatMessage).mockImplementation(async () => { controller.abort(); return "不应保存的晚到回答"; });
  await expect(streamSessionReply({ ...options(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(sendChatMessage).toHaveBeenCalledOnce();
});
