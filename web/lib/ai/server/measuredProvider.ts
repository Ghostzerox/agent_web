import { getDatabase } from "@/lib/db/client";
import { createModelUsageRepository } from "@/lib/repositories/modelUsageRepository";
import type { ModelProviderConfig } from "./modelConfig";
import { OpenAICompatibleProvider } from "./modelProvider";
import { currentModelOperation } from "./operationContext";

export function createMeasuredProvider(config: ModelProviderConfig) {
  const operationId = currentModelOperation();
  return new OpenAICompatibleProvider(config, async (call) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        createModelUsageRepository(getDatabase()).record({ ...call, ...(operationId ? { operationId } : {}) }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Usage persistence timed out.")), 2000); }),
      ]);
    } finally { clearTimeout(timeout); }
  });
}
