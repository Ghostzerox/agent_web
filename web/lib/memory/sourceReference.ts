import { z } from "zod";
import { stableJson } from "@/lib/ai/stableJson";
import { MEMORY_DOMAIN_POLICIES, MEMORY_DOMAIN_POLICY_VERSION, MEMORY_MODULE_IDS } from "./domainPolicy";

const id = z.string().trim().min(1).max(120);
const moduleId = z.enum(MEMORY_MODULE_IDS);
export const memorySourceScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("personal") }).strict(),
  z.object({ kind: z.literal("collection"), module: moduleId, collectionId: z.uuid() }).strict(),
  z.object({ kind: z.literal("module"), module: moduleId, datasetId: id, pluginId: id.nullable() }).strict(),
  z.object({ kind: z.literal("conversation"), conversationId: z.uuid(), nodeId: z.uuid() }).strict(),
  z.object({ kind: z.literal("game"), sessionId: z.uuid(), turnId: z.uuid() }).strict(),
]);
export const memorySourceReferenceSchema = z.object({
  ownerId: z.uuid(), sourceId: id,
  sourceKind: z.enum(["memory-item", "memory-candidate", "knowledge-document", "knowledge-chunk", "conversation-message", "conversation-summary", "module-record", "game-turn"]),
  scope: memorySourceScopeSchema,
  revision: z.object({ version: z.number().int().positive().nullable(), contentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable() }).strict(),
  state: z.enum(["active", "pending", "deleted", "superseded", "unavailable"]),
  sensitivity: z.enum(["low", "personal", "sensitive"]),
  personalKind: z.enum(["preference", "goal", "profile", "fact"]).nullable(),
  validUntil: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((source, context) => {
  const requiredScope = ({ "memory-item": "personal", "memory-candidate": "personal", "knowledge-document": "collection", "knowledge-chunk": "collection", "conversation-message": "conversation", "conversation-summary": "conversation", "module-record": "module", "game-turn": "game" } as const)[source.sourceKind];
  if (source.scope.kind !== requiredScope) context.addIssue({ code: "custom", path: ["scope"], message: "Source kind and scope must agree." });
  if (source.revision.version === null && source.revision.contentHash === null) context.addIssue({ code: "custom", path: ["revision"], message: "A source revision is required." });
  if (["conversation-message", "game-turn"].includes(source.sourceKind) && source.revision.contentHash === null) context.addIssue({ code: "custom", path: ["revision"], message: "Unversioned branch records require a content hash." });
  if ((source.scope.kind === "personal") !== (source.personalKind !== null)) context.addIssue({ code: "custom", path: ["personalKind"], message: "Only personal records carry a personal fact kind." });
  if ((source.sourceKind === "conversation-message" && source.scope.kind === "conversation" && source.sourceId !== source.scope.nodeId) || (source.sourceKind === "game-turn" && source.scope.kind === "game" && source.sourceId !== source.scope.turnId)) context.addIssue({ code: "custom", path: ["sourceId"], message: "Branch source identity must match its node." });
  if (source.scope.kind === "module") {
    const expectedPlugin = source.scope.module === "memorization" ? "study.memorization" : source.scope.module === "problem-solving" ? "study.problem-solving" : null;
    if (expectedPlugin && source.scope.pluginId !== expectedPlugin) context.addIssue({ code: "custom", path: ["scope", "pluginId"], message: "Learning namespace must retain its owning plugin." });
  }
});
export type MemorySourceReference = z.infer<typeof memorySourceReferenceSchema>;

/** Trusted host metadata. These fields must be resolved server-side, never copied from an API payload. */
export const memoryReadContextSchema = z.object({
  ownerId: z.uuid(), consumer: moduleId,
  collections: z.array(z.object({ module: moduleId, collectionId: z.uuid() }).strict()).max(100),
  datasets: z.array(z.object({ module: moduleId, datasetId: id, pluginId: id.nullable() }).strict()).max(100),
  conversation: z.object({ id: z.uuid(), ancestorNodeIds: z.array(z.uuid()).max(500) }).strict().nullable(),
  game: z.object({ id: z.uuid(), ancestorTurnIds: z.array(z.uuid()).max(500) }).strict().nullable(),
}).strict();
export type MemoryReadContext = z.infer<typeof memoryReadContextSchema>;
type Decision = { allowed: true; reason: "allowed" } | { allowed: false; reason: "invalid-metadata" | "owner-mismatch" | "source-inactive" | "source-expired" | "scope-denied" | "source-missing" | "revision-mismatch" | "policy-mismatch" | "strategy-mismatch" | "duplicate-source" };
const deny = (reason: Extract<Decision, { allowed: false }>["reason"]): Decision => ({ allowed: false, reason });

/** Context eligibility only, NOT authorization for CRUD, external I/O, plugins or personal-fact promotion. */
export function assessMemorySourceRead(rawContext: unknown, rawSource: unknown, now: Date): Decision {
  const parsedContext = memoryReadContextSchema.safeParse(rawContext);
  const parsedSource = memorySourceReferenceSchema.safeParse(rawSource);
  if (!parsedContext.success || !parsedSource.success || !Number.isFinite(now.getTime())) return deny("invalid-metadata");
  const context = parsedContext.data; const source = parsedSource.data;
  if (source.ownerId !== context.ownerId) return deny("owner-mismatch");
  if (source.state !== "active") return deny("source-inactive");
  if (source.validUntil && new Date(source.validUntil) <= now) return deny("source-expired");
  const policy = MEMORY_DOMAIN_POLICIES[context.consumer];
  const scope = source.scope;
  let allowed = false;
  switch (scope.kind) {
    case "personal": allowed = source.sourceKind === "memory-item" && policy.personal.maxItems > 0 && policy.personal.kinds.includes(source.personalKind!) && (policy.personal.sensitive || source.sensitivity !== "sensitive"); break;
    case "collection": allowed = policy.knowledge.maxItems > 0 && policy.collectionModules.includes(scope.module) && context.collections.some((grant) => grant.module === scope.module && grant.collectionId === scope.collectionId); break;
    case "module": allowed = policy.moduleNamespaces.includes(scope.module) && context.datasets.some((grant) => grant.module === scope.module && grant.datasetId === scope.datasetId && grant.pluginId === scope.pluginId); break;
    case "conversation": allowed = policy.branch === "conversation" && context.conversation?.id === scope.conversationId && context.conversation.ancestorNodeIds.includes(scope.nodeId); break;
    case "game": allowed = policy.branch === "game" && context.game?.id === scope.sessionId && context.game.ancestorTurnIds.includes(scope.turnId); break;
  }
  return allowed ? { allowed: true, reason: "allowed" } : deny("scope-denied");
}

export function memorySourceIdentity(source: MemorySourceReference): string {
  return stableJson([source.ownerId, source.sourceKind, source.sourceId, source.scope]);
}

/** Live metadata must be loaded with owner/scope filters BEFORE fetching any candidate body. */
export function assessMemorySourceRevision(context: unknown, reference: unknown, live: unknown, now: Date): Decision {
  const access = assessMemorySourceRead(context, reference, now);
  if (!access.allowed) return access;
  if (live === null || live === undefined) return deny("source-missing");
  const parsedRef = memorySourceReferenceSchema.parse(reference);
  const parsedLive = memorySourceReferenceSchema.safeParse(live);
  if (!parsedLive.success) return deny("invalid-metadata");
  const liveAccess = assessMemorySourceRead(context, parsedLive.data, now);
  if (!liveAccess.allowed) return liveAccess;
  if (memorySourceIdentity(parsedRef) !== memorySourceIdentity(parsedLive.data) || stableJson(parsedRef.revision) !== stableJson(parsedLive.data.revision)) return deny("revision-mismatch");
  return { allowed: true, reason: "allowed" };
}

export const derivedMemoryManifestSchema = z.object({
  policyVersion: z.string().min(1).max(100), strategyVersion: z.string().min(1).max(100),
  sources: z.array(memorySourceReferenceSchema).min(1).max(100),
}).strict().refine((manifest) => manifest.sources.every((source) => !["knowledge-chunk", "conversation-summary", "memory-candidate"].includes(source.sourceKind)), "Use authoritative source dependencies, not derived-only references or candidates.");

/** R5.1 contract only: no summary, chunk, embedding or cache is generated/stored here. */
export function assessDerivedMemoryManifest(context: unknown, rawManifest: unknown, liveSources: unknown, expectedStrategyVersion: string, now: Date): Decision {
  const parsed = derivedMemoryManifestSchema.safeParse(rawManifest);
  const parsedLive = z.array(memorySourceReferenceSchema).max(100).safeParse(liveSources);
  if (!parsed.success || !parsedLive.success) return deny("invalid-metadata");
  const manifest = parsed.data;
  if (manifest.policyVersion !== MEMORY_DOMAIN_POLICY_VERSION) return deny("policy-mismatch");
  if (manifest.strategyVersion !== expectedStrategyVersion) return deny("strategy-mismatch");
  const current = new Map<string, MemorySourceReference>();
  for (const source of parsedLive.data) { const key = memorySourceIdentity(source); if (current.has(key)) return deny("duplicate-source"); current.set(key, source); }
  const seen = new Set<string>();
  for (const reference of manifest.sources) {
    const key = memorySourceIdentity(reference);
    if (seen.has(key)) return deny("duplicate-source");
    seen.add(key);
    const decision = assessMemorySourceRevision(context, reference, current.get(key), now);
    if (!decision.allowed) return decision;
  }
  return { allowed: true, reason: "allowed" };
}
