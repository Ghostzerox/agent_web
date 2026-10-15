import { extractMemoryCandidate } from "@/lib/memory/candidateExtractor";
import { mayProposePersonalMemory } from "./domainPolicy";
import type {
  CandidateProposal,
  MemoryCandidateRepositoryPort,
} from "@/lib/repositories/memoryCandidateRepository";

export type ProposeMemoryCandidateResult = CandidateProposal | {
  candidate: null;
  created: false;
};

export interface MemoryCandidateServicePort {
  proposeFromMessage(
    conversationId: string,
    messageId: string,
    now: Date,
  ): Promise<ProposeMemoryCandidateResult>;
}

export function createMemoryCandidateService(
  repository: MemoryCandidateRepositoryPort,
): MemoryCandidateServicePort {
  return {
    async proposeFromMessage(conversationId, messageId, now) {
      const source = await repository.getSourceMessage(conversationId, messageId);
      if (!mayProposePersonalMemory(source.mode)) {
        return { candidate: null, created: false };
      }
      const draft = extractMemoryCandidate(source.content);
      if (!draft) return { candidate: null, created: false };
      return repository.createCandidate(source, draft, now);
    },
  };
}
