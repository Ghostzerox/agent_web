import type { ChatMessage } from "@/lib/ai/messages";
import type { Session } from "./session";

function createMessageId(): string {
  return crypto.randomUUID();
}

export function getActiveMessages(session: Session): ChatMessage[] {
  if (!session.activeLeafId) return [];

  const byId = new Map(
    session.messages.map((message) => [message.id!, message]),
  );
  const path: ChatMessage[] = [];
  const visited = new Set<string>();
  let current = byId.get(session.activeLeafId);

  while (current?.id && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path.reverse();
}

export function appendMessage(
  session: Session,
  message: ChatMessage,
): Session {
  const messageId =
    message.id && !session.messages.some((item) => item.id === message.id)
      ? message.id
      : createMessageId();
  const node: ChatMessage = {
    ...message,
    id: messageId,
    parentId: session.activeLeafId ?? null,
  };

  return {
    ...session,
    messages: [...session.messages, node],
    activeLeafId: messageId,
  };
}

export function checkoutSessionAt(
  session: Session,
  messageId: string | null,
): Session {
  if (
    messageId !== null &&
    !session.messages.some((message) => message.id === messageId)
  ) {
    return session;
  }
  return { ...session, activeLeafId: messageId };
}

export function appendAssistantBranch(
  session: Session,
  targetMessageId: string,
  reply: ChatMessage,
): Session {
  const target = session.messages.find(
    (message) => message.id === targetMessageId,
  );
  if (!target || target.role !== "assistant") return session;

  const replyId =
    reply.id && !session.messages.some((item) => item.id === reply.id)
      ? reply.id
      : createMessageId();
  const branch: ChatMessage = {
    ...reply,
    id: replyId,
    parentId: target.parentId ?? null,
    role: "assistant",
  };

  return {
    ...session,
    messages: [...session.messages, branch],
    activeLeafId: replyId,
  };
}

export function getAssistantSiblings(
  session: Session,
  messageId: string,
): ChatMessage[] {
  const target = session.messages.find((message) => message.id === messageId);
  if (!target || target.role !== "assistant") return [];
  const parentId = target.parentId ?? null;
  return session.messages.filter(
    (message) =>
      message.role === "assistant" && (message.parentId ?? null) === parentId,
  );
}

function findLatestLeafInSubtree(
  messages: ChatMessage[],
  rootMessageId: string,
): string {
  const children = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    if (!message.parentId) continue;
    const siblings = children.get(message.parentId) ?? [];
    siblings.push(message);
    children.set(message.parentId, siblings);
  }

  let latestLeafId = rootMessageId;
  let latestIndex = messages.findIndex((message) => message.id === rootMessageId);
  const stack = [rootMessageId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const currentChildren = children.get(currentId) ?? [];
    if (currentChildren.length === 0) {
      const index = messages.findIndex((message) => message.id === currentId);
      if (index >= latestIndex) {
        latestIndex = index;
        latestLeafId = currentId;
      }
      continue;
    }
    for (const child of currentChildren) {
      if (child.id) stack.push(child.id);
    }
  }

  return latestLeafId;
}

export function switchAssistantVersion(
  session: Session,
  messageId: string,
  direction: "prev" | "next",
): Session {
  const siblings = getAssistantSiblings(session, messageId);
  const currentIndex = siblings.findIndex((message) => message.id === messageId);
  if (currentIndex === -1 || siblings.length <= 1) return session;

  const nextIndex =
    direction === "next"
      ? Math.min(currentIndex + 1, siblings.length - 1)
      : Math.max(currentIndex - 1, 0);
  if (nextIndex === currentIndex || !siblings[nextIndex].id) return session;

  return {
    ...session,
    activeLeafId: findLatestLeafInSubtree(
      session.messages,
      siblings[nextIndex].id!,
    ),
  };
}
