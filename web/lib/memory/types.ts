/** Domain contracts; independent of SQL row inference and UI transport. */
export type MemoryCandidateKind = "preference" | "goal" | "profile" | "fact";
export type MemoryCandidateStatus = "pending" | "confirmed" | "rejected";
export type MemorySensitivity = "low" | "personal" | "sensitive";
export type MemoryRetrievalItem = {
  id: string; kind: MemoryCandidateKind; content: string; sensitivity: MemorySensitivity;
  pinned: boolean; validUntil: Date | null; version: number; updatedAt: Date;
};
