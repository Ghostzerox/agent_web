import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/conversation/session";
import {
  appendAssistantBranch,
  appendMessage,
  getActiveMessages,
  switchAssistantVersion,
} from "@/lib/conversation/tree";

const treeSession: Session = {
  id: "session-1",
  title: "分支测试",
  schemaVersion: 2,
  activeLeafId: "assistant-2",
  updatedAt: 1,
  messages: [
    { id: "user-1", parentId: null, role: "user", content: "问题一" },
    {
      id: "assistant-1",
      parentId: "user-1",
      role: "assistant",
      content: "回答一",
    },
    {
      id: "user-2",
      parentId: "assistant-1",
      role: "user",
      content: "问题二",
    },
    {
      id: "assistant-2",
      parentId: "user-2",
      role: "assistant",
      content: "回答二",
    },
  ],
};

describe("conversation tree", () => {
  it("regenerates an earlier answer as a sibling without deleting descendants", () => {
    const branched = appendAssistantBranch(treeSession, "assistant-1", {
      id: "assistant-1b",
      role: "assistant",
      content: "回答一的新版本",
    });

    expect(branched.messages).toHaveLength(5);
    expect(branched.messages.some((message) => message.id === "assistant-2")).toBe(
      true,
    );
    expect(getActiveMessages(branched).map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1b",
    ]);
  });

  it("restores a version's existing descendants when switching branches", () => {
    const branched = appendAssistantBranch(treeSession, "assistant-1", {
      id: "assistant-1b",
      role: "assistant",
      content: "回答一的新版本",
    });
    const previous = switchAssistantVersion(branched, "assistant-1b", "prev");

    expect(getActiveMessages(previous).map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);

    const next = switchAssistantVersion(previous, "assistant-1", "next");
    expect(getActiveMessages(next).map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1b",
    ]);
  });

  it("continues from the selected branch instead of the hidden old path", () => {
    const branched = appendAssistantBranch(treeSession, "assistant-1", {
      id: "assistant-1b",
      role: "assistant",
      content: "回答一的新版本",
    });
    const continued = appendMessage(branched, {
      id: "user-3",
      role: "user",
      content: "基于新回答追问",
    });

    expect(getActiveMessages(continued).map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1b",
      "user-3",
    ]);
    expect(continued.messages.some((message) => message.id === "assistant-2")).toBe(
      true,
    );
  });
});
