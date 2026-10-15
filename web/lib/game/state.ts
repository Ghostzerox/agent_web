import { z } from "zod";
import { gameToolkitSchema } from "./toolkit";

export const gameStateKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N}_.:-]+$/u, "State keys may only contain letters, numbers, _, ., : or -.");
const stateScalarSchema = z.union([
  z.boolean(),
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.string().trim().max(300),
]);
const stateCountSchema = z.number().int().min(0).max(1_000_000);
const stateDeltaSchema = z.number().int().min(-1_000_000).max(1_000_000);
const attributeValueSchema = z.number().int().min(-100).max(100);

const limitedRecord = <T extends z.ZodType>(value: T, maxKeys: number) =>
  z.record(gameStateKeySchema, value).refine(
    (record) => Object.keys(record).length <= maxKeys,
    `No more than ${maxKeys} keys are allowed.`,
  );

const uniqueStateKeys = (maxItems: number) =>
  z.array(gameStateKeySchema).max(maxItems).transform((items) => [...new Set(items)]);

const uniqueLines = (maxItems: number, maxLength = 300) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .transform((items) => [...new Set(items)]);

const objectivesSchema = uniqueLines(20);
export const gameCharacterAttributesSchema = limitedRecord(attributeValueSchema, 20);

export const gameCharacterRuntimeSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    health: z.number().int().min(0).max(1_000_000),
    maxHealth: z.number().int().min(1).max(1_000_000),
    attributes: gameCharacterAttributesSchema,
    conditions: uniqueLines(20, 120),
  })
  .strict()
  .refine((value) => value.health <= value.maxHealth, {
    message: "Character health cannot exceed maxHealth.",
    path: ["health"],
  });

export const gameItemDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
    holderCharacterId: z.uuid().nullable(),
    tags: uniqueLines(10, 80),
  })
  .strict();

export const gameStateSchema = z
  .object({
    scene: z.string().trim().max(1_000),
    sceneFacts: uniqueLines(30),
    sceneExits: uniqueLines(20, 120),
    objectives: objectivesSchema,
    flags: limitedRecord(stateScalarSchema, 100),
    resources: limitedRecord(stateCountSchema, 50),
    inventory: limitedRecord(stateCountSchema, 100),
    characters: limitedRecord(gameCharacterRuntimeSchema, 50),
    items: limitedRecord(gameItemDefinitionSchema, 100),
    toolkit: gameToolkitSchema.optional(),
  })
  .strict();

const characterPatchSchema = z
  .object({
    healthDelta: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    setAttributes: gameCharacterAttributesSchema.optional(),
    addConditions: uniqueLines(20, 120).optional(),
    removeConditions: uniqueLines(20, 120).optional(),
  })
  .strict();

export const gameStatePatchSchema = z
  .object({
    scene: z.string().trim().min(1).max(1_000).optional(),
    sceneFacts: uniqueLines(30).optional(),
    sceneExits: uniqueLines(20, 120).optional(),
    objectives: objectivesSchema.optional(),
    setFlags: limitedRecord(stateScalarSchema, 50).optional(),
    removeFlags: uniqueStateKeys(50).optional(),
    adjustResources: limitedRecord(stateDeltaSchema, 50).optional(),
    adjustInventory: limitedRecord(stateDeltaSchema, 100).optional(),
    characterChanges: limitedRecord(characterPatchSchema, 50).optional(),
    upsertItems: limitedRecord(gameItemDefinitionSchema, 100).optional(),
    removeItems: uniqueStateKeys(100).optional(),
  })
  .strict();

export const gameModelTurnSchema = z
  .object({
    narrative: z.string().trim().min(1).max(100_000),
    statePatch: gameStatePatchSchema,
  })
  .strict();

export type GameCharacterAttributes = z.infer<typeof gameCharacterAttributesSchema>;
export type GameCharacterRuntime = z.infer<typeof gameCharacterRuntimeSchema>;
export type GameItemDefinition = z.infer<typeof gameItemDefinitionSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type GameStatePatch = z.infer<typeof gameStatePatchSchema>;
export type GameModelTurn = z.infer<typeof gameModelTurnSchema>;

export type GameCharacterSeed = {
  id: string;
  name: string;
  maxHealth: number;
  attributes: GameCharacterAttributes;
};

export class GameStateValidationError extends Error {
  constructor(
    readonly code: "GAME_OUTPUT_INVALID" | "GAME_STATE_INVALID",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GameStateValidationError";
  }
}

function initialCharacterState(character: GameCharacterSeed): GameCharacterRuntime {
  return {
    name: character.name,
    health: character.maxHealth,
    maxHealth: character.maxHealth,
    attributes: character.attributes,
    conditions: [],
  };
}

export function initialGameState(
  worldName: string,
  worldPremise: string,
  characters: readonly GameCharacterSeed[] = [],
): GameState {
  return gameStateSchema.parse({
    scene: `${worldName}：${worldPremise}`.slice(0, 1_000),
    sceneFacts: [],
    sceneExits: [],
    objectives: [],
    flags: {},
    resources: {},
    inventory: {},
    characters: Object.fromEntries(
      characters.map((character) => [character.id, initialCharacterState(character)]),
    ),
    items: {},
  });
}

export function normalizeGameState(
  value: unknown,
  characters: readonly GameCharacterSeed[] = [],
): GameState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GameStateValidationError("GAME_STATE_INVALID", "The stored game state is invalid.");
  }
  const raw = value as Record<string, unknown>;
  const inventory = raw.inventory && typeof raw.inventory === "object" && !Array.isArray(raw.inventory)
    ? raw.inventory as Record<string, unknown>
    : {};
  const hasRuntimeCharacters = raw.characters !== undefined;
  const rawCharacters = raw.characters && typeof raw.characters === "object" && !Array.isArray(raw.characters)
    ? raw.characters as Record<string, unknown>
    : {};
  const mergedCharacters: Record<string, unknown> = { ...rawCharacters };
  if (!hasRuntimeCharacters) {
    for (const character of characters) {
      mergedCharacters[character.id] = initialCharacterState(character);
    }
  }
  const rawItems = raw.items && typeof raw.items === "object" && !Array.isArray(raw.items)
    ? raw.items as Record<string, unknown>
    : {};
  const mergedItems: Record<string, unknown> = { ...rawItems };
  for (const key of Object.keys(inventory)) {
    mergedItems[key] ??= {
      name: key,
      description: "",
      holderCharacterId: null,
      tags: [],
    };
  }
  const result = gameStateSchema.safeParse({
    ...raw,
    sceneFacts: raw.sceneFacts ?? [],
    sceneExits: raw.sceneExits ?? [],
    characters: mergedCharacters,
    items: mergedItems,
  });
  if (!result.success) {
    throw new GameStateValidationError(
      "GAME_STATE_INVALID",
      "The stored game state cannot be upgraded to the current schema.",
      result.error.issues,
    );
  }
  return result.data;
}

function applyDeltas(
  current: Readonly<Record<string, number>>,
  deltas: Readonly<Record<string, number>> | undefined,
  label: string,
): Record<string, number> {
  const next = { ...current };
  for (const [key, delta] of Object.entries(deltas ?? {})) {
    const value = (next[key] ?? 0) + delta;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
      throw new GameStateValidationError(
        "GAME_STATE_INVALID",
        `${label} “${key}” cannot become negative or exceed the supported range.`,
      );
    }
    if (value === 0) delete next[key];
    else next[key] = value;
  }
  return next;
}

function applyCharacterChanges(
  current: Readonly<Record<string, GameCharacterRuntime>>,
  changes: GameStatePatch["characterChanges"],
): Record<string, GameCharacterRuntime> {
  const next = structuredClone(current) as Record<string, GameCharacterRuntime>;
  for (const [id, change] of Object.entries(changes ?? {})) {
    const character = next[id];
    if (!character) {
      throw new GameStateValidationError(
        "GAME_STATE_INVALID",
        `Character “${id}” is not present on this branch.`,
      );
    }
    const health = character.health + (change.healthDelta ?? 0);
    if (health < 0 || health > character.maxHealth) {
      throw new GameStateValidationError(
        "GAME_STATE_INVALID",
        `Character “${character.name}” health must stay between 0 and maxHealth.`,
      );
    }
    const removed = new Set(change.removeConditions ?? []);
    const conditions = [...new Set([
      ...character.conditions.filter((item) => !removed.has(item)),
      ...(change.addConditions ?? []),
    ])];
    next[id] = gameCharacterRuntimeSchema.parse({
      ...character,
      health,
      attributes: { ...character.attributes, ...(change.setAttributes ?? {}) },
      conditions,
    });
  }
  return next;
}

export function applyGameStatePatch(
  rawCurrent: GameState,
  rawPatch: GameStatePatch,
): GameState {
  const current = normalizeGameState(rawCurrent);
  const patchResult = gameStatePatchSchema.safeParse(rawPatch);
  if (!patchResult.success) {
    throw new GameStateValidationError(
      "GAME_STATE_INVALID",
      "The requested game state patch is invalid.",
      patchResult.error.issues,
    );
  }
  const patch = patchResult.data;
  const flags = { ...current.flags, ...(patch.setFlags ?? {}) };
  for (const key of patch.removeFlags ?? []) delete flags[key];
  const items = { ...current.items, ...(patch.upsertItems ?? {}) };
  for (const key of patch.removeItems ?? []) delete items[key];
  const inventory = applyDeltas(current.inventory, patch.adjustInventory, "Inventory item");
  for (const key of Object.keys(inventory)) {
    if (!items[key]) {
      throw new GameStateValidationError(
        "GAME_STATE_INVALID",
        `Inventory item “${key}” must have a structured item definition.`,
      );
    }
  }
  const characters = applyCharacterChanges(current.characters, patch.characterChanges);
  for (const item of Object.values(items)) {
    if (item.holderCharacterId && !characters[item.holderCharacterId]) {
      throw new GameStateValidationError(
        "GAME_STATE_INVALID",
        `Item holder “${item.holderCharacterId}” is not present on this branch.`,
      );
    }
  }
  const result = gameStateSchema.safeParse({
    scene: patch.scene ?? current.scene,
    sceneFacts: patch.sceneFacts ?? current.sceneFacts,
    sceneExits: patch.sceneExits ?? current.sceneExits,
    objectives: patch.objectives ?? current.objectives,
    flags,
    resources: applyDeltas(current.resources, patch.adjustResources, "Resource"),
    inventory,
    characters,
    items,
    ...(current.toolkit ? { toolkit: current.toolkit } : {}),
  });
  if (!result.success) {
    throw new GameStateValidationError(
      "GAME_STATE_INVALID",
      "The state patch would produce an invalid game state.",
      result.error.issues,
    );
  }
  return result.data;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseGameModelTurn(value: string): GameModelTurn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(value));
  } catch {
    throw new GameStateValidationError(
      "GAME_OUTPUT_INVALID",
      "The model did not return the required structured game turn JSON.",
    );
  }
  const result = gameModelTurnSchema.safeParse(parsed);
  if (!result.success) {
    throw new GameStateValidationError(
      "GAME_OUTPUT_INVALID",
      "The model returned an invalid or unauthorized game state patch.",
      result.error.issues,
    );
  }
  return result.data;
}
