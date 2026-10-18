import { createSeededRandom, SEEDED_RANDOM_ALGORITHM } from "@/lib/shared/random";
import { z } from "zod";

export const GAME_DICE_SIDES = [2, 4, 6, 8, 10, 12, 20, 100] as const;
export const GAME_DICE_ALGORITHM = SEEDED_RANDOM_ALGORITHM;

export const gameDiceRequestSchema = z
  .object({
    count: z.number().int().min(1).max(20),
    sides: z.union(GAME_DICE_SIDES.map((sides) => z.literal(sides))),
    modifier: z.number().int().min(-100).max(100).default(0),
    purpose: z.string().trim().min(1).max(120),
  })
  .strict();

export const gameDiceRollSchema = gameDiceRequestSchema
  .extend({
    notation: z.string().trim().min(2).max(20),
    seed: z.string().trim().min(1).max(200),
    algorithm: z.literal(GAME_DICE_ALGORITHM),
    results: z.array(z.number().int().positive()).min(1).max(20),
    total: z.number().int().min(-100).max(2_100),
  })
  .strict();

export type GameDiceRequest = z.infer<typeof gameDiceRequestSchema>;
export type GameDiceRoll = z.infer<typeof gameDiceRollSchema>;

export function diceNotation(request: GameDiceRequest): string {
  const modifier = request.modifier === 0
    ? ""
    : request.modifier > 0
      ? `+${request.modifier}`
      : String(request.modifier);
  return `${request.count}d${request.sides}${modifier}`;
}

export function rollGameDice(
  rawRequest: GameDiceRequest,
  seed: string,
): GameDiceRoll {
  const request = gameDiceRequestSchema.parse(rawRequest);
  const normalizedSeed = z.string().trim().min(1).max(200).parse(seed);
  const random = createSeededRandom(normalizedSeed);
  const results = Array.from(
    { length: request.count },
    () => Math.floor(random() * request.sides) + 1,
  );
  return gameDiceRollSchema.parse({
    ...request,
    notation: diceNotation(request),
    seed: normalizedSeed,
    algorithm: GAME_DICE_ALGORITHM,
    results,
    total: results.reduce((sum, result) => sum + result, request.modifier),
  });
}
