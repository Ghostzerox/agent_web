import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import {
  createModelCredentialRepository,
  type ModelCredentialRepositoryPort,
} from "@/lib/repositories/modelCredentialRepository";

describe("ModelCredentialRepository", () => {
  let pglite: PGlite;
  let repository: ModelCredentialRepositoryPort;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(
      createPgliteMigrationDatabase(pglite),
      await loadMigrations(),
    );
    repository = createModelCredentialRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("stores one encrypted provider credential and updates it in place", async () => {
    const created = await repository.save({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash-vision-exp",
      encryptedApiKey: "v1.encrypted-first",
      apiKeyHint: "••••1234",
      encryptionKeyVersion: 1,
    });
    const updated = await repository.save({
      provider: "custom-deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      encryptedApiKey: "v1.encrypted-second",
      apiKeyHint: "••••5678",
      encryptionKeyVersion: 1,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.version).toBe(2);
    await expect(repository.get()).resolves.toMatchObject({
      provider: "custom-deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      encryptedApiKey: "v1.encrypted-second",
      apiKeyHint: "••••5678",
    });

    const rows = await pglite.query<{
      count: number;
      plaintext_count: number;
      provider: string;
      base_url: string;
      model: string;
    }>(
      `SELECT count(*)::int AS count,
              count(*) FILTER (WHERE encrypted_api_key LIKE '%private%')::int AS plaintext_count,
              max(provider) AS provider,
              max(base_url) AS base_url,
              max(model) AS model
       FROM model_credentials`,
    );
    expect(rows.rows[0]).toEqual({
      count: 1,
      plaintext_count: 0,
      provider: "custom-deepseek",
      base_url: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
  });

  it("deletes only the local user's active provider credential", async () => {
    await repository.save({
      provider: "provider",
      baseUrl: "https://provider.example",
      model: "model",
      encryptedApiKey: "v1.encrypted",
      apiKeyHint: "••••last",
      encryptionKeyVersion: 1,
    });

    await expect(repository.delete()).resolves.toBe(true);
    await expect(repository.get()).resolves.toBeNull();
    await expect(repository.delete()).resolves.toBe(false);
  });
});
