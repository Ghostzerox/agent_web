import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import {
  PluginCapabilityGateway,
  createPluginStorageCapabilityAdapter,
} from "@/lib/plugins/capabilityGateway";
import { PluginRegistry } from "@/lib/plugins/pluginRegistry";
import { createPluginCapabilityRepository } from "@/lib/repositories/pluginCapabilityRepository";
import { createPluginRepository } from "@/lib/repositories/pluginRepository";
import { createPluginStorageRepository } from "@/lib/repositories/pluginStorageRepository";

describe("Phase 7.2 plugin capability boundary", () => {
  let pglite: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let registry: PluginRegistry;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
    database = drizzle(pglite, { schema });
    registry = new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS);
  });

  afterEach(async () => {
    await pglite.close();
  });

  async function enable(pluginId: string) {
    return createPluginRepository(database, registry).setEnabled({
      pluginId,
      enabled: true,
      expectedVersion: 0,
      now: new Date("2026-09-28T08:00:00.000Z"),
    });
  }

  it("requires an explicit version-bound grant and enforces the daily quota", async () => {
    await enable("study.memorization");
    const repository = createPluginCapabilityRepository(database, registry);
    const now = new Date("2026-09-28T08:30:00.000Z");

    const initial = await repository.getDashboard("study.memorization", now);
    expect(initial.pluginEnabled).toBe(true);
    expect(initial.capabilities.every((item) => !item.grant.effective)).toBe(true);

    const granted = await repository.setGrant({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      granted: true,
      expectedVersion: 0,
      now,
    });
    expect(granted.capabilities.find((item) => item.id === "storage.read-write")?.grant)
      .toMatchObject({ status: "granted", effective: true, version: 1 });

    await expect(repository.reserveInvocation({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      units: 499,
      now,
    })).resolves.toMatchObject({ used: 499, remaining: 1, limit: 500 });
    await expect(repository.reserveInvocation({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      units: 1,
      now,
    })).resolves.toMatchObject({ used: 500, remaining: 0 });
    await expect(repository.reserveInvocation({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      units: 1,
      now,
    })).rejects.toMatchObject({ code: "CAPABILITY_QUOTA_EXCEEDED" });

    await createPluginRepository(database, registry).setEnabled({
      pluginId: "study.memorization",
      enabled: false,
      expectedVersion: 1,
      now,
    });
    await expect(repository.setGrant({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      granted: false,
      expectedVersion: 1,
      now,
    })).resolves.toMatchObject({
      capabilities: expect.arrayContaining([
        expect.objectContaining({
          id: "storage.read-write",
          grant: expect.objectContaining({ status: "revoked", effective: false }),
        }),
      ]),
    });
    await expect(repository.reserveInvocation({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      units: 1,
      now,
    })).rejects.toMatchObject({ code: "PLUGIN_DISABLED" });
  });

  it("requires installation and grant review when plugins move to API v1", async () => {
    const oldManifest = {
      ...(FIRST_PARTY_PLUGIN_MANIFESTS[0] as Record<string, unknown>),
      version: "0.9.0",
    };
    const oldRegistry = new PluginRegistry([oldManifest]);
    const now = new Date("2026-09-30T01:00:00.000Z");
    await createPluginRepository(database, oldRegistry).setEnabled({
      pluginId: "study.memorization",
      enabled: true,
      expectedVersion: 0,
      now,
    });
    const oldPolicy = createPluginCapabilityRepository(database, oldRegistry);
    await oldPolicy.setGrant({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      granted: true,
      expectedVersion: 0,
      now,
    });

    const currentPlugins = createPluginRepository(database, registry);
    const catalog = await currentPlugins.list();
    expect(catalog.find((item) => item.manifest.id === "study.memorization"))
      .toMatchObject({
        manifest: { version: "1.0.0" },
        installation: { installedVersion: "0.9.0", updateAvailable: true },
      });
    const currentPolicy = createPluginCapabilityRepository(database, registry);
    await expect(currentPolicy.getDashboard("study.memorization", now)).resolves
      .toMatchObject({
        pluginEnabled: false,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: "storage.read-write",
            grant: expect.objectContaining({ effective: false, requiresReview: true }),
          }),
        ]),
      });

    await currentPlugins.setEnabled({
      pluginId: "study.memorization",
      enabled: true,
      expectedVersion: 1,
      now,
    });
    await currentPolicy.setGrant({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      granted: true,
      expectedVersion: 1,
      now,
    });
    await expect(currentPolicy.getDashboard("study.memorization", now)).resolves
      .toMatchObject({
        pluginEnabled: true,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: "storage.read-write",
            grant: expect.objectContaining({ effective: true, requiresReview: false }),
          }),
        ]),
      });
  });

  it("isolates identical storage keys by plugin and fences stale writes", async () => {
    await enable("study.memorization");
    await enable("study.problem-solving");
    const storage = createPluginStorageRepository(database);
    const now = new Date("2026-09-28T09:00:00.000Z");

    await storage.set({
      pluginId: "study.memorization",
      key: "session.current",
      value: { owner: "memorization" },
      expectedVersion: 0,
      now,
    });
    await storage.set({
      pluginId: "study.problem-solving",
      key: "session.current",
      value: { owner: "problem-solving" },
      expectedVersion: 0,
      now,
    });

    await expect(storage.get("study.memorization", "session.current"))
      .resolves.toMatchObject({ value: { owner: "memorization" }, version: 1 });
    await expect(storage.get("study.problem-solving", "session.current"))
      .resolves.toMatchObject({ value: { owner: "problem-solving" }, version: 1 });
    await expect(storage.set({
      pluginId: "study.memorization",
      key: "session.current",
      value: { stale: true },
      expectedVersion: 0,
      now,
    })).rejects.toMatchObject({ code: "PLUGIN_STORAGE_VERSION_CONFLICT" });
    await expect(storage.set({
      pluginId: "study.memorization",
      key: "oversized",
      value: "x".repeat(65_536),
      expectedVersion: 0,
      now,
    })).rejects.toMatchObject({ code: "PLUGIN_STORAGE_VALUE_TOO_LARGE" });
    await expect(storage.set({
      pluginId: "study.unknown",
      key: "session.current",
      value: { shouldNotExist: true },
      expectedVersion: 0,
      now,
    })).rejects.toMatchObject({ code: "PLUGIN_STORAGE_SCOPE_MISSING" });
  });

  it("denies ungranted calls, executes storage through an adapter and audits metadata only", async () => {
    await enable("study.memorization");
    const policy = createPluginCapabilityRepository(database, registry);
    const storage = createPluginStorageRepository(database);
    const now = new Date("2026-09-28T10:00:00.000Z");
    const gateway = new PluginCapabilityGateway(
      policy,
      [createPluginStorageCapabilityAdapter(storage)],
      () => now,
    );
    const context = {
      execution: "foreground" as const,
      runId: null,
      userInitiated: true,
    };

    await expect(gateway.invoke({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      payload: {
        operation: "set",
        key: "review.private",
        value: "super-secret-learning-text",
        expectedVersion: 0,
      },
      context,
    })).rejects.toMatchObject({ code: "CAPABILITY_NOT_GRANTED" });

    await policy.setGrant({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      granted: true,
      expectedVersion: 0,
      now,
    });
    await expect(gateway.invoke({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      payload: {
        operation: "set",
        key: "review.private",
        value: "super-secret-learning-text",
        expectedVersion: 0,
      },
      context,
    })).resolves.toMatchObject({ data: { key: "review.private", version: 1 } });
    await expect(gateway.invoke({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      payload: { operation: "get", key: "review.private" },
      context,
    })).resolves.toMatchObject({ data: { value: "super-secret-learning-text" } });

    await expect(gateway.invoke({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      payload: { operation: "get", key: "review.private" },
      context: { execution: "background", runId: null, userInitiated: false },
    })).rejects.toMatchObject({ code: "CAPABILITY_CONTEXT_INVALID" });

    const audit = await policy.listAudit("study.memorization", 20);
    expect(audit.map((item) => item.outcome)).toEqual(expect.arrayContaining([
      "succeeded",
      "denied",
    ]));
    expect(audit.some((item) => item.errorCode === "CAPABILITY_NOT_GRANTED")).toBe(true);
    expect(audit.some((item) => item.errorCode === "CAPABILITY_CONTEXT_INVALID")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("super-secret-learning-text");
  });
});
