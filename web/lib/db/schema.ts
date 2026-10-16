import { sql } from "drizzle-orm";
import type { PalaceRoom } from "@/lib/memory/palace";
import type { SourceRevision, SummaryPayload, SummarySettings, SummaryUse } from "@/lib/conversation/summary";
import type { KnowledgeRetrievalAudit } from "@/lib/knowledge/audit";
import type { KNOWLEDGE_MODULES } from "@/lib/knowledge/documents";
import { CORE_MODE_IDS } from "@/lib/agent/modeRegistry";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ResponseVerification } from "@/lib/ai/messages";
import type { ModelCallTelemetry } from "@/lib/ai/modelUsage";
import type { GameRuleCheck } from "@/lib/game/checks";
import type { GameDiceRoll } from "@/lib/game/dice";
import type {
  GameCharacterAttributes,
  GameState,
  GameStatePatch,
} from "@/lib/game/state";

export const conversationMode = pgEnum("conversation_mode", CORE_MODE_IDS);

export const modelUsageCalls = pgTable("model_usage_calls", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  telemetry: jsonb("telemetry").$type<ModelCallTelemetry>().notNull(),
}, (table) => [
  index("model_usage_calls_user_started_idx").on(table.userId, table.startedAt),
  check("model_usage_calls_telemetry_object", sql`jsonb_typeof(${table.telemetry}) = 'object'`),
]);

export const messageRole = pgEnum("message_role", [
  "system",
  "developer",
  "user",
  "assistant",
  "tool",
]);

export const messageStatus = pgEnum("message_status", [
  "pending",
  "streaming",
  "complete",
  "failed",
]);

export const promptRunStatus = pgEnum("prompt_run_status", [
  "started",
  "completed",
  "failed",
  "cancelled",
]);

export const taskScheduleType = pgEnum("task_schedule_type", [
  "once",
  "daily",
  "weekly",
]);

export const taskStatus = pgEnum("task_status", [
  "active",
  "paused",
  "completed",
]);

export const taskRunStatus = pgEnum("task_run_status", [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

export const inboxItemStatus = pgEnum("inbox_item_status", ["unread", "read"]);

export const pushSubscriptionStatus = pgEnum("push_subscription_status", [
  "active",
  "expired",
]);

export const notificationDeliveryStatus = pgEnum(
  "notification_delivery_status",
  ["pending", "sending", "sent", "failed", "cancelled"],
);

export type TaskScheduleValue =
  | { runAt: string }
  | { time: string }
  | { weekday: number; time: string };

export type TaskKind =
  | "reminder"
  | "agent_prompt"
  | "personal_briefing"
  | "book_recommendation"
  | "reflection_question";
export type ProactivityReason = "goal_followup" | "checkin";
export type InboxSource = TaskKind | "proactive_checkin";
export type BriefingFeedback = "helpful" | "not_relevant" | "duplicate";
export type ReadingDifficulty = "introductory" | "intermediate" | "advanced";
export type ReadingGoal = "beginner" | "systematic" | "broaden" | "literary";
export type ReflectionStyle = "gentle" | "balanced" | "challenging";
export type ReflectionQuestionType =
  | "assumption"
  | "evidence"
  | "tradeoff"
  | "alternative"
  | "future"
  | "action";
export type MemoryCandidateKind = "preference" | "goal" | "profile" | "fact";
export type MemoryCandidateStatus = "pending" | "confirmed" | "rejected";
export type MemorySensitivity = "low" | "personal" | "sensitive";
export type PluginInstallationStatus = "enabled" | "disabled" | "incompatible";
export type PluginCapabilityGrantStatus = "granted" | "revoked";
export type PluginCapabilityAuditOutcome =
  | "started"
  | "succeeded"
  | "denied"
  | "failed";
export type GameSessionKind = "roleplay" | "tabletop" | "interactive-story";
export type GameSessionStatus = "setup" | "active" | "paused" | "archived";
export type GameCharacterController = "user" | "ai" | "shared";

export type ProactivityPolicySnapshot = {
  maxMessagesPerDay: number;
  minCooldownHours: number;
  checkinAfterDays: number;
  allowedReasons: ProactivityReason[];
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: "Asia/Shanghai";
  };
};

export type ReflectionQuestionSignal = {
  question: string;
  type: ReflectionQuestionType;
  why: string;
  scores: {
    relevance: number;
    novelty: number;
    actionability: number;
    emotionalLoad: number;
    total: number;
  };
  candidateCount: number;
};

export type BriefingSourceSignal = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  urlKey: string;
  titleKey: string;
};

export type MessageCitation = {
  id?: string;
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  publishedAt?: string | null;
  fetchedAt?: string;
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull().default("Local User"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("users_version_positive", sql`${table.version} > 0`),
  ],
);

export const readingProfiles = pgTable(
  "reading_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    topics: jsonb("topics").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    readBooks: jsonb("read_books").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    wantToReadBooks: jsonb("want_to_read_books")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    dislikedBooks: jsonb("disliked_books")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    difficulty: text("difficulty")
      .$type<ReadingDifficulty>()
      .notNull()
      .default("intermediate"),
    weeklyMinutes: integer("weekly_minutes").notNull().default(120),
    goal: text("goal").$type<ReadingGoal>().notNull().default("systematic"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "reading_profiles_difficulty_supported",
      sql`${table.difficulty} IN ('introductory', 'intermediate', 'advanced')`,
    ),
    check(
      "reading_profiles_goal_supported",
      sql`${table.goal} IN ('beginner', 'systematic', 'broaden', 'literary')`,
    ),
    check(
      "reading_profiles_weekly_minutes_range",
      sql`${table.weeklyMinutes} BETWEEN 15 AND 10080`,
    ),
    check("reading_profiles_version_positive", sql`${table.version} > 0`),
  ],
);

export const personaProfiles = pgTable(
  "persona_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("知伴"),
    preferredAddress: text("preferred_address"),
    warmth: integer("warmth").notNull().default(70),
    humor: integer("humor").notNull().default(20),
    directness: integer("directness").notNull().default(60),
    verbosity: integer("verbosity").notNull().default(50),
    initiative: integer("initiative").notNull().default(40),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("persona_profiles_name_nonempty", sql`length(btrim(${table.name})) > 0`),
    check(
      "persona_profiles_preferred_address_nonempty",
      sql`${table.preferredAddress} IS NULL OR length(btrim(${table.preferredAddress})) > 0`,
    ),
    check("persona_profiles_warmth_range", sql`${table.warmth} BETWEEN 0 AND 100`),
    check("persona_profiles_humor_range", sql`${table.humor} BETWEEN 0 AND 100`),
    check("persona_profiles_directness_range", sql`${table.directness} BETWEEN 0 AND 100`),
    check("persona_profiles_verbosity_range", sql`${table.verbosity} BETWEEN 0 AND 100`),
    check("persona_profiles_initiative_range", sql`${table.initiative} BETWEEN 0 AND 100`),
    check("persona_profiles_version_positive", sql`${table.version} > 0`),
  ],
);

export const voiceProfiles = pgTable(
  "voice_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("system"),
    voiceId: text("voice_id"),
    language: text("language").notNull().default("zh-CN"),
    rate: integer("rate").notNull().default(100),
    pitch: integer("pitch").notNull().default(100),
    volume: integer("volume").notNull().default(100),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("voice_profiles_provider_supported", sql`${table.provider} = 'system'`),
    check(
      "voice_profiles_voice_id_nonempty",
      sql`${table.voiceId} IS NULL OR length(btrim(${table.voiceId})) > 0`,
    ),
    check(
      "voice_profiles_language_nonempty",
      sql`length(btrim(${table.language})) > 0`,
    ),
    check("voice_profiles_rate_range", sql`${table.rate} BETWEEN 50 AND 200`),
    check("voice_profiles_pitch_range", sql`${table.pitch} BETWEEN 0 AND 200`),
    check("voice_profiles_volume_range", sql`${table.volume} BETWEEN 0 AND 100`),
    check("voice_profiles_version_positive", sql`${table.version} > 0`),
  ],
);

export const reflectionPreferences = pgTable(
  "reflection_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    goals: jsonb("goals").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    avoidTopics: jsonb("avoid_topics")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    style: text("style")
      .$type<ReflectionStyle>()
      .notNull()
      .default("balanced"),
    maxQuestions: integer("max_questions").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "reflection_preferences_style_supported",
      sql`${table.style} IN ('gentle', 'balanced', 'challenging')`,
    ),
    check(
      "reflection_preferences_max_questions_range",
      sql`${table.maxQuestions} BETWEEN 1 AND 3`,
    ),
    check("reflection_preferences_version_positive", sql`${table.version} > 0`),
  ],
);

export const proactivityPreferences = pgTable(
  "proactivity_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    maxMessagesPerDay: integer("max_messages_per_day").notNull().default(1),
    minCooldownHours: integer("min_cooldown_hours").notNull().default(72),
    checkinAfterDays: integer("checkin_after_days").notNull().default(3),
    allowedReasons: jsonb("allowed_reasons")
      .$type<ProactivityReason[]>()
      .notNull()
      .default(sql`'["goal_followup", "checkin"]'::jsonb`),
    pausedUntil: timestamp("paused_until", { withTimezone: true, mode: "date" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "proactivity_preferences_daily_budget_range",
      sql`${table.maxMessagesPerDay} BETWEEN 1 AND 3`,
    ),
    check(
      "proactivity_preferences_cooldown_range",
      sql`${table.minCooldownHours} BETWEEN 6 AND 168`,
    ),
    check(
      "proactivity_preferences_checkin_days_range",
      sql`${table.checkinAfterDays} BETWEEN 1 AND 30`,
    ),
    check(
      "proactivity_preferences_allowed_reasons_array",
      sql`jsonb_typeof(${table.allowedReasons}) = 'array' AND ${table.allowedReasons} <@ '["goal_followup", "checkin"]'::jsonb`,
    ),
    check("proactivity_preferences_version_positive", sql`${table.version} > 0`),
  ],
);

export const pluginInstallations = pgTable(
  "plugin_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    installedVersion: text("installed_version").notNull(),
    status: text("status")
      .$type<PluginInstallationStatus>()
      .notNull()
      .default("disabled"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plugin_installations_user_plugin_unique").on(
      table.userId,
      table.pluginId,
    ),
    index("plugin_installations_user_status_idx").on(table.userId, table.status),
    check(
      "plugin_installations_plugin_id_nonempty",
      sql`length(btrim(${table.pluginId})) BETWEEN 3 AND 100`,
    ),
    check(
      "plugin_installations_version_nonempty",
      sql`length(btrim(${table.installedVersion})) BETWEEN 5 AND 40`,
    ),
    check(
      "plugin_installations_status_supported",
      sql`${table.status} IN ('enabled', 'disabled', 'incompatible')`,
    ),
    check("plugin_installations_version_positive", sql`${table.version} > 0`),
  ],
);

export const pluginCapabilityGrants = pgTable(
  "plugin_capability_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    capabilityId: text("capability_id").notNull(),
    pluginVersion: text("plugin_version").notNull(),
    status: text("status")
      .$type<PluginCapabilityGrantStatus>()
      .notNull()
      .default("revoked"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plugin_capability_grants_user_plugin_capability_unique").on(
      table.userId,
      table.pluginId,
      table.capabilityId,
    ),
    index("plugin_capability_grants_user_plugin_idx").on(
      table.userId,
      table.pluginId,
    ),
    check(
      "plugin_capability_grants_capability_supported",
      sql`${table.capabilityId} IN ('model.generate', 'storage.read-write', 'task.create-draft')`,
    ),
    check(
      "plugin_capability_grants_plugin_version_nonempty",
      sql`length(btrim(${table.pluginVersion})) BETWEEN 5 AND 40`,
    ),
    check(
      "plugin_capability_grants_status_supported",
      sql`${table.status} IN ('granted', 'revoked')`,
    ),
    check("plugin_capability_grants_version_positive", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.userId, table.pluginId],
      foreignColumns: [pluginInstallations.userId, pluginInstallations.pluginId],
      name: "plugin_capability_grants_installation_fk",
    }).onDelete("cascade"),
  ],
);

export const pluginStorageEntries = pgTable(
  "plugin_storage_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    byteSize: integer("byte_size").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plugin_storage_entries_user_plugin_key_unique").on(
      table.userId,
      table.pluginId,
      table.key,
    ),
    index("plugin_storage_entries_user_plugin_updated_idx").on(
      table.userId,
      table.pluginId,
      table.updatedAt,
    ),
    check(
      "plugin_storage_entries_key_valid",
      sql`length(${table.key}) BETWEEN 1 AND 120 AND ${table.key} ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$'`,
    ),
    check(
      "plugin_storage_entries_byte_size_range",
      sql`${table.byteSize} BETWEEN 1 AND 65536`,
    ),
    check("plugin_storage_entries_version_positive", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.userId, table.pluginId],
      foreignColumns: [pluginInstallations.userId, pluginInstallations.pluginId],
      name: "plugin_storage_entries_installation_fk",
    }).onDelete("cascade"),
  ],
);

export const pluginQuotaUsage = pgTable(
  "plugin_quota_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    capabilityId: text("capability_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true, mode: "date" })
      .notNull(),
    usedUnits: integer("used_units").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plugin_quota_usage_scope_period_unique").on(
      table.userId,
      table.pluginId,
      table.capabilityId,
      table.periodStart,
    ),
    index("plugin_quota_usage_user_period_idx").on(
      table.userId,
      table.periodStart,
    ),
    check(
      "plugin_quota_usage_capability_supported",
      sql`${table.capabilityId} IN ('model.generate', 'storage.read-write', 'task.create-draft')`,
    ),
    check("plugin_quota_usage_used_nonnegative", sql`${table.usedUnits} >= 0`),
    foreignKey({
      columns: [table.userId, table.pluginId],
      foreignColumns: [pluginInstallations.userId, pluginInstallations.pluginId],
      name: "plugin_quota_usage_installation_fk",
    }).onDelete("cascade"),
  ],
);

export const pluginCapabilityAudit = pgTable(
  "plugin_capability_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    capabilityId: text("capability_id").notNull(),
    operation: text("operation").notNull(),
    execution: text("execution").notNull(),
    runId: text("run_id"),
    outcome: text("outcome")
      .$type<PluginCapabilityAuditOutcome>()
      .notNull(),
    errorCode: text("error_code"),
    units: integer("units").notNull().default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("plugin_capability_audit_request_unique").on(table.requestId),
    index("plugin_capability_audit_user_plugin_created_idx").on(
      table.userId,
      table.pluginId,
      table.createdAt,
    ),
    check(
      "plugin_capability_audit_capability_supported",
      sql`${table.capabilityId} IN ('model.generate', 'storage.read-write', 'task.create-draft')`,
    ),
    check(
      "plugin_capability_audit_operation_nonempty",
      sql`length(btrim(${table.operation})) BETWEEN 1 AND 80`,
    ),
    check(
      "plugin_capability_audit_execution_supported",
      sql`${table.execution} IN ('foreground', 'background', 'authorization')`,
    ),
    check(
      "plugin_capability_audit_outcome_supported",
      sql`${table.outcome} IN ('started', 'succeeded', 'denied', 'failed')`,
    ),
    check("plugin_capability_audit_units_nonnegative", sql`${table.units} >= 0`),
    check(
      "plugin_capability_audit_duration_nonnegative",
      sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
    ),
    check(
      "plugin_capability_audit_completion_state",
      sql`(${table.outcome} = 'started' AND ${table.completedAt} IS NULL) OR (${table.outcome} <> 'started' AND ${table.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").$type<GameSessionKind>().notNull(),
    status: text("status").$type<GameSessionStatus>().notNull().default("setup"),
    worldName: text("world_name").notNull(),
    worldPremise: text("world_premise").notNull(),
    worldTone: text("world_tone").notNull(),
    worldRules: jsonb("world_rules").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    safetyBoundaries: jsonb("safety_boundaries")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Membership is verified by GameSessionRepository. Keeping this FK-free
    // avoids a game_sessions/game_turns dependency cycle while parent links
    // inside the turn tree remain enforced.
    activeLeafTurnId: uuid("active_leaf_turn_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_sessions_user_updated_idx").on(table.userId, table.updatedAt),
    check(
      "game_sessions_kind_supported",
      sql`${table.kind} IN ('roleplay', 'tabletop', 'interactive-story')`,
    ),
    check(
      "game_sessions_status_supported",
      sql`${table.status} IN ('setup', 'active', 'paused', 'archived')`,
    ),
    check("game_sessions_title_length", sql`length(btrim(${table.title})) BETWEEN 1 AND 120`),
    check("game_sessions_world_name_length", sql`length(btrim(${table.worldName})) BETWEEN 1 AND 120`),
    check("game_sessions_world_premise_length", sql`length(btrim(${table.worldPremise})) BETWEEN 1 AND 4000`),
    check("game_sessions_world_tone_length", sql`length(btrim(${table.worldTone})) BETWEEN 1 AND 500`),
    check("game_sessions_version_positive", sql`${table.version} > 0`),
  ],
);

export const gameCharacters = pgTable(
  "game_characters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    controller: text("controller").$type<GameCharacterController>().notNull(),
    description: text("description").notNull(),
    personality: text("personality").notNull().default(""),
    goals: jsonb("goals").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    boundaries: jsonb("boundaries").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    attributes: jsonb("attributes")
      .$type<GameCharacterAttributes>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    maxHealth: integer("max_health").notNull().default(10),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_characters_session_created_idx").on(table.sessionId, table.createdAt),
    check("game_characters_name_length", sql`length(btrim(${table.name})) BETWEEN 1 AND 120`),
    check("game_characters_role_length", sql`length(btrim(${table.role})) BETWEEN 1 AND 120`),
    check(
      "game_characters_controller_supported",
      sql`${table.controller} IN ('user', 'ai', 'shared')`,
    ),
    check("game_characters_description_length", sql`length(btrim(${table.description})) BETWEEN 1 AND 2000`),
    check("game_characters_personality_length", sql`length(${table.personality}) <= 1200`),
    check("game_characters_attributes_object", sql`jsonb_typeof(${table.attributes}) = 'object'`),
    check("game_characters_max_health_positive", sql`${table.maxHealth} BETWEEN 1 AND 1000000`),
    check("game_characters_version_positive", sql`${table.version} > 0`),
  ],
);

export const gameTurns = pgTable(
  "game_turns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    parentTurnId: uuid("parent_turn_id").references(
      (): AnyPgColumn => gameTurns.id,
      { onDelete: "set null" },
    ),
    playerContent: text("player_content").notNull(),
    assistantContent: text("assistant_content").notNull(),
    model: text("model").notNull(),
    statePatch: jsonb("state_patch")
      .$type<GameStatePatch>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    stateSnapshot: jsonb("state_snapshot")
      .$type<GameState>()
      .notNull()
      .default(sql`'{"scene":"","sceneFacts":[],"sceneExits":[],"objectives":[],"flags":{},"resources":{},"inventory":{},"characters":{},"items":{}}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_turns_session_created_idx").on(table.sessionId, table.createdAt),
    index("game_turns_parent_idx").on(table.parentTurnId),
    uniqueIndex("game_turns_id_session_unique").on(table.id, table.sessionId),
    check(
      "game_turns_player_content_length",
      sql`length(btrim(${table.playerContent})) BETWEEN 1 AND 8000`,
    ),
    check(
      "game_turns_assistant_content_length",
      sql`length(btrim(${table.assistantContent})) BETWEEN 1 AND 100000`,
    ),
    check(
      "game_turns_model_length",
      sql`length(btrim(${table.model})) BETWEEN 1 AND 200`,
    ),
  ],
);

export const gameEvents = pgTable(
  "game_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").notNull(),
    kind: text("kind").$type<"dice_roll" | "rule_check">().notNull(),
    sequence: integer("sequence").notNull(),
    payload: jsonb("payload").$type<GameDiceRoll | GameRuleCheck>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_events_session_created_idx").on(table.sessionId, table.createdAt),
    uniqueIndex("game_events_turn_sequence_unique").on(table.turnId, table.sequence),
    foreignKey({
      columns: [table.turnId, table.sessionId],
      foreignColumns: [gameTurns.id, gameTurns.sessionId],
      name: "game_events_turn_session_fk",
    }).onDelete("cascade"),
    check("game_events_kind_supported", sql`${table.kind} IN ('dice_roll', 'rule_check')`),
    check("game_events_sequence_nonnegative", sql`${table.sequence} >= 0`),
  ],
);

export const gameCheckpoints = pgTable(
  "game_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").notNull(),
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    stateSnapshot: jsonb("state_snapshot").$type<GameState>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("game_checkpoints_session_created_idx").on(table.sessionId, table.createdAt),
    foreignKey({
      columns: [table.turnId, table.sessionId],
      foreignColumns: [gameTurns.id, gameTurns.sessionId],
      name: "game_checkpoints_turn_session_fk",
    }).onDelete("cascade"),
    check("game_checkpoints_name_length", sql`length(btrim(${table.name})) BETWEEN 1 AND 120`),
    check("game_checkpoints_note_length", sql`length(${table.note}) <= 500`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mode: conversationMode("mode").notNull().default("auto"),
    summary: text("summary"),
    // The repository will verify that the selected leaf belongs to this
    // conversation. Keeping this FK-free avoids a conversations/messages
    // dependency cycle while the message parent relation stays enforced.
    activeLeafMessageId: uuid("active_leaf_message_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
    check("conversations_version_positive", sql`${table.version} > 0`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    parentMessageId: uuid("parent_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    status: messageStatus("status").notNull().default("complete"),
    model: text("model"),
    citations: jsonb("citations")
      .$type<MessageCitation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    verification: jsonb("verification").$type<ResponseVerification | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messages_parent_idx").on(table.parentMessageId),
  ],
);

export const memoryCandidates = pgTable(
  "memory_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<MemoryCandidateKind>().notNull(),
    content: text("content").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    sensitivity: text("sensitivity").$type<MemorySensitivity>().notNull(),
    confidence: integer("confidence").notNull(),
    reason: text("reason").notNull(),
    status: text("status")
      .$type<MemoryCandidateStatus>()
      .notNull()
      .default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_candidates_source_message_unique").on(
      table.sourceMessageId,
    ),
    index("memory_candidates_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    check(
      "memory_candidates_kind_supported",
      sql`${table.kind} IN ('preference', 'goal', 'profile', 'fact')`,
    ),
    check(
      "memory_candidates_sensitivity_supported",
      sql`${table.sensitivity} IN ('low', 'personal', 'sensitive')`,
    ),
    check(
      "memory_candidates_status_supported",
      sql`${table.status} IN ('pending', 'confirmed', 'rejected')`,
    ),
    check(
      "memory_candidates_confidence_range",
      sql`${table.confidence} BETWEEN 0 AND 100`,
    ),
    check("memory_candidates_version_positive", sql`${table.version} > 0`),
    check(
      "memory_candidates_resolution_state",
      sql`(${table.status} = 'pending' AND ${table.resolvedAt} IS NULL) OR (${table.status} IN ('confirmed', 'rejected') AND ${table.resolvedAt} IS NOT NULL)`,
    ),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => memoryCandidates.id, { onDelete: "restrict" }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<MemoryCandidateKind>().notNull(),
    content: text("content").notNull(),
    sensitivity: text("sensitivity")
      .$type<MemorySensitivity>()
      .notNull()
      .default("low"),
    pinned: boolean("pinned").notNull().default(false),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    useCount: integer("use_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_items_candidate_unique").on(table.candidateId),
    index("memory_items_user_created_idx").on(table.userId, table.createdAt),
    index("memory_items_user_pinned_updated_idx").on(
      table.userId,
      table.pinned,
      table.updatedAt,
    ),
    check(
      "memory_items_kind_supported",
      sql`${table.kind} IN ('preference', 'goal', 'profile', 'fact')`,
    ),
    check(
      "memory_items_sensitivity_supported",
      sql`${table.sensitivity} IN ('low', 'personal', 'sensitive')`,
    ),
    check("memory_items_content_nonempty", sql`length(btrim(${table.content})) > 0`),
    check("memory_items_use_count_nonnegative", sql`${table.useCount} >= 0`),
    check("memory_items_version_positive", sql`${table.version} > 0`),
  ],
);

export const memoryPalaces = pgTable("memory_palaces", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(), purpose: text("purpose").$type<"navigation" | "learning">().notNull(), rooms: jsonb("rooms").$type<PalaceRoom[]>().notNull().default(sql`'[]'::jsonb`),
  version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("memory_palaces_owner_updated_idx").on(table.userId, table.updatedAt),
  check("memory_palaces_title_check", sql`length(btrim(${table.title})) BETWEEN 1 AND 120`),
  check("memory_palaces_purpose_check", sql`${table.purpose} IN ('navigation','learning')`),
  check("memory_palaces_rooms_check", sql`jsonb_typeof(${table.rooms}) = 'array' AND jsonb_array_length(${table.rooms}) <= 6`),
  check("memory_palaces_version_check", sql`${table.version} > 0`),
]);

export const conversationSummaries = pgTable("conversation_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(), mode: text("mode").notNull(), policy: text("policy").notNull(), contextStamp: text("context_stamp").notNull(), modelKey: text("model_key").notNull(),
  settings: jsonb("settings").$type<SummarySettings>().notNull(), sources: jsonb("sources").$type<SourceRevision[]>().notNull(), payload: jsonb("payload").$type<SummaryPayload>(),
  status: text("status").$type<"pending" | "draft" | "approved" | "failed">().notNull(), version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("conversation_summaries_fingerprint_idx").on(table.conversationId, table.fingerprint), index("conversation_summaries_owner_idx").on(table.userId, table.conversationId)]);

export const promptRuns = pgTable(
  "prompt_runs",
  {
    id: uuid("id").primaryKey(),
    summaryUsage: jsonb("summary_usage").$type<SummaryUse>(),
    knowledgeRetrieval: jsonb("knowledge_retrieval").$type<KnowledgeRetrievalAudit>(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    activeLeafMessageId: uuid("active_leaf_message_id"),
    trigger: text("trigger").notNull(),
    envelopeSchemaVersion: integer("envelope_schema_version").notNull(),
    composerVersion: text("composer_version").notNull(),
    contentHash: text("content_hash").notNull(),
    provider: text("provider").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    messageCount: integer("message_count").notNull(),
    containsMemory: boolean("contains_memory").notNull().default(false),
    status: promptRunStatus("status").notNull().default("started"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("prompt_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check("prompt_runs_trigger_supported", sql`${table.trigger} IN ('send', 'retry')`),
    check("prompt_runs_schema_version_positive", sql`${table.envelopeSchemaVersion} > 0`),
    check("prompt_runs_message_count_positive", sql`${table.messageCount} > 0`),
    check("prompt_runs_content_hash_sha256", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const memoryUsages = pgTable(
  "memory_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memoryItemId: uuid("memory_item_id").notNull(),
    promptRunId: uuid("prompt_run_id")
      .notNull()
      .references(() => promptRuns.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    queryMessageId: uuid("query_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    rank: integer("rank").notNull(),
    score: integer("score").notNull(),
    estimatedTokens: integer("estimated_tokens").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_usages_run_item_unique").on(
      table.promptRunId,
      table.memoryItemId,
    ),
    index("memory_usages_item_created_idx").on(
      table.memoryItemId,
      table.createdAt,
    ),
    check("memory_usages_rank_positive", sql`${table.rank} > 0`),
    check("memory_usages_score_positive", sql`${table.score} > 0`),
    check(
      "memory_usages_tokens_positive",
      sql`${table.estimatedTokens} > 0`,
    ),
  ],
);

export const conversationImports = pgTable(
  "conversation_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_imports_source_unique").on(
      table.userId,
      table.source,
      table.sourceId,
    ),
    index("conversation_imports_conversation_idx").on(table.conversationId),
  ],
);

export const modelCredentials = pgTable(
  "model_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    apiKeyHint: text("api_key_hint").notNull(),
    encryptionKeyVersion: integer("encryption_key_version")
      .notNull()
      .default(1),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("model_credentials_user_unique").on(table.userId),
    check(
      "model_credentials_provider_nonempty",
      sql`length(btrim(${table.provider})) > 0`,
    ),
    check(
      "model_credentials_encryption_key_version_positive",
      sql`${table.encryptionKeyVersion} > 0`,
    ),
    check("model_credentials_version_positive", sql`${table.version} > 0`),
  ],
);

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    prompt: text("prompt"),
    kind: text("kind").$type<TaskKind>().notNull().default("reminder"),
    scheduleType: taskScheduleType("schedule_type").notNull(),
    scheduleValue: jsonb("schedule_value").$type<TaskScheduleValue>().notNull(),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
    status: taskStatus("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("scheduled_tasks_user_status_next_idx").on(
      table.userId,
      table.status,
      table.nextRunAt,
    ),
    check("scheduled_tasks_version_positive", sql`${table.version} > 0`),
    check(
      "scheduled_tasks_kind_supported",
      sql`${table.kind} IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question')`,
    ),
    check(
      "scheduled_tasks_generated_prompt_required",
      sql`${table.kind} = 'reminder' OR coalesce(length(btrim(${table.prompt})), 0) > 0`,
    ),
    check(
      "scheduled_tasks_active_next_run",
      sql`${table.status} <> 'active' OR ${table.nextRunAt} IS NOT NULL`,
    ),
  ],
);

export const taskRuns = pgTable(
  "task_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => scheduledTasks.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: taskRunStatus("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    claimedBy: text("claimed_by"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    resultSummary: text("result_summary"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    notifiedAt: timestamp("notified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("task_runs_task_scheduled_unique").on(
      table.taskId,
      table.scheduledFor,
    ),
    index("task_runs_status_scheduled_idx").on(
      table.status,
      table.scheduledFor,
    ),
    check("task_runs_attempt_positive", sql`${table.attempt} > 0`),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => scheduledTasks.id, {
      onDelete: "set null",
    }),
    taskRunId: uuid("task_run_id").references(() => taskRuns.id, {
      onDelete: "set null",
    }),
    source: text("source").$type<InboxSource>().notNull().default("reminder"),
    title: text("title").notNull(),
    body: text("body"),
    briefingSources: jsonb("briefing_sources").$type<BriefingSourceSignal[]>(),
    reflectionQuestions: jsonb("reflection_questions")
      .$type<ReflectionQuestionSignal[]>(),
    proactivityReason: text("proactivity_reason").$type<ProactivityReason>(),
    proactivityRationale: text("proactivity_rationale"),
    feedback: text("feedback").$type<BriefingFeedback>(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: inboxItemStatus("status").notNull().default("unread"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    pushPlannedAt: timestamp("push_planned_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inbox_items_task_run_unique").on(table.taskRunId),
    index("inbox_items_user_status_occurred_idx").on(
      table.userId,
      table.status,
      table.occurredAt,
    ),
    check(
      "inbox_items_source_supported",
      sql`${table.source} IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question', 'proactive_checkin')`,
    ),
    check(
      "inbox_items_feedback_supported",
      sql`${table.feedback} IS NULL OR (${table.source} = 'personal_briefing' AND ${table.feedback} IN ('helpful', 'not_relevant', 'duplicate'))`,
    ),
    check(
      "inbox_items_briefing_sources_supported",
      sql`${table.briefingSources} IS NULL OR ${table.source} = 'personal_briefing'`,
    ),
    check(
      "inbox_items_reflection_questions_supported",
      sql`${table.reflectionQuestions} IS NULL OR ${table.source} IN ('personal_briefing', 'reflection_question')`,
    ),
    check(
      "inbox_items_proactivity_metadata_supported",
      sql`(${table.source} = 'proactive_checkin' AND ${table.proactivityReason} IN ('goal_followup', 'checkin') AND coalesce(length(btrim(${table.proactivityRationale})), 0) > 0) OR (${table.source} <> 'proactive_checkin' AND ${table.proactivityReason} IS NULL AND ${table.proactivityRationale} IS NULL)`,
    ),
    check(
      "inbox_items_read_state",
      sql`(${table.status} = 'unread' AND ${table.readAt} IS NULL) OR (${table.status} = 'read' AND ${table.readAt} IS NOT NULL)`,
    ),
  ],
);

export const proactivityLedger = pgTable(
  "proactivity_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inboxItemId: uuid("inbox_item_id").references(() => inboxItems.id, {
      onDelete: "set null",
    }),
    reason: text("reason").$type<ProactivityReason>().notNull(),
    triggerKey: text("trigger_key").notNull(),
    triggerRefId: uuid("trigger_ref_id"),
    rationale: text("rationale").notNull(),
    policySnapshot: jsonb("policy_snapshot")
      .$type<ProactivityPolicySnapshot>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("proactivity_ledger_user_trigger_unique").on(
      table.userId,
      table.triggerKey,
    ),
    uniqueIndex("proactivity_ledger_inbox_unique").on(table.inboxItemId),
    index("proactivity_ledger_user_created_idx").on(table.userId, table.createdAt),
    check(
      "proactivity_ledger_reason_supported",
      sql`${table.reason} IN ('goal_followup', 'checkin')`,
    ),
    check(
      "proactivity_ledger_trigger_key_nonempty",
      sql`length(btrim(${table.triggerKey})) > 0`,
    ),
    check(
      "proactivity_ledger_rationale_nonempty",
      sql`length(btrim(${table.rationale})) > 0`,
    ),
  ],
);

export const pushVapidConfigurations = pgTable("push_vapid_configurations", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  subject: text("subject").notNull(),
  encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "push_vapid_configurations_key_version_positive",
    sql`${table.encryptionKeyVersion} > 0`,
  ),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(true),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("08:00"),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "notification_preferences_quiet_start_time",
    sql`${table.quietStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
  ),
  check(
    "notification_preferences_quiet_end_time",
    sql`${table.quietEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
  ),
  check(
    "notification_preferences_timezone_shanghai",
    sql`${table.timezone} = 'Asia/Shanghai'`,
  ),
  check("notification_preferences_version_positive", sql`${table.version} > 0`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("web-push"),
  endpointHash: text("endpoint_hash").notNull(),
  encryptedSubscription: text("encrypted_subscription").notNull(),
  deviceLabel: text("device_label").notNull(),
  status: pushSubscriptionStatus("status").notNull().default("active"),
  failureCount: integer("failure_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("push_subscriptions_user_endpoint_unique").on(
    table.userId,
    table.endpointHash,
  ),
  index("push_subscriptions_user_status_idx").on(table.userId, table.status),
  check("push_subscriptions_failure_count_nonnegative", sql`${table.failureCount} >= 0`),
]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inboxItemId: uuid("inbox_item_id")
    .notNull()
    .references(() => inboxItems.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  status: notificationDeliveryStatus("status").notNull().default("pending"),
  availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  attempt: integer("attempt").notNull().default(0),
  claimedBy: text("claimed_by"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("notification_deliveries_inbox_subscription_unique").on(
    table.inboxItemId,
    table.subscriptionId,
  ),
  index("notification_deliveries_status_available_idx").on(
    table.status,
    table.availableAt,
  ),
  check("notification_deliveries_attempt_nonnegative", sql`${table.attempt} >= 0`),
]);

export type UserRecord = typeof users.$inferSelect;
export type ReadingProfileRecord = typeof readingProfiles.$inferSelect;
export type PersonaProfileRecord = typeof personaProfiles.$inferSelect;
export type VoiceProfileRecord = typeof voiceProfiles.$inferSelect;
export type ReflectionPreferenceRecord = typeof reflectionPreferences.$inferSelect;
export type ProactivityPreferenceRecord = typeof proactivityPreferences.$inferSelect;
export type ProactivityLedgerRecord = typeof proactivityLedger.$inferSelect;
export type PluginInstallationRecord = typeof pluginInstallations.$inferSelect;
export type PluginCapabilityGrantRecord = typeof pluginCapabilityGrants.$inferSelect;
export type PluginStorageEntryRecord = typeof pluginStorageEntries.$inferSelect;
export type PluginQuotaUsageRecord = typeof pluginQuotaUsage.$inferSelect;
export type PluginCapabilityAuditRecord = typeof pluginCapabilityAudit.$inferSelect;
export type GameSessionRecord = typeof gameSessions.$inferSelect;
export type GameCharacterRecord = typeof gameCharacters.$inferSelect;
export type GameTurnRecord = typeof gameTurns.$inferSelect;
export type GameEventRecord = typeof gameEvents.$inferSelect;
export type GameCheckpointRecord = typeof gameCheckpoints.$inferSelect;
export const knowledgeCollections = pgTable("knowledge_collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  module: text("module").$type<typeof KNOWLEDGE_MODULES[number]>().notNull(),
  title: text("title").notNull(), description: text("description").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("knowledge_collections_id_owner_unique").on(table.id, table.userId), index("knowledge_collections_owner_idx").on(table.userId), check("knowledge_collection_version", sql`${table.version} > 0`), check("knowledge_collection_module", sql`${table.module} IN ('professional','reflection','news','reading','tasks','memorization','problem-solving','game')`)]);

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull(),
  collectionId: uuid("collection_id").notNull(), sourceKey: text("source_key").notNull(),
  title: text("title").notNull(), format: text("format").$type<"text" | "markdown">().notNull(),
  content: text("content").notNull(), contentHash: text("content_hash").notNull(),
  sourceUrl: text("source_url").notNull().default(""), fileName: text("file_name").notNull().default(""),
  chunkStrategy: text("chunk_strategy").notNull(), version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [foreignKey({ columns: [table.collectionId, table.userId], foreignColumns: [knowledgeCollections.id, knowledgeCollections.userId] }).onDelete("cascade"), uniqueIndex("knowledge_document_source_unique").on(table.collectionId, table.sourceKey), index("knowledge_document_owner_collection_idx").on(table.userId, table.collectionId), check("knowledge_document_version", sql`${table.version} > 0`), check("knowledge_document_format", sql`${table.format} IN ('text','markdown')`), check("knowledge_document_content", sql`length(btrim(${table.content})) > 0 AND length(${table.content}) <= 100000 AND octet_length(${table.content}) <= 300000`)]);

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").defaultRandom().primaryKey(), documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
  documentVersion: integer("document_version").notNull(), ordinal: integer("ordinal").notNull(),
  content: text("content").notNull(), contentHash: text("content_hash").notNull(),
  startLine: integer("start_line").notNull(), endLine: integer("end_line").notNull(), heading: text("heading").notNull(),
}, (table) => [uniqueIndex("knowledge_chunk_document_ordinal_unique").on(table.documentId, table.ordinal), check("knowledge_chunk_position", sql`${table.documentVersion} > 0 AND ${table.ordinal} >= 0 AND ${table.startLine} > 0 AND ${table.endLine} >= ${table.startLine}`)]);

export type KnowledgeCollectionRecord = typeof knowledgeCollections.$inferSelect;
export type KnowledgeDocumentRecord = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeChunkRecord = typeof knowledgeChunks.$inferSelect;
export type ConversationRecord = typeof conversations.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type MemoryCandidateRecord = typeof memoryCandidates.$inferSelect;
export type MemoryItemRecord = typeof memoryItems.$inferSelect;
export type MemoryUsageRecord = typeof memoryUsages.$inferSelect;
export type PromptRunRecord = typeof promptRuns.$inferSelect;
export type ConversationImportRecord = typeof conversationImports.$inferSelect;
export type ModelCredentialRecord = typeof modelCredentials.$inferSelect;
export type ScheduledTaskRecord = typeof scheduledTasks.$inferSelect;
export type TaskRunRecord = typeof taskRuns.$inferSelect;
export type InboxItemRecord = typeof inboxItems.$inferSelect;
export type PushVapidConfigurationRecord = typeof pushVapidConfigurations.$inferSelect;
export type NotificationPreferenceRecord = typeof notificationPreferences.$inferSelect;
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
export type NotificationDeliveryRecord = typeof notificationDeliveries.$inferSelect;
