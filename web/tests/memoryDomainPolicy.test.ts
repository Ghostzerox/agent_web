import { describe, expect, it } from "vitest";
import { MEMORY_DOMAIN_POLICIES, MEMORY_DOMAIN_POLICY_VERSION, MEMORY_MODULE_IDS, mayProposePersonalMemory, memoryModuleForConversationMode } from "@/lib/memory/domainPolicy";
import { assessDerivedMemoryManifest, assessMemorySourceRead, assessMemorySourceRevision, memorySourceReferenceSchema, type MemoryReadContext, type MemorySourceReference } from "@/lib/memory/sourceReference";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const container = "33333333-3333-4333-8333-333333333333";
const node = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-10-16T00:00:00.000Z");
const context = (patch: Partial<MemoryReadContext> = {}): MemoryReadContext => ({ ownerId: owner, consumer: "professional", collections: [], datasets: [], conversation: null, game: null, ...patch });
const source = (patch: Partial<MemorySourceReference> = {}): MemorySourceReference => ({ ownerId: owner, sourceId: node, sourceKind: "memory-item", scope: { kind: "personal" }, revision: { version: 1, contentHash: null }, state: "active", sensitivity: "low", personalKind: "goal", validUntil: null, ...patch });
const manifest = (sources: MemorySourceReference[]) => ({ policyVersion: MEMORY_DOMAIN_POLICY_VERSION, strategyVersion: "fixture/v1", sources });

describe("R5.1 memory domain policy", () => {
  it.each(MEMORY_MODULE_IDS)("has explicit read/write budgets for %s without creating new grants", (consumer) => {
    const policy = MEMORY_DOMAIN_POLICIES[consumer];
    const allowed = ["professional", "companion", "reflection"].includes(consumer);
    expect(assessMemorySourceRead(context({ consumer }), source(), now).allowed).toBe(allowed);
    expect(policy.personal.maxItems).toBe(consumer === "professional" ? 5 : allowed ? 4 : 0);
    expect(policy.personal.maxEstimatedTokens).toBe(consumer === "professional" ? 500 : consumer === "companion" ? 400 : consumer === "reflection" ? 450 : 0);
    expect(policy.ownWrite.length).toBeGreaterThan(10);
    expect(policy.knowledge.maxItems === 0).toBe(policy.knowledge.maxEstimatedTokens === 0);
    expect(policy.moduleNamespaces.every((namespace) => namespace === consumer)).toBe(true);
  });

  it("resolves stored conversation modes fail-closed; only user confirmation promotes candidates", () => {
    for (const mode of ["auto", "professional", "companion", "reflection"]) expect(mayProposePersonalMemory(mode)).toBe(true);
    expect(memoryModuleForConversationMode("auto")).toBe("professional");
    expect(memoryModuleForConversationMode("entertainment")).toBe("game");
    expect(memoryModuleForConversationMode("new-unregistered-mode")).toBeNull();
    expect(mayProposePersonalMemory("entertainment")).toBe(false);
    expect(mayProposePersonalMemory("new-unregistered-mode")).toBe(false);
    expect(assessMemorySourceRead(context(), source({ sourceKind: "memory-candidate" }), now).allowed).toBe(false);
  });

  it("requires explicit same-module knowledge collection grants, not just a matching owner", () => {
    const document = source({ sourceKind: "knowledge-document", scope: { kind: "collection", module: "professional", collectionId: container }, personalKind: null });
    expect(assessMemorySourceRead(context(), document, now).allowed).toBe(false);
    const granted = context({ collections: [{ module: "professional", collectionId: container }] });
    expect(assessMemorySourceRead(granted, document, now).allowed).toBe(true);
    expect(assessMemorySourceRead({ ...granted, consumer: "game" }, document, now).allowed).toBe(false);
    expect(assessMemorySourceRead({ ...granted, collections: [{ module: "professional", collectionId: other }] }, document, now).allowed).toBe(false);
  });

  it("preserves dataset and plugin identity for learning records", () => {
    const record = source({ sourceKind: "module-record", scope: { kind: "module", module: "memorization", datasetId: "materials/v1", pluginId: "study.memorization" }, personalKind: null });
    const granted = context({ consumer: "memorization", datasets: [{ module: "memorization", datasetId: "materials/v1", pluginId: "study.memorization" }] });
    expect(assessMemorySourceRead(granted, record, now).allowed).toBe(true);
    for (const patch of [{ datasetId: "other" }, { pluginId: "study.problem-solving" }]) {
      expect(assessMemorySourceRead({ ...granted, datasets: [{ ...granted.datasets[0], ...patch }] }, record, now).allowed).toBe(false);
    }
    expect(assessMemorySourceRead({ ...granted, consumer: "problem-solving" }, record, now).allowed).toBe(false);
    expect(memorySourceReferenceSchema.safeParse({ ...record, scope: { ...record.scope, pluginId: "study.problem-solving" } }).success).toBe(false);
  });

  it.each(["conversation", "game"] as const)("only permits verified %s ancestors, never sibling branches/sessions", (kind) => {
    const record = source({ sourceKind: kind === "game" ? "game-turn" : "conversation-message", scope: kind === "game" ? { kind, sessionId: container, turnId: node } : { kind, conversationId: container, nodeId: node }, revision: { version: null, contentHash: "a".repeat(64) }, personalKind: null });
    const granted = kind === "game" ? context({ consumer: "game", game: { id: container, ancestorTurnIds: [node] } }) : context({ conversation: { id: container, ancestorNodeIds: [node] } });
    expect(assessMemorySourceRead(granted, record, now).allowed).toBe(true);
    const sibling = kind === "game" ? { ...granted, game: { id: container, ancestorTurnIds: [other] } } : { ...granted, conversation: { id: container, ancestorNodeIds: [other] } };
    const otherSession = kind === "game" ? { ...granted, game: { id: other, ancestorTurnIds: [node] } } : { ...granted, conversation: { id: other, ancestorNodeIds: [node] } };
    expect(assessMemorySourceRead(sibling, record, now).allowed).toBe(false);
    expect(assessMemorySourceRead(otherSession, record, now).allowed).toBe(false);
    expect(assessMemorySourceRead({ ...granted, ownerId: other }, record, now).reason).toBe("owner-mismatch");
    expect(memorySourceReferenceSchema.safeParse({ ...record, revision: { version: 1, contentHash: null } }).success).toBe(false);
  });

  it.each(["pending", "deleted", "superseded", "unavailable"] as const)("does not read %s sources", (state) => {
    expect(assessMemorySourceRead(context(), source({ state }), now).reason).toBe("source-inactive");
  });

  it("rejects expired, malformed, forged-domain and missing-version metadata", () => {
    expect(assessMemorySourceRead(context(), source({ validUntil: now.toISOString() }), now).reason).toBe("source-expired");
    expect(assessMemorySourceRead(context(), source(), new Date("invalid")).reason).toBe("invalid-metadata");
    for (const invalid of [null, {}, { ...source(), extra: true }, source({ revision: { version: null, contentHash: null } }), source({ revision: { version: 0, contentHash: null } }), source({ sourceKind: "game-turn" })]) {
      expect(assessMemorySourceRead(context(), invalid, now).reason).toBe("invalid-metadata");
    }
    expect(assessMemorySourceRead({ ...context(), consumer: "unknown" }, source(), now).reason).toBe("invalid-metadata");
    // Confirmed facts are independent of their old source conversation, not raw sibling messages.
    expect(assessMemorySourceRead(context({ conversation: { id: other, ancestorNodeIds: [] } }), source(), now).allowed).toBe(true);
  });

  it("invalidates stale versions, content hashes, deletions and ownership changes before reuse", () => {
    const ref = source();
    expect(assessMemorySourceRevision(context(), ref, ref, now).allowed).toBe(true);
    expect(assessMemorySourceRevision(context(), ref, null, now).reason).toBe("source-missing");
    expect(assessMemorySourceRevision(context(), ref, source({ revision: { version: 2, contentHash: null } }), now).reason).toBe("revision-mismatch");
    expect(assessMemorySourceRevision(context(), ref, source({ revision: { version: 1, contentHash: "a".repeat(64) } }), now).reason).toBe("revision-mismatch");
    expect(assessMemorySourceRevision(context(), ref, source({ state: "deleted" }), now).reason).toBe("source-inactive");
    expect(assessMemorySourceRevision(context(), ref, source({ ownerId: other }), now).reason).toBe("owner-mismatch");
    expect(assessMemorySourceRevision(context(), ref, { invalid: true }, now).reason).toBe("invalid-metadata");
  });

  it("requires authoritative, current, nonduplicated dependencies plus policy and strategy versions", () => {
    const ref = source(); const current = [ref]; const valid = manifest(current);
    const check = (value: unknown, live: unknown = current, strategy = "fixture/v1") => assessDerivedMemoryManifest(context(), value, live, strategy, now);
    expect(check(valid).allowed).toBe(true);
    expect(check({ ...valid, policyVersion: "old" }).reason).toBe("policy-mismatch");
    expect(check(valid, current, "new-summary-strategy").reason).toBe("strategy-mismatch");
    expect(check(valid, []).reason).toBe("source-missing");
    expect(check(valid, [source({ revision: { version: 2, contentHash: null } })]).reason).toBe("revision-mismatch");
    expect(check(valid, [source({ validUntil: now.toISOString() })]).reason).toBe("source-expired");
    expect(check(manifest([ref, ref])).reason).toBe("duplicate-source");
    expect(check(valid, [ref, ref]).reason).toBe("duplicate-source");
    expect(check(manifest([])).reason).toBe("invalid-metadata");
    expect(check(manifest([source({ sourceKind: "memory-candidate" })])).reason).toBe("invalid-metadata");
    const derived = source({ sourceKind: "knowledge-chunk", personalKind: null, scope: { kind: "collection", module: "professional", collectionId: container } });
    expect(check(manifest([derived])).reason).toBe("invalid-metadata");
    expect(check(valid, [null]).reason).toBe("invalid-metadata");
  });
});
