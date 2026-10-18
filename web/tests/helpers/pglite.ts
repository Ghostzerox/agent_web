import type { PGlite } from "@electric-sql/pglite";
import type { MigrationDatabase, MigrationRow, MigrationSession } from "@/lib/db/migrations";

// Only the adapter is shared: each test keeps its own database and migration range.
// In particular, migration/rollback tests must not be silently auto-migrated.
export function createPgliteMigrationDatabase(database: PGlite): MigrationDatabase {
  const session = (db: Pick<PGlite, "query">): MigrationSession => ({
    async execute(query, parameters = []) {
      return (await db.query<MigrationRow>(query, [...parameters])).rows;
    },
  });
  return {
    ...session(database),
    transaction: (callback) => database.transaction((tx) => callback(session(tx))),
  };
}
