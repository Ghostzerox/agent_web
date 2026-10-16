import { z } from "zod";
import type { MessageCitation } from "@/lib/ai/messages";

export const knowledgeCitationMetadataSchema = z.object({
  collectionId: z.uuid(), documentId: z.uuid(), chunkId: z.uuid(),
  version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
}).strict().refine((value) => value.endLine >= value.startLine);
export type KnowledgeCitationMetadata = z.infer<typeof knowledgeCitationMetadataSchema>;
export function knowledgeCitationUrl(value: Pick<KnowledgeCitationMetadata, "documentId" | "version" | "startLine">): string {
  return `/memory?document=${value.documentId}&version=${value.version}&line=${value.startLine}`;
}
export function isKnowledgeCitation(value: MessageCitation): boolean {
  const parsed = knowledgeCitationMetadataSchema.safeParse(value.knowledge);
  return parsed.success && value.url === knowledgeCitationUrl(parsed.data);
}
export function isLocalKnowledgeUrl(value: string): boolean {
  return /^\/memory\?document=[a-f0-9-]{36}&version=[1-9]\d*&line=[1-9]\d*$/u.test(value);
}
export function isSafeCitation(value: MessageCitation): boolean {
  if (isKnowledgeCitation(value)) return true;
  if (value.knowledge || value.url.startsWith("/")) return false;
  try { return ["http:", "https:"].includes(new URL(value.url).protocol); } catch { return false; }
}
