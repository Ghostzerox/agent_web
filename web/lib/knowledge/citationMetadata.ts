import { z } from "zod";

export const knowledgeCitationMetadataSchema = z.object({
  collectionId: z.uuid(), documentId: z.uuid(), chunkId: z.uuid(),
  version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
}).strict().refine((value) => value.endLine >= value.startLine);
export type KnowledgeCitationMetadata = z.infer<typeof knowledgeCitationMetadataSchema>;
