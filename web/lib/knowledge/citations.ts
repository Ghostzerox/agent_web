import type { MessageCitation } from "@/lib/ai/messages";

import { knowledgeCitationMetadataSchema, type KnowledgeCitationMetadata } from "@/lib/knowledge/citationMetadata";
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
