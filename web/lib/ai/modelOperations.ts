export type ModelOperation = { id: string; scope: "chat" | "study" | "entertainment"; label: string; startedAt: number; finishedAt?: number; failed?: boolean };
let operations: readonly ModelOperation[] = [];
const listeners = new Set<() => void>();
const responses = new WeakMap<Response, string>();
const notify = () => { for (const listener of listeners) listener(); };
export const getModelOperations = () => operations;
export const subscribeModelOperations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function clearModelOperations() { operations = operations.filter((entry) => !entry.finishedAt); notify(); }

/** Only identifies potentially generative actions; no prompts or user text are retained. */
export function beginModelOperation(path: string, init?: RequestInit): ModelOperation | null {
  if (init?.method?.toUpperCase() !== "POST") return null;
  let descriptor: Pick<ModelOperation, "scope" | "label"> | null = null;
  if (path === "/api/v1/model/stream") descriptor = { scope: "chat", label: "对话生成" };
  else if (/^\/api\/v1\/conversations\/[^/]+\/summary$/u.test(path)) descriptor = { scope: "chat", label: "分支摘要" };
  else if (/^\/api\/v1\/game-(?:worlds|designs|draws|events)\/[^/]+\/generate$/u.test(path)) descriptor = { scope: "entertainment", label: "世界 / 设计生成" };
  else if (/^\/api\/v1\/game-sessions\/[^/]+\/turns$/u.test(path)) {
    try {
      const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
      if (!body.toolOnly && (body.narrate || body.explorationAction?.action === "encounter" || body.semanticInput?.some((part: { kind: string }) => !["private_thought", "ooc_instruction"].includes(part.kind)) || !body.explorationAction && !body.semanticInput)) descriptor = { scope: "entertainment", label: "人物 / 主持 / 相遇生成" };
    } catch { /* Invalid requests do not claim to have used a model. */ }
  } else if (/^\/api\/v1\/(?:memorization\/[^/]+\/review|problem-solving\/[^/]+\/(?:interactions|review-cards))$/u.test(path)) descriptor = { scope: "study", label: "学习辅助" };
  if (!descriptor) return null;
  const entry = { ...descriptor, id: crypto.randomUUID(), startedAt: Date.now() };
  operations = [...operations, entry].slice(-12); notify(); return entry;
}
export function finishModelOperation(id: string, failed = false) {
  operations = operations.map((entry) => entry.id === id && !entry.finishedAt ? { ...entry, finishedAt: Date.now(), failed } : entry); notify();
}
export function bindModelResponse(response: Response, id: string) { responses.set(response, id); }
export function finishModelResponse(response: Response, failed = false) { const id = responses.get(response); if (id) finishModelOperation(id, failed); }
