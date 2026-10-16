// Explicit local Docker smoke. Synthetic records only, no model or plugin grant changes.
import { strict as assert } from "node:assert";
import type { PalaceView } from "../lib/memory/palace";
const base = "http://127.0.0.1:3000/api/v1";
async function response(path: string, method = "GET", body?: unknown) { return fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }); }
async function data<T>(path: string, method = "GET", body?: unknown): Promise<T> { const result = await response(path, method, body); if (!result.ok) throw new Error(`Palace smoke ${method} status ${result.status}`); return (await result.json()).data; }
async function main() {
  let collectionId: string | null = null; let palaceId: string | null = null;
  try {
    const collection = await data<{ id: string }>("/knowledge", "POST", { title: `R5.5 synthetic ${crypto.randomUUID()}`, module: "professional", description: "Temporary synthetic source only" }); collectionId = collection.id;
    const input = { title: "Synthetic source", sourceKey: "synthetic", format: "text", content: "Synthetic reference A", sourceUrl: "", fileName: "" };
    const doc = await data<{ id: string }>(`/knowledge/collections/${collectionId}/documents`, "POST", input);
    let palace = await data<PalaceView>("/memory-palaces", "POST", { title: `R5.5 synthetic ${crypto.randomUUID()}`, purpose: "navigation" }); palaceId = palace.id;
    palace = await data(`/memory-palaces/${palaceId}`, "PATCH", { operation: "add-room", expectedVersion: palace.version, title: "Synthetic room", module: "professional" });
    palace = await data(`/memory-palaces/${palaceId}`, "PATCH", { operation: "add-locus", expectedVersion: palace.version, roomId: palace.rooms[0].id, label: "Desk", association: "User-written association", source: { kind: "knowledge", id: doc.id } });
    const locusId = palace.rooms[0].loci[0].id;
    const source = () => data<{ status: string; text?: string }>(`/memory-palaces/${palaceId}/loci/${locusId}`);
    assert.equal((await source()).text, input.content);
    assert.equal((await response(`/memory-palaces/${palaceId}`, "PATCH", { operation: "rename", expectedVersion: 1, title: "stale" })).status, 409);
    assert.equal((await response(`/memory-palaces/${palaceId}`, "PATCH", { operation: "add-locus", expectedVersion: palace.version, roomId: palace.rooms[0].id, label: "Duplicate", association: "", source: { kind: "knowledge", id: doc.id } })).status, 409);
    await data(`/knowledge/documents/${doc.id}`, "PATCH", { ...input, content: "Synthetic corrected B", expectedVersion: 1 });
    assert.deepEqual(await source(), { status: "changed" });
    palace = await data(`/memory-palaces/${palaceId}`, "PATCH", { operation: "rebind", locusId, source: { kind: "knowledge", id: doc.id }, expectedVersion: palace.version });
    assert.equal((await source()).text, "Synthetic corrected B");
    await data(`/memory-palaces/${palaceId}`, "DELETE", { expectedVersion: palace.version }); palaceId = null;
    assert.equal((await data<{ content: string }>(`/knowledge/documents/${doc.id}`)).content, "Synthetic corrected B");
    console.log("Docker palace HTTP→SQL smoke passed: source binding, CAS, duplicate refusal, correction, explicit rebind and layout-only deletion. Zero model calls.");
  } finally {
    if (palaceId) { const p = await data<PalaceView>(`/memory-palaces/${palaceId}`); await data(`/memory-palaces/${palaceId}`, "DELETE", { expectedVersion: p.version }); }
    if (collectionId) { const rows = await data<{ id: string; version: number }[]>("/knowledge"); const own = rows.find((r) => r.id === collectionId); if (own) await data(`/knowledge/collections/${collectionId}`, "DELETE", { expectedVersion: own.version }); }
    console.log("Removed only this run's synthetic palace and source collection; existing user data unchanged.");
  }
}
void main().catch(() => { console.error("Palace smoke failed; no model call was made. Check synthetic cleanup before retrying."); process.exitCode = 1; });
