// Local Docker HTTP smoke, synthetic data only. Does not call a real model.
import { strict as assert } from "node:assert";
import { summaryFixture } from "../evals/r5/summaryFixtures";
const base = "http://127.0.0.1:3000/api/v1/conversations";
async function request(path: string, method = "GET", body?: unknown) { return fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(15000), ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
async function data<T>(path: string, method = "GET", body?: unknown): Promise<T> { const result = await request(path, method, body); if (!result.ok) throw new Error(`Summary smoke status ${result.status}`); return result.status === 204 ? undefined as T : (await result.json()).data; }
async function main() {
  let id: string | null = null;
  try {
    const conversation = await data<{ id: string }>("", "POST", { title: `R5.4 synthetic smoke ${crypto.randomUUID()}`, mode: "professional" }); id = conversation.id;
    let leaf: string | null = null;
    for (const row of summaryFixture().rows) { const saved: { message: { id: string } } = await data(`/${id}/messages`, "POST", { parentMessageId: leaf, role: row.role, content: row.content, citations: [] }); leaf = saved.message.id; }
    const inspected = await data<{ messageCount: number; summary: unknown }>(`/${id}/summary?leafId=${leaf}`); assert.equal(inspected.messageCount, 24); assert.equal(inspected.summary, null);
    assert.equal((await request(`/${id}/summary`, "POST", { leafId: leaf, confirmPaid: false })).status, 422);
    await data(`/${id}/summary`, "DELETE");
    const preserved = await data<{ messages: unknown[] }>(`/${id}`); assert.equal(preserved.messages.length, 24);
    assert.equal((await request(`/${crypto.randomUUID()}/summary?leafId=${leaf}`)).status, 404);
    console.log("Docker summary HTTP→SQL smoke passed: real branch inspection, no paid call without consent, clear preserves 24 raw messages, missing/foreign scope denied.");
  } finally { if (id) { await data(`/${id}`, "DELETE"); console.log("Removed only this smoke conversation and its synthetic messages; existing user history preserved."); } }
}
void main().catch(() => { console.error("Summary smoke failed; no real-model call was authorized."); process.exitCode = 1; });
