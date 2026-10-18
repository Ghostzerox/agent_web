import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import { PluginRegistry } from "@/lib/plugins/pluginRegistry";
import { createPluginRepository } from "@/lib/repositories/pluginRepository";

describe("PluginRepository", () => {
  let pglite: PGlite;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("discovers, enables and disables first-party plugins with version fencing", async () => {
    const repository = createPluginRepository(
      drizzle(pglite, { schema }),
      new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS),
    );
    const initial = await repository.list();
    expect(initial).toHaveLength(3);
    expect(initial.every((plugin) =>
      !plugin.installation.enabled && plugin.installation.version === 0,
    )).toBe(true);

    const now = new Date("2026-09-28T05:00:00.000Z");
    const enabled = await repository.setEnabled({
      pluginId: "study.memorization",
      enabled: true,
      expectedVersion: 0,
      now,
    });
    expect(enabled.installation).toMatchObject({
      status: "enabled",
      enabled: true,
      installedVersion: "1.0.0",
      version: 1,
    });

    const disabled = await repository.setEnabled({
      pluginId: "study.memorization",
      enabled: false,
      expectedVersion: 1,
      now,
    });
    expect(disabled.installation).toMatchObject({
      status: "disabled",
      enabled: false,
      version: 2,
    });
    await expect(repository.setEnabled({
      pluginId: "study.memorization",
      enabled: true,
      expectedVersion: 1,
      now,
    })).rejects.toMatchObject({ code: "PLUGIN_VERSION_CONFLICT" });
  });

  it("refuses unknown and incompatible plugins without changing core state", async () => {
    const database = drizzle(pglite, { schema });
    const repository = createPluginRepository(
      database,
      new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS, "2.0.0"),
    );
    await expect(repository.setEnabled({
      pluginId: "study.memorization",
      enabled: true,
      expectedVersion: 0,
      now: new Date(),
    })).rejects.toMatchObject({ code: "PLUGIN_INCOMPATIBLE" });
    await expect(repository.setEnabled({
      pluginId: "unknown.plugin",
      enabled: true,
      expectedVersion: 0,
      now: new Date(),
    })).rejects.toMatchObject({ code: "PLUGIN_NOT_FOUND" });
  });
});
