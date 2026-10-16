import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/db/schema";
import { loadMigrations, migrateDatabase, type MigrationSession, type MigrationRow } from "../lib/db/migrations";
import { retrievalCorpus, retrievalCases, evalUuid, EVAL_OWNER, EVAL_COLLECTION } from "../evals/r5/retrievalCorpus";
import { createKnowledgeRetrievalRepository } from "../lib/repositories/knowledgeRetrievalRepository";
// Ephemeral in-memory PostgreSQL/WASM only: never connects to production or reads user data.
async function main() {
  const pg = new PGlite();
  const session = (db: Pick<PGlite, "query">): MigrationSession => ({ execute: async (query, parameters = []) => (await db.query<MigrationRow>(query, [...parameters])).rows });
  try {
    await migrateDatabase({ ...session(pg), transaction: (callback) => pg.transaction((tx) => callback(session(tx))) }, await loadMigrations());
    const db = drizzle(pg, { schema }); const foreignOwner = evalUuid(999);
    await db.insert(schema.users).values([{ id: EVAL_OWNER }, { id: foreignOwner }]);
    await db.insert(schema.knowledgeCollections).values([{ id: EVAL_COLLECTION, userId: EVAL_OWNER, module: "professional", title: "Synthetic selected" }, { id: evalUuid(998), userId: EVAL_OWNER, module: "professional", title: "Synthetic unselected" }, { id: evalUuid(997), userId: EVAL_OWNER, module: "game", title: "Synthetic game" }, { id: evalUuid(996), userId: foreignOwner, module: "professional", title: "Synthetic foreign" }]);
    const rows = retrievalCorpus().filter((row) => row.rootVersion !== null && row.sourceKind === "knowledge-document").map((row) => ({ ...row, collectionId: row.ownerId === foreignOwner ? evalUuid(996) : row.module === "game" ? evalUuid(997) : row.collectionId }));
    const roots = [...new Map(rows.map((row) => [row.documentId, row])).values()];
    await db.insert(schema.knowledgeDocuments).values(roots.map((row) => ({ id: row.documentId, userId: row.ownerId, collectionId: row.collectionId, sourceKey: row.documentId, title: row.title, format: "text" as const, content: rows.filter((chunk) => chunk.documentId === row.documentId).map((chunk) => chunk.content).join("\n"), contentHash: row.contentHash, chunkStrategy: "synthetic", version: row.rootVersion! })));
    await db.insert(schema.knowledgeChunks).values(rows.map((row, ordinal) => ({ id: row.chunkId, documentId: row.documentId, documentVersion: row.version, content: row.content, contentHash: row.chunkHash, ordinal, startLine: row.startLine, endLine: row.endLine, heading: row.heading })));
    const repo = createKnowledgeRetrievalRepository(db); const measured: Array<{ id: string; ms: number; recall: number | null; falseHit: boolean }> = [];
    for (const item of retrievalCases()) {
      const result = await repo.search({ consumer: "professional", collectionIds: [EVAL_COLLECTION], query: item.query });
      measured.push({ id: item.id, ms: result.durationMs, recall: item.gold.length ? item.gold.filter((id) => result.hits.some((hit) => hit.chunkId === id)).length / item.gold.length : null, falseHit: !item.gold.length && result.hits.length > 0 });
    }
    const timed = measured.slice(1).map((item) => item.ms).sort((a, b) => a - b); const positive = measured.filter((item) => item.recall !== null);
    const summary = { engine: "PGlite PostgreSQL/WASM; not Docker/network latency", documents: roots.length, chunks: rows.length, logicalCorpusDocuments: 100, logicalCorpusChunks: 1000, firstQueryMs: measured[0].ms, p50Ms: timed[Math.ceil(timed.length * 0.5) - 1], p95Ms: timed[Math.ceil(timed.length * 0.95) - 1], recallAt5: positive.reduce((sum, item) => sum + item.recall!, 0) / positive.length, falseHits: measured.filter((item) => item.falseHit).length, modelCalls: 0, measurements: measured };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.recallAt5 < 0.85 || summary.falseHits > 0) process.exitCode = 1;
  } finally { await pg.close(); }
}
void main().catch(() => { console.error("Synthetic SQL benchmark failed; no production data was used."); process.exitCode = 1; });
