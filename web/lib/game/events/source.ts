import type { WorldTemplate } from "../exploration/templateTypes";
export type EventContext = { locationId: string; tick: number; coins: number;
  inventory: { definitionId: string; quantity: number; owner: string }[]; issuedUniqueItems: string[];
  actors: { id: string; name: string; goals: string[]; relationship: string; relationshipReason: string }[];
  history: { text: string; kind: string; source: string }[] };
export type EventSnapshot = { template: WorldTemplate; context: EventContext };
export type EventGenerationState = { attempts: { id: string; fingerprint: string }[]; active: string | null; error: string | null };
