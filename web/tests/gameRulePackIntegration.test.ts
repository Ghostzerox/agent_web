import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it, vi } from "vitest";
import { createGameRulePackApi } from "@/lib/api/gameRulePackApi";
import { createGameSessionApi } from "@/lib/api/gameSessionApi";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { DEFAULT_QUICK_ADVENTURE_SETUP, QUICK_ADVENTURE_RULE_PACK_ID } from "@/lib/gameRulePacks/quickAdventure";
import { gameRulePackDraftResultSchema } from "@/lib/gameRulePacks/contracts";
import { createPluginStorageCapabilityAdapter, PluginCapabilityGateway } from "@/lib/plugins/capabilityGateway";
import { getFirstPartyPluginRegistry } from "@/lib/plugins/pluginRegistry";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createPluginCapabilityRepository } from "@/lib/repositories/pluginCapabilityRepository";
import { createPluginRepository } from "@/lib/repositories/pluginRepository";
import { createPluginStorageRepository } from "@/lib/repositories/pluginStorageRepository";

function request(body: unknown) {
  return new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
}

describe("rule pack to existing GameSession integration", () => {
  it("enforces grants and versioning, keeps previews isolated, then runs a confirmed session after the plugin is disabled", async () => {
    const pglite = new PGlite();
    try {
      await migrateDatabase(createPgliteMigrationDatabase(pglite), await loadMigrations());
      const database = drizzle(pglite, { schema });
      const registry = getFirstPartyPluginRegistry();
      const plugins = createPluginRepository(database, registry);
      const policy = createPluginCapabilityRepository(database, registry);
      const storage = createPluginStorageRepository(database);
      const now = new Date("2026-09-30T08:00:00.000Z");
      const gateway = new PluginCapabilityGateway(policy, [createPluginStorageCapabilityAdapter(storage)], () => now);
      const api = createGameRulePackApi(gateway);
      const id = QUICK_ADVENTURE_RULE_PACK_ID;
      const pluginId = "entertainment.quick-adventure";

      expect((await api.getSetup(id)).status).toBe(403);
      await plugins.setEnabled({ pluginId, enabled: true, expectedVersion: 0, now });
      expect((await api.getSetup(id)).status).toBe(403);
      await policy.setGrant({ pluginId, capabilityId: "storage.read-write", granted: true, expectedVersion: 0, now });
      expect(await (await api.getSetup(id)).json()).toMatchObject({ data: { setup: null, storageVersion: 0 } });
      const preview = await api.prepareDraft(id, request({
        setup: DEFAULT_QUICK_ADVENTURE_SETUP, expectedVersion: 0,
      }));
      expect(preview.status).toBe(200);
      const result = gameRulePackDraftResultSchema.parse((await preview.json()).data);
      expect((await api.prepareDraft(id, request({
        setup: { ...DEFAULT_QUICK_ADVENTURE_SETUP, heroName: "过期写入" }, expectedVersion: 0,
      }))).status).toBe(409);
      expect(await (await api.getSetup(id)).json()).toMatchObject({
        data: { setup: { heroName: DEFAULT_QUICK_ADVENTURE_SETUP.heroName }, storageVersion: 1 },
      });
      expect(await database.select().from(schema.gameSessions)).toHaveLength(0);
      expect(await database.select().from(schema.conversations)).toHaveLength(0);
      const audit = await policy.listAudit(pluginId, 20);
      expect(audit.some((item) => item.outcome === "succeeded" && item.operation === "storage.set")).toBe(true);
      expect(JSON.stringify(audit)).not.toContain(DEFAULT_QUICK_ADVENTURE_SETUP.heroName);
      expect(await storage.get("study.memorization", `rule-pack/setup/${id}`)).toBeNull();

      const games = createGameSessionRepository(database);
      const createdResponse = await createGameSessionApi(games, () => now).create(request(result.draft.session));
      expect(createdResponse.status).toBe(201);
      const created = (await createdResponse.json()).data as { id: string; version: number };
      const active = await games.updateStatus(created.id, { status: "active", expectedVersion: created.version, now });
      await plugins.setEnabled({ pluginId, enabled: false, expectedVersion: 1, now });
      expect((await api.getSetup(id)).status).toBe(403);

      const characterId = active.characters[0].id;
      const generate = vi.fn().mockResolvedValue({
        model: "test-model",
        content: JSON.stringify({
          narrative: "钟楼的印记在灯下显现，你找到了一条新的线索。",
          statePatch: { scene: "钟楼门口", sceneFacts: ["旧信的印记与门上的星纹一致"], sceneExits: ["通往观测室的楼梯"] },
        }),
      });
      const played = await createGameTurnService(games, { generate }, () => now, () => "pack-test-seed").create(created.id, {
        content: "我辨认信上的印记。", parentTurnId: null, expectedVersion: active.version,
        diceRequests: [], checkRequest: {
          characterId, attribute: "意志", difficulty: 15, count: 1, sides: 20, purpose: "辨认印记",
        },
      });
      expect(generate).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ role: "system", content: expect.stringContaining(`规则包：轻量冒险（${id}）v1.0.0`) }),
      ]), undefined);
      expect(played.turns[0].stateSnapshot.characters[characterId]).toMatchObject({
        health: 10, attributes: { 体魄: 1, 灵巧: 1, 意志: 3 },
      });
      expect(played.events[0]).toMatchObject({ kind: "rule_check", payload: { modifier: 3, difficulty: 15 } });
      expect(await database.select().from(schema.memoryItems)).toHaveLength(0);
      expect(await database.select().from(schema.memoryCandidates)).toHaveLength(0);
    } finally { await pglite.close(); }
  });
});
