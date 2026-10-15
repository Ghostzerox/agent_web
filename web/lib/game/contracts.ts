import { z } from "zod";
import { gameRuleCheckRequestSchema } from "@/lib/game/checks";
import { gameDiceRequestSchema } from "@/lib/game/dice";
import { gameCharacterAttributesSchema } from "@/lib/game/state";
import { gameToolRequestSchema } from "./toolkit";

export const GAME_SESSION_KINDS = [
  "roleplay",
  "tabletop",
  "interactive-story",
] as const;

export const GAME_SESSION_STATUSES = ["setup", "active", "paused", "archived"] as const;
export const GAME_CHARACTER_CONTROLLERS = ["user", "ai", "shared"] as const;

export type GameSessionKind = (typeof GAME_SESSION_KINDS)[number];
export type GameSessionStatus = (typeof GAME_SESSION_STATUSES)[number];
export type GameCharacterController = (typeof GAME_CHARACTER_CONTROLLERS)[number];

const uniqueLines = (limit: number) =>
  z
    .array(z.string().trim().min(1).max(300))
    .max(limit)
    .transform((items) => [...new Set(items)]);

export const gameWorldInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    premise: z.string().trim().min(1).max(4_000),
    tone: z.string().trim().min(1).max(500),
    rules: uniqueLines(20),
    boundaries: uniqueLines(20),
  })
  .strict();

export const gameCharacterInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: z.string().trim().min(1).max(120),
    controller: z.enum(GAME_CHARACTER_CONTROLLERS),
    description: z.string().trim().min(1).max(2_000),
    personality: z.string().trim().max(1_200),
    goals: uniqueLines(20),
    boundaries: uniqueLines(20),
    attributes: gameCharacterAttributesSchema.default({}),
    maxHealth: z.number().int().min(1).max(1_000_000).default(10),
  })
  .strict();

export const createGameSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(GAME_SESSION_KINDS),
    world: gameWorldInputSchema,
    initialCharacter: gameCharacterInputSchema.nullable().default(null),
  })
  .strict();

export const updateGameSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(GAME_SESSION_KINDS),
    world: gameWorldInputSchema,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const deleteGameSessionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const createGameCharacterSchema = gameCharacterInputSchema
  .extend({ expectedSessionVersion: z.number().int().positive() })
  .strict();

export const updateGameCharacterSchema = gameCharacterInputSchema
  .extend({
    expectedSessionVersion: z.number().int().positive(),
    expectedCharacterVersion: z.number().int().positive(),
  })
  .strict();

export const deleteGameCharacterSchema = z
  .object({
    expectedSessionVersion: z.number().int().positive(),
    expectedCharacterVersion: z.number().int().positive(),
  })
  .strict();

export const updateGameSessionStatusSchema = z
  .object({
    status: z.enum(["active", "paused"]),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const createGameTurnSchema = z
  .object({
    content: z.string().trim().min(1).max(8_000),
    parentTurnId: z.uuid().nullable(),
    expectedVersion: z.number().int().positive(),
    diceRequests: z.array(gameDiceRequestSchema).max(5).default([]),
    checkRequest: gameRuleCheckRequestSchema.nullable().default(null),
    requestId: z.uuid().optional(),
    toolRequest: gameToolRequestSchema.optional(),
    toolOnly: z.boolean().optional(),
  })
  .strict().superRefine((input, context) => {
    if (input.toolRequest && !input.requestId) context.addIssue({ code: "custom", path: ["requestId"], message: "工具请求必须有幂等 ID。" });
    if (input.toolOnly && (!input.toolRequest || input.diceRequests.length || input.checkRequest)) context.addIssue({ code: "custom", path: ["toolOnly"], message: "纯工具回合只运行一个已选牌堆/随机表工具。" });
  });

export const createGameCheckpointSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).default(""),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const mutateGameCheckpointSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const exportGameSessionSchema = z
  .object({ format: z.enum(["json", "markdown"]) })
  .strict();

export type GameWorldInput = z.infer<typeof gameWorldInputSchema>;
export type GameCharacterInput = z.infer<typeof gameCharacterInputSchema>;
export type CreateGameSessionRequest = z.infer<typeof createGameSessionSchema>;
export type UpdateGameSessionRequest = z.infer<typeof updateGameSessionSchema>;
export type UpdateGameSessionStatusRequest = z.infer<
  typeof updateGameSessionStatusSchema
>;
export type CreateGameTurnRequest = z.infer<typeof createGameTurnSchema>;
export type GameSessionExportFormat = z.infer<
  typeof exportGameSessionSchema
>["format"];
