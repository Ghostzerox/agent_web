import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { PromptExportFormat } from "@/lib/ai/promptExport";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";
import { requestJson } from "@/lib/api/jsonRequest";

export async function exportPromptEnvelope(
  envelope: PromptEnvelope,
  format: PromptExportFormat,
  includeMemory: boolean,
): Promise<PromptExportArtifact> {
  return requestJson("/api/v1/model/prompt-export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ envelope, format, includeMemory }),
  }, { fallbackMessage: (status) => `Prompt 导出失败：${status}` });
}
