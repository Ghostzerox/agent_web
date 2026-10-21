import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";

const operation = new AsyncLocalStorage<string>();
export const currentModelOperation = () => operation.getStore();
/** Correlation only, never identity, permissions or supplier billing idempotency. */
export function withModelOperation<T>(request: Request, work: () => T): T {
  const id = z.uuid().safeParse(request.headers.get("x-model-operation-id"));
  return id.success ? operation.run(id.data, work) : work();
}
