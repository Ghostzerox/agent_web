import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMigrations, migrateDatabase, rollbackDatabase, type MigrationDatabase } from "@/lib/db/migrations";

describe("database migrations", () => {
  let pglite: PGlite;
  let database: MigrationDatabase;

  beforeEach(() => {
    pglite = new PGlite();
    database = createPgliteMigrationDatabase(pglite);
  });

  afterEach(async () => {
    await pglite.close();
  });

  it(
    "creates, validates and re-applies the current PostgreSQL schema",
    async () => {
      const migrations = await loadMigrations();

      expect(migrations).toHaveLength(38);
      expect(migrations.every((migration) => migration.down !== null)).toBe(
        true,
      );
      await expect(migrateDatabase(database, migrations)).resolves.toEqual(
        migrations.map((migration) => migration.id),
      );

      const tableResult = await pglite.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      expect(tableResult.rows.map((row) => row.tablename)).toEqual([
        "action_entries",
        "action_events",
        "action_items",
        "conversation_imports",
        "conversation_summaries",
        "conversations",
        "game_asset_designs",
        "game_characters",
        "game_checkpoints",
        "game_event_designs",
        "game_events",
        "game_item_draws",
        "game_sessions",
        "game_turns",
        "game_world_drafts",
        "game_world_revisions",
        "game_world_saves",
        "inbox_items",
        "knowledge_chunks",
        "knowledge_collections",
        "knowledge_documents",
        "memory_candidates",
        "memory_controls",
        "memory_items",
        "memory_palaces",
        "memory_usages",
        "messages",
        "model_credentials",
        "model_usage_calls",
        "notification_deliveries",
        "notification_preferences",
        "persona_profiles",
        "plugin_capability_audit",
        "plugin_capability_grants",
        "plugin_installations",
        "plugin_quota_usage",
        "plugin_storage_entries",
        "proactivity_ledger",
        "proactivity_preferences",
        "prompt_runs",
        "push_subscriptions",
        "push_vapid_configurations",
        "reading_profiles",
        "reflection_preferences",
        "scheduled_tasks",
        "task_runs",
        "users",
        "voice_profiles",
      ]);

      const userResult = await pglite.query<{ id: string }>(`
        INSERT INTO users DEFAULT VALUES RETURNING id
      `);
      const conversationResult = await pglite.query<{ id: string }>(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, 'Migration test')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      const messageResult = await pglite.query<{
        citations: unknown[];
        status: string;
        verification: unknown;
      }>(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ($1, 'user', 'Hello')
         RETURNING citations, status, verification`,
        [conversationResult.rows[0].id],
      );
      expect(messageResult.rows[0]).toMatchObject({
        citations: [],
        status: "complete",
        verification: null,
      });
      const entertainmentMode = await pglite.query<{ mode: string }>(
        `UPDATE conversations
         SET mode = 'entertainment'
         WHERE id = $1
         RETURNING mode`,
        [conversationResult.rows[0].id],
      );
      expect(entertainmentMode.rows[0].mode).toBe("entertainment");

      const gameSession = await pglite.query<{ id: string; version: number }>(
        `INSERT INTO game_sessions (
           user_id, title, kind, world_name, world_premise, world_tone
         ) VALUES ($1, 'Fog Harbor', 'roleplay', 'Fog Harbor', 'A hidden port', 'mysterious')
         RETURNING id, version`,
        [userResult.rows[0].id],
      );
      expect(gameSession.rows[0].version).toBe(1);
      const gameCharacter = await pglite.query<{ attributes: Record<string, number>; max_health: number }>(
        `INSERT INTO game_characters (
           session_id, name, role, controller, description, attributes, max_health
         ) VALUES ($1, 'Lin', 'Investigator', 'user', 'Looking for the sender', '{"will":3}', 12)
         RETURNING attributes, max_health`,
        [gameSession.rows[0].id],
      );
      expect(gameCharacter.rows[0]).toEqual({ attributes: { will: 3 }, max_health: 12 });
      const gameTurn = await pglite.query<{ id: string }>(
        `INSERT INTO game_turns (
           session_id, player_content, assistant_content, model
         ) VALUES ($1, 'Enter the harbor', 'The fog parts.', 'test-model')
         RETURNING id`,
        [gameSession.rows[0].id],
      );
      await pglite.query(
        `UPDATE game_sessions SET active_leaf_turn_id = $1 WHERE id = $2`,
        [gameTurn.rows[0].id, gameSession.rows[0].id],
      );
      const event = await pglite.query<{ kind: string; payload: unknown }>(
        `INSERT INTO game_events (
           session_id, turn_id, kind, sequence, payload
         ) VALUES ($1, $2, 'dice_roll', 0, '{"seed":"migration-test","total":11}')
         RETURNING kind, payload`,
        [gameSession.rows[0].id, gameTurn.rows[0].id],
      );
      expect(event.rows[0]).toMatchObject({ kind: "dice_roll" });
      const ruleCheck = await pglite.query<{ kind: string }>(
        `INSERT INTO game_events (
           session_id, turn_id, kind, sequence, payload
         ) VALUES ($1, $2, 'rule_check', 1, '{"attribute":"will","total":14}')
         RETURNING kind`,
        [gameSession.rows[0].id, gameTurn.rows[0].id],
      );
      expect(ruleCheck.rows[0].kind).toBe("rule_check");
      const checkpoint = await pglite.query<{ name: string }>(
        `INSERT INTO game_checkpoints (
           session_id, turn_id, name, note, state_snapshot
         ) VALUES ($1, $2, 'Before tower', 'Keep harbor branch', '{}')
         RETURNING name`,
        [gameSession.rows[0].id, gameTurn.rows[0].id],
      );
      expect(checkpoint.rows[0].name).toBe("Before tower");
      await expect(
        pglite.query(
          `INSERT INTO game_characters (
             session_id, name, role, controller, description
           ) VALUES ($1, 'Invalid', 'Unknown', 'system', 'Invalid controller')`,
          [gameSession.rows[0].id],
        ),
      ).rejects.toThrow();

      const taskResult = await pglite.query<{ id: string }>(
        `INSERT INTO scheduled_tasks (
           user_id, title, schedule_type, schedule_value, next_run_at
         ) VALUES ($1, 'Daily review', 'daily', '{"time":"09:00"}', '2030-01-01T01:00:00Z')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      const runResult = await pglite.query<{ id: string }>(
        `INSERT INTO task_runs (task_id, scheduled_for)
         VALUES ($1, '2030-01-01T01:00:00Z')
         RETURNING id`,
        [taskResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO task_runs (task_id, scheduled_for)
           VALUES ($1, '2030-01-01T01:00:00Z')`,
          [taskResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const pluginInstallation = await pglite.query<{
        status: string;
        version: number;
      }>(
        `INSERT INTO plugin_installations (
           user_id, plugin_id, installed_version, status
         ) VALUES ($1, 'study.memorization', '0.1.0', 'enabled')
         RETURNING status, version`,
        [userResult.rows[0].id],
      );
      expect(pluginInstallation.rows[0]).toEqual({
        status: "enabled",
        version: 1,
      });
      await expect(
        pglite.query(
          `UPDATE plugin_installations
           SET status = 'unknown'
           WHERE user_id = $1`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const capabilityGrant = await pglite.query<{
        status: string;
        version: number;
      }>(
        `INSERT INTO plugin_capability_grants (
           user_id, plugin_id, capability_id, plugin_version, status
         ) VALUES ($1, 'study.memorization', 'storage.read-write', '0.1.0', 'granted')
         RETURNING status, version`,
        [userResult.rows[0].id],
      );
      expect(capabilityGrant.rows[0]).toEqual({ status: "granted", version: 1 });
      await pglite.query(
        `INSERT INTO plugin_storage_entries (
           user_id, plugin_id, key, value, byte_size
         ) VALUES ($1, 'study.memorization', 'deck.current', '{"step":1}', 10)`,
        [userResult.rows[0].id],
      );
      await pglite.query(
        `INSERT INTO plugin_quota_usage (
           user_id, plugin_id, capability_id, period_start, used_units
         ) VALUES ($1, 'study.memorization', 'storage.read-write', '2026-09-28T00:00:00Z', 1)`,
        [userResult.rows[0].id],
      );
      await pglite.query(
        `INSERT INTO plugin_capability_audit (
           request_id, user_id, plugin_id, capability_id, operation,
           execution, outcome, units, completed_at
         ) VALUES (
           '11111111-1111-4111-8111-111111111111', $1, 'study.memorization',
           'storage.read-write', 'storage.set', 'foreground', 'succeeded', 1, now()
         )`,
        [userResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO plugin_capability_grants (
             user_id, plugin_id, capability_id, plugin_version
           ) VALUES ($1, 'study.memorization', 'network.unrestricted', '0.1.0')`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const personaProfile = await pglite.query<{
        name: string;
        warmth: number;
        verbosity: number;
      }>(
        `INSERT INTO persona_profiles (user_id)
         VALUES ($1)
         RETURNING name, warmth, verbosity`,
        [userResult.rows[0].id],
      );
      expect(personaProfile.rows[0]).toEqual({
        name: "知伴",
        warmth: 70,
        verbosity: 50,
      });
      await expect(
        pglite.query(
          `UPDATE persona_profiles SET humor = 101 WHERE user_id = $1`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const voiceProfile = await pglite.query<{
        provider: string;
        language: string;
        rate: number;
        pitch: number;
        volume: number;
      }>(
        `INSERT INTO voice_profiles (user_id)
         VALUES ($1)
         RETURNING provider, language, rate, pitch, volume`,
        [userResult.rows[0].id],
      );
      expect(voiceProfile.rows[0]).toEqual({
        provider: "system",
        language: "zh-CN",
        rate: 100,
        pitch: 100,
        volume: 100,
      });
      await expect(
        pglite.query(
          `UPDATE voice_profiles SET rate = 201 WHERE user_id = $1`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const proactivity = await pglite.query<{
        enabled: boolean;
        max_messages_per_day: number;
        min_cooldown_hours: number;
        checkin_after_days: number;
        allowed_reasons: string[];
      }>(
        `INSERT INTO proactivity_preferences (user_id)
         VALUES ($1)
         RETURNING enabled, max_messages_per_day, min_cooldown_hours,
                   checkin_after_days, allowed_reasons`,
        [userResult.rows[0].id],
      );
      expect(proactivity.rows[0]).toEqual({
        enabled: false,
        max_messages_per_day: 1,
        min_cooldown_hours: 72,
        checkin_after_days: 3,
        allowed_reasons: ["goal_followup", "checkin"],
      });
      await expect(
        pglite.query(
          `UPDATE proactivity_preferences
           SET allowed_reasons = '["unknown"]'::jsonb
           WHERE user_id = $1`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const readingProfile = await pglite.query<{
        difficulty: string;
        weekly_minutes: number;
        goal: string;
      }>(
        `INSERT INTO reading_profiles (user_id, topics)
         VALUES ($1, '["认知科学"]')
         RETURNING difficulty, weekly_minutes, goal`,
        [userResult.rows[0].id],
      );
      expect(readingProfile.rows[0]).toEqual({
        difficulty: "intermediate",
        weekly_minutes: 120,
        goal: "systematic",
      });
      await expect(
        pglite.query(
          `UPDATE reading_profiles SET weekly_minutes = 0 WHERE user_id = $1`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const bookTask = await pglite.query<{ id: string }>(
        `INSERT INTO scheduled_tasks (
           user_id, title, kind, prompt, schedule_type, schedule_value, next_run_at
         ) VALUES (
           $1, 'Weekly books', 'book_recommendation', '认知科学', 'weekly',
           '{"weekday":7,"time":"09:00"}', '2030-02-03T01:00:00Z'
         ) RETURNING id`,
        [userResult.rows[0].id],
      );
      const bookInbox = await pglite.query<{ id: string }>(
        `INSERT INTO inbox_items (user_id, source, title, occurred_at)
         VALUES ($1, 'book_recommendation', 'Book result', '2030-02-03T01:00:00Z')
         RETURNING id`,
        [userResult.rows[0].id],
      );

      const agentTask = await pglite.query<{ id: string }>(
        `INSERT INTO scheduled_tasks (
           user_id, title, kind, prompt, schedule_type, schedule_value, next_run_at
         ) VALUES (
           $1, 'AI review', 'agent_prompt', 'Summarize learning', 'once',
           '{"runAt":"2030-02-01T01:00:00.000Z"}', '2030-02-01T01:00:00Z'
         ) RETURNING id`,
        [userResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO scheduled_tasks (
             user_id, title, kind, prompt, schedule_type, schedule_value, next_run_at
           ) VALUES (
             $1, 'Invalid AI task', 'agent_prompt', NULL, 'once',
             '{"runAt":"2030-02-02T01:00:00.000Z"}', '2030-02-02T01:00:00Z'
           )`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();
      const agentInbox = await pglite.query<{ id: string }>(
        `INSERT INTO inbox_items (user_id, source, title, occurred_at)
         VALUES ($1, 'agent_prompt', 'AI result', '2030-02-01T01:00:00Z')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      const briefingTask = await pglite.query<{ id: string }>(
        `INSERT INTO scheduled_tasks (
           user_id, title, kind, prompt, schedule_type, schedule_value, next_run_at
         ) VALUES (
           $1, 'Daily briefing', 'personal_briefing', 'AI policy', 'daily',
           '{"time":"08:00"}', '2030-02-02T00:00:00Z'
         ) RETURNING id`,
        [userResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO scheduled_tasks (
             user_id, title, kind, prompt, schedule_type, schedule_value, next_run_at
           ) VALUES (
             $1, 'Invalid briefing', 'personal_briefing', NULL, 'daily',
             '{"time":"08:00"}', '2030-02-03T00:00:00Z'
           )`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();
      const briefingInbox = await pglite.query<{ id: string }>(
        `INSERT INTO inbox_items (user_id, source, title, occurred_at)
         VALUES ($1, 'personal_briefing', 'Briefing result', '2030-02-02T00:00:00Z')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      await pglite.query(
        `UPDATE inbox_items
         SET feedback = 'helpful',
             briefing_sources = '[{"title":"AI policy","url":"https://example.com","source":"example.com","publishedAt":null,"urlKey":"https://example.com/","titleKey":"aipolicy"}]'
         WHERE id = $1`,
        [briefingInbox.rows[0].id],
      );
      await expect(
        pglite.query(
          `UPDATE inbox_items SET feedback = 'duplicate' WHERE id = $1`,
          [agentInbox.rows[0].id],
        ),
      ).rejects.toThrow();

      await pglite.query(
        `INSERT INTO inbox_items (
           user_id, task_id, task_run_id, title, occurred_at
         ) VALUES ($1, $2, $3, 'Durable reminder', '2030-01-01T01:00:00Z')`,
        [userResult.rows[0].id, taskResult.rows[0].id, runResult.rows[0].id],
      );
      await pglite.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [
        taskResult.rows[0].id,
      ]);
      const durableInbox = await pglite.query<{
        task_id: string | null;
        task_run_id: string | null;
      }>(`SELECT task_id, task_run_id FROM inbox_items`);
      expect(durableInbox.rows[0]).toEqual({
        task_id: null,
        task_run_id: null,
      });

      const preferenceResult = await pglite.query<{
        push_enabled: boolean;
        quiet_hours_enabled: boolean;
        quiet_start: string;
        quiet_end: string;
      }>(
        `INSERT INTO notification_preferences (user_id)
         VALUES ($1)
         RETURNING push_enabled, quiet_hours_enabled, quiet_start, quiet_end`,
        [userResult.rows[0].id],
      );
      expect(preferenceResult.rows[0]).toEqual({
        push_enabled: false,
        quiet_hours_enabled: true,
        quiet_start: "22:00",
        quiet_end: "08:00",
      });

      await pglite.query(
        `INSERT INTO model_credentials (
           user_id, provider, base_url, model, encrypted_api_key, api_key_hint
         ) VALUES ($1, 'deepseek', 'https://api.deepseek.com', 'deepseek-chat', 'encrypted', '••••test')`,
        [userResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO model_credentials (
             user_id, provider, base_url, model, encrypted_api_key, api_key_hint
           ) VALUES ($1, 'another-provider', 'https://example.com', 'model', 'encrypted', '••••test')`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const inboxResult = await pglite.query<{ id: string }>(
        `SELECT id FROM inbox_items LIMIT 1`,
      );
      const subscriptionResult = await pglite.query<{ id: string; provider: string }>(
        `INSERT INTO push_subscriptions (
           user_id, endpoint_hash, encrypted_subscription, device_label
         ) VALUES ($1, 'hash', 'encrypted', 'Migration browser')
         RETURNING id, provider`,
        [userResult.rows[0].id],
      );
      expect(subscriptionResult.rows[0].provider).toBe("web-push");
      await pglite.query(
        `INSERT INTO notification_deliveries (
           user_id, inbox_item_id, subscription_id
         ) VALUES ($1, $2, $3)`,
        [
          userResult.rows[0].id,
          inboxResult.rows[0].id,
          subscriptionResult.rows[0].id,
        ],
      );
      await expect(
        pglite.query(
          `INSERT INTO notification_deliveries (
             user_id, inbox_item_id, subscription_id
           ) VALUES ($1, $2, $3)`,
          [
            userResult.rows[0].id,
            inboxResult.rows[0].id,
            subscriptionResult.rows[0].id,
          ],
        ),
      ).rejects.toThrow();

      await expect(migrateDatabase(database, migrations)).resolves.toEqual([]);
      await pglite.query(`DELETE FROM inbox_items WHERE id = $1`, [agentInbox.rows[0].id]);
      await pglite.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [agentTask.rows[0].id]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[37].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[36].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[35].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[34].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[33].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[32].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[31].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[30].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[29].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(migrations[28].id);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[27].id,
      );
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[26].id,
      );
      const phase64AfterRollback = await pglite.query<{ name: string }>(`
        SELECT tablename AS name FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'game_checkpoints'
        UNION ALL
        SELECT column_name AS name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_characters'
          AND column_name IN ('attributes', 'max_health')
      `);
      expect(phase64AfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[25].id,
      );
      const gameEventsAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'game_events'
      `);
      expect(gameEventsAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[24].id,
      );
      const gameTurnsAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'game_turns'
      `);
      expect(gameTurnsAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[23].id,
      );
      const gameTablesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('game_characters', 'game_sessions')
      `);
      expect(gameTablesAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[22].id,
      );
      const capabilityTablesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'plugin_capability_audit',
            'plugin_capability_grants',
            'plugin_quota_usage',
            'plugin_storage_entries'
          )
      `);
      expect(capabilityTablesAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[21].id,
      );
      const pluginTableAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'plugin_installations'
      `);
      expect(pluginTableAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[20].id,
      );
      const proactivityAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('proactivity_preferences', 'proactivity_ledger')
      `);
      expect(proactivityAfterRollback.rows).toEqual([]);
      const proactivityColumnsAfterRollback = await pglite.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inbox_items'
          AND column_name IN ('proactivity_reason', 'proactivity_rationale')
      `);
      expect(proactivityColumnsAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[19].id,
      );
      const voiceAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'voice_profiles'
      `);
      expect(voiceAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[18].id,
      );
      const personaAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'persona_profiles'
      `);
      expect(personaAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[17].id,
      );
      const memoryUsageAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'memory_usages'
      `);
      expect(memoryUsageAfterRollback.rows).toEqual([]);
      const memoryManagementColumnsAfterRollback = await pglite.query<{
        column_name: string;
      }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'memory_items'
          AND column_name IN ('sensitivity', 'pinned', 'valid_until', 'last_used_at', 'use_count')
      `);
      expect(memoryManagementColumnsAfterRollback.rows).toEqual([]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[16].id,
      );
      const memoryTablesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('memory_candidates', 'memory_items')
      `);
      expect(memoryTablesAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[15].id,
      );
      const reflectionAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'reflection_preferences'
      `);
      expect(reflectionAfterRollback.rows).toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[14].id,
      );
      const downgradedBookTask = await pglite.query<{ kind: string }>(
        `SELECT kind FROM scheduled_tasks WHERE id = $1`,
        [bookTask.rows[0].id],
      );
      const downgradedBookInbox = await pglite.query<{ source: string }>(
        `SELECT source FROM inbox_items WHERE id = $1`,
        [bookInbox.rows[0].id],
      );
      expect(downgradedBookTask.rows[0].kind).toBe("agent_prompt");
      expect(downgradedBookInbox.rows[0].source).toBe("agent_prompt");
      const profilesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'reading_profiles'
      `);
      expect(profilesAfterRollback.rows).toEqual([]);
      await pglite.query(`DELETE FROM inbox_items WHERE id = $1`, [
        bookInbox.rows[0].id,
      ]);
      await pglite.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [
        bookTask.rows[0].id,
      ]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[13].id,
      );
      const briefingColumnsAfterRollback = await pglite.query<{
        column_name: string;
      }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inbox_items'
          AND column_name IN ('briefing_sources', 'feedback')
      `);
      expect(briefingColumnsAfterRollback.rows).toEqual([]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[12].id,
      );
      const downgradedBriefingTask = await pglite.query<{ kind: string }>(
        `SELECT kind FROM scheduled_tasks WHERE id = $1`,
        [briefingTask.rows[0].id],
      );
      const downgradedBriefingInbox = await pglite.query<{ source: string }>(
        `SELECT source FROM inbox_items WHERE id = $1`,
        [briefingInbox.rows[0].id],
      );
      expect(downgradedBriefingTask.rows[0].kind).toBe("agent_prompt");
      expect(downgradedBriefingInbox.rows[0].source).toBe("agent_prompt");
      await pglite.query(`DELETE FROM inbox_items WHERE id = $1`, [
        briefingInbox.rows[0].id,
      ]);
      await pglite.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [
        briefingTask.rows[0].id,
      ]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[11].id,
      );
      const verificationAfterRollback = await pglite.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'verification'
      `);
      expect(verificationAfterRollback.rows).toEqual([]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[10].id,
      );
      const promptRunsAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'prompt_runs'
      `);
      expect(promptRunsAfterRollback.rows).toEqual([]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[9].id,
      );
      const modeAfterRollback = await pglite.query<{ mode: string }>(
        `SELECT mode FROM conversations WHERE id = $1`,
        [conversationResult.rows[0].id],
      );
      expect(modeAfterRollback.rows[0].mode).toBe("auto");

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[8].id,
      );
      await expect(
        pglite.query(
          `INSERT INTO scheduled_tasks (
             user_id, title, kind, prompt, schedule_type, schedule_value, next_run_at
           ) VALUES (
             $1, 'Old schema AI task', 'agent_prompt', 'prompt', 'once',
             '{"runAt":"2030-02-03T01:00:00.000Z"}', '2030-02-03T01:00:00Z'
           )`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[7].id,
      );

      const providerColumnsAfterRollback = await pglite.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'push_subscriptions'
          AND column_name = 'provider'
      `);
      expect(providerColumnsAfterRollback.rows).toEqual([]);

      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[6].id,
      );

      await pglite.query(
        `INSERT INTO model_credentials (
           user_id, provider, base_url, model, encrypted_api_key, api_key_hint
         ) VALUES ($1, 'another-provider', 'https://example.com', 'model', 'encrypted', '••••test')`,
        [userResult.rows[0].id],
      );
      await pglite.query(
        `DELETE FROM model_credentials
         WHERE user_id = $1 AND provider = 'another-provider'`,
        [userResult.rows[0].id],
      );
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[5].id,
      );

      const tablesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'notification_deliveries',
            'notification_preferences',
            'push_subscriptions',
            'push_vapid_configurations'
          )
      `);
      expect(tablesAfterRollback.rows).toEqual([]);
      const inboxColumnsAfterRollback = await pglite.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inbox_items'
          AND column_name = 'push_planned_at'
      `);
      expect(inboxColumnsAfterRollback.rows).toEqual([]);

      await expect(migrateDatabase(database, migrations)).resolves.toEqual([
        migrations[5].id,
        migrations[6].id,
        migrations[7].id,
        migrations[8].id,
        migrations[9].id,
        migrations[10].id,
        migrations[11].id,
        migrations[12].id,
        migrations[13].id,
        migrations[14].id,
        migrations[15].id,
        migrations[16].id,
        migrations[17].id,
        migrations[18].id,
        migrations[19].id,
        migrations[20].id,
        migrations[21].id,
        migrations[22].id,
        migrations[23].id,
        migrations[24].id,
        migrations[25].id,
        migrations[26].id,
        migrations[27].id,
        migrations[28].id,
        migrations[29].id,
        migrations[30].id,
        migrations[31].id,
        migrations[32].id,
        migrations[33].id,
        migrations[34].id,

        migrations[35].id,
      migrations[36].id,
      migrations[37].id,
      ]);
    },
    15_000,
  );

  it("rejects drift in a migration that has already been applied", async () => {
    const migrations = await loadMigrations();
    await migrateDatabase(database, migrations);

    await expect(
      migrateDatabase(database, [
        { ...migrations[0], checksum: "changed-after-apply" },
      ]),
    ).rejects.toThrow("changed after it was applied");
  });

  it("keeps the most recently updated credential when upgrading old provider rows", async () => {
    const migrations = await loadMigrations();
    await migrateDatabase(database, migrations.slice(0, 6));
    const user = await pglite.query<{ id: string }>(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    );
    await pglite.query(
      `INSERT INTO model_credentials (
         user_id, provider, base_url, model, encrypted_api_key, api_key_hint, updated_at
       ) VALUES
         ($1, 'old-provider', 'https://old.example', 'old', 'old-encrypted', '••••old', '2026-01-01T00:00:00Z'),
         ($1, 'new-provider', 'https://new.example', 'new', 'new-encrypted', '••••new', '2026-02-01T00:00:00Z')`,
      [user.rows[0].id],
    );

    await expect(migrateDatabase(database, migrations)).resolves.toEqual([
      migrations[6].id,
      migrations[7].id,
      migrations[8].id,
      migrations[9].id,
      migrations[10].id,
      migrations[11].id,
      migrations[12].id,
      migrations[13].id,
      migrations[14].id,
      migrations[15].id,
      migrations[16].id,
      migrations[17].id,
      migrations[18].id,
      migrations[19].id,
      migrations[20].id,
      migrations[21].id,
      migrations[22].id,
      migrations[23].id,
      migrations[24].id,
      migrations[25].id,
      migrations[26].id,
      migrations[27].id,
      migrations[28].id,
      migrations[29].id,
      migrations[30].id,
      migrations[31].id,
      migrations[32].id,
      migrations[33].id,
      migrations[34].id,

      migrations[35].id,
      migrations[36].id,
      migrations[37].id,
    ]);
    const rows = await pglite.query<{ provider: string; model: string }>(
      `SELECT provider, model FROM model_credentials WHERE user_id = $1`,
      [user.rows[0].id],
    );
    expect(rows.rows).toEqual([{ provider: "new-provider", model: "new" }]);
  });
});
