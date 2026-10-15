import { MEMORY_RETRIEVAL_LIMIT, MEMORY_TOKEN_BUDGET } from "./memoryRetrieval";
import type { MemoryCandidateKind } from "@/lib/db/schema";

export const MEMORY_DOMAIN_POLICY_VERSION = "memory-domain/r5.1-v1";
export const MEMORY_MODULE_IDS = ["professional", "companion", "reflection", "news", "reading", "tasks", "inbox", "memorization", "problem-solving", "game", "memory", "voice", "plugins", "configuration", "navigation", "maintenance"] as const;
export type MemoryModuleId = typeof MEMORY_MODULE_IDS[number];

type Budget = { maxItems: number; maxEstimatedTokens: number };
export type MemoryDomainPolicy = {
  personal: Budget & { kinds: readonly MemoryCandidateKind[]; sensitive: boolean };
  /** Additional future retrieval context, not the existing chat/game history budget. */
  knowledge: Budget;
  collectionModules: readonly MemoryModuleId[];
  moduleNamespaces: readonly MemoryModuleId[];
  branch: "conversation" | "game" | "none";
  personalWrite: "candidate-and-user-confirmation" | "user-management-only" | "none";
  ownWrite: string;
};
const none: Budget = { maxItems: 0, maxEstimatedTokens: 0 };
const confirmed = { maxItems: MEMORY_RETRIEVAL_LIMIT, maxEstimatedTokens: MEMORY_TOKEN_BUDGET, kinds: ["preference", "goal", "profile", "fact"] as const, sensitive: true };
const noPersonal = { ...none, kinds: [] as const, sensitive: false };
const base: MemoryDomainPolicy = { personal: noPersonal, knowledge: none, collectionModules: [], moduleNamespaces: [], branch: "none", personalWrite: "none", ownWrite: "existing owner-scoped service only; never generic memory writes" };

/** Policy/specification, not new grants or evidence that planned retrieval is implemented. */
export const MEMORY_DOMAIN_POLICIES: Readonly<Record<MemoryModuleId, MemoryDomainPolicy>> = {
  professional: { ...base, personal: confirmed, knowledge: { maxItems: 6, maxEstimatedTokens: 1800 }, collectionModules: ["professional"], branch: "conversation", personalWrite: "candidate-and-user-confirmation" },
  companion: { ...base, personal: confirmed, branch: "conversation", personalWrite: "candidate-and-user-confirmation" },
  reflection: { ...base, personal: confirmed, knowledge: { maxItems: 3, maxEstimatedTokens: 900 }, collectionModules: ["reflection"], moduleNamespaces: ["reflection"], branch: "conversation", personalWrite: "candidate-and-user-confirmation" },
  news: { ...base, knowledge: { maxItems: 6, maxEstimatedTokens: 1800 }, collectionModules: ["news"], moduleNamespaces: ["news"] },
  reading: { ...base, knowledge: { maxItems: 5, maxEstimatedTokens: 1500 }, collectionModules: ["reading"], moduleNamespaces: ["reading"] },
  tasks: { ...base, knowledge: { maxItems: 3, maxEstimatedTokens: 900 }, collectionModules: ["tasks"], moduleNamespaces: ["tasks"] },
  inbox: { ...base, moduleNamespaces: ["inbox"] },
  memorization: { ...base, knowledge: { maxItems: 4, maxEstimatedTokens: 1200 }, collectionModules: ["memorization"], moduleNamespaces: ["memorization"], ownWrite: "study.memorization through granted Gateway storage; task drafts require user confirmation" },
  "problem-solving": { ...base, knowledge: { maxItems: 4, maxEstimatedTokens: 1200 }, collectionModules: ["problem-solving"], moduleNamespaces: ["problem-solving"], ownWrite: "study.problem-solving through granted Gateway storage; no ability diagnosis becomes personal fact" },
  game: { ...base, knowledge: { maxItems: 4, maxEstimatedTokens: 1200 }, collectionModules: ["game"], branch: "game", ownWrite: "GameSession branch/version transaction; fictional state never promoted to personal facts" },
  memory: { ...base, personalWrite: "user-management-only", ownWrite: "existing candidate confirmation/edit/delete and Persona services; retrieval permission is not management permission" },
  voice: { ...base, moduleNamespaces: ["voice"], ownWrite: "voice preferences only; speak already-selected text, no independent private retrieval" },
  plugins: { ...base, ownWrite: "existing Plugin API v1 capabilities only; this policy does not add a private-memory capability" },
  configuration: { ...base, ownWrite: "existing credentials/configuration/export services; keys excluded from retrieval" },
  navigation: { ...base, ownWrite: "UI navigation only; not a memory writer" },
  maintenance: { ...base, ownWrite: "explicitly confirmed owner-scoped maintenance; preview is not restore authority" },
};

export function memoryModuleForConversationMode(mode: string): MemoryModuleId | null {
  switch (mode) {
    case "auto": case "professional": return "professional";
    case "companion": return "companion";
    case "reflection": return "reflection";
    case "entertainment": return "game";
    default: return null;
  }
}

export function mayProposePersonalMemory(mode: string): boolean {
  const consumer = memoryModuleForConversationMode(mode);
  return consumer !== null && MEMORY_DOMAIN_POLICIES[consumer].personalWrite === "candidate-and-user-confirmation";
}
