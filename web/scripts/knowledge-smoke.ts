// Opt-in local Docker smoke. Synthetic records only; always cleans up its own collection.
import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";

const base = "http://127.0.0.1:3000/api/v1/knowledge";
async function response(path: string, method = "GET", body?: unknown) {
  return fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
}
async function data<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const result = await response(path, method, body);
  if (!result.ok) throw new Error(`Knowledge smoke request failed: ${method} status ${result.status}`);
  return (await result.json()).data;
}
async function main() {
  let collectionId: string | null = null;
  try {
    const collection = await data<{ id: string }>("", "POST", { title: `R5.3 synthetic smoke ${randomUUID()}`, module: "professional", description: "Temporary synthetic test only" });
    collectionId = collection.id;
    const input = { title: "Synthetic chapter", sourceKey: "synthetic-chapter", format: "markdown", content: "# First\nSynthetic source A\n## Second\nSynthetic source B", sourceUrl: "https://example.test/reference", fileName: "synthetic.md" };
    const saved = await data<{ id: string; version: number }>(`/collections/${collectionId}/documents`, "POST", input);
    const first = await data<{ version: number; chunks: { content: string; startLine: number }[] }>(`/documents/${saved.id}`);
    assert.equal(first.version, 1); assert.equal(first.chunks.length, 2); assert.equal(first.chunks[1].startLine, 3);
    const search = () => data<{ hits: { documentId: string; version: number; startLine: number }[] }>("/search", "POST", { consumer: "professional", collectionIds: [collectionId], query: "Synthetic source A" });
    const retrieved = await search();
    assert(retrieved.hits.some((hit) => hit.documentId === saved.id && hit.version === 1 && hit.startLine === 2));
    const duplicate = await data<{ id: string; duplicate: boolean }>(`/collections/${collectionId}/documents`, "POST", input);
    assert.equal(duplicate.id, saved.id); assert.equal(duplicate.duplicate, true);
    assert.equal((await response(`/documents/${saved.id}`, "PATCH", { ...input, expectedVersion: 99 })).status, 409);
    await data(`/documents/${saved.id}`, "PATCH", { ...input, content: "# Corrected\nSynthetic updated evidence", expectedVersion: 1 });
    const current = await data<{ version: number; chunks: { content: string; documentVersion: number }[] }>(`/documents/${saved.id}`);
    assert.equal(current.version, 2); assert.equal(current.chunks.length, 1); assert.equal(current.chunks[0].documentVersion, 2); assert(!current.chunks[0].content.includes("source A"));
    assert.equal((await response(`/documents/${saved.id}?version=1`)).status, 404);
    assert.equal((await search()).hits.length, 0);
    await data(`/documents/${saved.id}`, "DELETE", { expectedVersion: 2 });
    assert.equal((await response(`/documents/${saved.id}`)).status, 404);
    assert.equal((await search()).hits.length, 0);
    console.log("Docker knowledge HTTP → Repository → PostgreSQL smoke passed: import, duplicate, scoped search/locator, conflict, replacement, obsolete version refusal, deletion. Zero model calls.");
  } finally {
    if (collectionId) {
      const rows = await data<{ id: string; version: number }[]>("");
      const own = rows.find((item) => item.id === collectionId);
      if (own) await data(`/collections/${collectionId}`, "DELETE", { expectedVersion: own.version });
      console.log("Removed the synthetic smoke collection; existing user collections were not modified.");
    }
  }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Knowledge smoke failed"); process.exitCode = 1; });
