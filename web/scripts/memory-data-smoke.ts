// Explicit local integration and warm-query measurement. No model, no real preferences changed.
import { strict as assert } from "node:assert";
import { previewMemoryPackage, type MemoryManifest, type MemoryPackage } from "../lib/memory/archive";
const base = "http://127.0.0.1:3000/api/v1";
async function request(path: string, method = "GET", body?: unknown) { return fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(15000), ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }); }
async function data<T>(path: string, method = "GET", body?: unknown): Promise<T> { const result = await request(path, method, body); if (!result.ok) throw new Error(`Synthetic memory smoke ${method} status ${result.status}`); return (await result.json()).data; }
const percentile = (rows: number[], p: number) => [...rows].sort((a, b) => a - b)[Math.max(0, Math.ceil(rows.length * p) - 1)] ?? 0;
async function main() {
  let collectionId: string | null = null;
  try {
    const c = await data<{ id: string }>("/knowledge", "POST", { title: `R5.6 synthetic ${crypto.randomUUID()}`, module: "professional", description: "Temporary synthetic evaluation" }); collectionId = c.id;
    let firstId = "";
    for (let n = 0; n < 10; n++) {
      const doc = await data<{ id: string }>(`/knowledge/collections/${c.id}/documents`, "POST", { title: `Synthetic ${n}`, sourceKey: `item-${n}`, format: "markdown", content: Array.from({ length: 10 }, (_, section) => `# Section ${section}\n霜谷矩阵规范${n}要求按行列计算，编号${section}保持准确。`).join("\n"), sourceUrl: "", fileName: "" });
      if (!n) firstId = doc.id;
    }
    const times: number[] = []; const serverTimes: number[] = [];
    for (let n = 0; n < 26; n++) {
      const start = performance.now(); const result = await data<{ hits: { documentId: string; version: number; startLine: number; endLine: number }[]; durationMs: number }>("/knowledge/search", "POST", { consumer: "professional", collectionIds: [c.id], query: "霜谷矩阵规范0" });
      times.push(performance.now() - start); serverTimes.push(result.durationMs); assert(result.hits.length > 0); assert(result.hits.every((hit) => hit.version === 1 && hit.startLine > 0 && hit.endLine >= hit.startLine));
    }
    const rebuilt = await data<{ rebuilt: boolean }>(`/knowledge/documents/${firstId}/rebuild`, "POST", { expectedVersion: 1 }); assert.equal(rebuilt.rebuilt, false);
    const file = await data<MemoryPackage>("/memory-data/export", "POST", { memories: false, palaces: false, collectionIds: [c.id] });
    assert.equal(file.collections.length, 1); assert.equal(file.collections[0].documents.length, 10); assert.equal(file.memories.length, 0); assert.equal(file.controls, undefined);
    const manifest = await data<MemoryManifest>("/memory-data/manifest"); const preview = previewMemoryPackage(file, manifest); assert.equal(preview.writes, 0); assert(preview.documents.every((row) => row.state === "same-id-version"));
    assert.equal((await request("/memory-data/restore", "POST", file)).status, 405);
    console.log(JSON.stringify({ phase: "R5.6", measurement: "local-Docker-HTTP-plus-PostgreSQL; first-in-session-not-OS-or-DB-cold; 25-repeated-queries-not-provider-prompt-cache", documents: 10, chunks: 100, queries: 26,
      httpMs: { first: times[0], p50Warm: percentile(times.slice(1), 0.5), p95Warm: percentile(times.slice(1), 0.95) }, serverMs: { first: serverTimes[0], p50Warm: percentile(serverTimes.slice(1), 0.5), p95Warm: percentile(serverTimes.slice(1), 0.95) },
      modelCalls: 0, embeddingCalls: 0, modelCostCny: 0, exportDocuments: 10, previewWrites: 0, noOpRebuild: true }, null, 2));
  } finally { if (collectionId) { const rows = await data<{ id: string; version: number }[]>("/knowledge"); const own = rows.find((r) => r.id === collectionId); if (own) await data(`/knowledge/collections/${collectionId}`, "DELETE", { expectedVersion: own.version }); } console.log("Removed this run's synthetic collection only; existing documents and memory controls unchanged."); }
}
void main().catch(() => { console.error("R5.6 synthetic HTTP smoke failed; check its own cleanup before retrying. No model called."); process.exitCode = 1; });
