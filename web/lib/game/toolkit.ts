import { z } from "zod";
import { GAME_DICE_ALGORITHM } from "./dice";
import { createSeededRandom } from "@/lib/shared/random";

const key = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}_-]+$/u).refine((value) => !["__proto__", "constructor", "prototype"].includes(value));
const card = z.object({ id: z.string().max(80), label: z.string().trim().min(1).max(160) }).strict();
const deckSchema = z.object({ cards: z.array(card).min(1).max(100), drawPile: z.array(z.string()).max(100), hand: z.array(z.string()).max(100), discard: z.array(z.string()).max(100) }).strict().superRefine((deck, context) => {
  const ids = deck.cards.map((item) => item.id);
  const piles = [...deck.drawPile, ...deck.hand, ...deck.discard];
  if (new Set(ids).size !== ids.length || piles.length !== ids.length || new Set(piles).size !== piles.length || piles.some((id) => !ids.includes(id))) context.addIssue({ code: "custom", message: "牌堆必须保留全部且唯一的卡牌 ID。" });
});
export const gameToolRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deck-create"), deckId: key, cards: z.array(z.string().trim().min(1).max(160)).min(1).max(100) }).strict(),
  z.object({ action: z.literal("deck-draw"), deckId: key, count: z.number().int().min(1).max(20) }).strict(),
  z.object({ action: z.literal("deck-discard"), deckId: key, cardIds: z.array(z.string().max(80)).min(1).max(20).refine((ids) => new Set(ids).size === ids.length) }).strict(),
  z.object({ action: z.literal("deck-reset"), deckId: key }).strict(),
  z.object({ action: z.literal("random-table"), purpose: z.string().trim().min(1).max(120), entries: z.array(z.string().trim().min(1).max(160)).min(1).max(100) }).strict(),
]);
export const gameToolkitSchema = z.object({
  decks: z.record(key, deckSchema).refine((decks) => Object.keys(decks).length <= 8),
  lastResult: z.object({ action: z.string().max(40), labels: z.array(z.string().max(200)).max(20), seed: z.string().max(200), algorithm: z.literal(GAME_DICE_ALGORITHM) }).strict().optional(),
  receipt: z.object({ requestId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().optional(),
}).strict();
export type GameToolkit = z.infer<typeof gameToolkitSchema>;
export type GameToolRequest = z.infer<typeof gameToolRequestSchema>;

function shuffled(ids: readonly string[], seed: string) {
  const next = [...ids]; const random = createSeededRandom(seed);
  for (let index = next.length - 1; index > 0; index--) { const other = Math.floor(random() * (index + 1)); [next[index], next[other]] = [next[other], next[index]]; }
  return next;
}

export function applyGameTool(raw: GameToolkit | undefined, rawRequest: GameToolRequest, seed: string): GameToolkit {
  const current = gameToolkitSchema.parse(structuredClone(raw ?? { decks: {} }));
  const request = gameToolRequestSchema.parse(rawRequest);
  z.string().min(1).max(200).parse(seed);
  let labels: string[] = [];
  if (request.action === "random-table") {
    labels = [request.entries[Math.floor(createSeededRandom(seed)() * request.entries.length)]];
  } else if (request.action === "deck-create") {
    if (Object.hasOwn(current.decks, request.deckId)) throw new Error("牌堆已存在，请重置或使用其他名字。");
    const cards = request.cards.map((label, index) => ({ id: `${request.deckId}:${index + 1}`, label }));
    current.decks[request.deckId] = { cards, drawPile: shuffled(cards.map((item) => item.id), seed), hand: [], discard: [] };
    labels = [`已创建 ${request.deckId}，${cards.length} 张牌。`];
  } else {
    const deck = Object.hasOwn(current.decks, request.deckId) ? current.decks[request.deckId] : undefined;
    if (!deck) throw new Error("所选分支中不存在该牌堆。");
    if (request.action === "deck-draw") {
      if (deck.drawPile.length < request.count) throw new Error("剩余牌数不足；没有自动洗回弃牌或重复抽取。");
      const drawn = deck.drawPile.splice(0, request.count);
      deck.hand.push(...drawn);
      labels = drawn.map((id) => `${id} · ${deck.cards.find((item) => item.id === id)!.label}`);
    } else if (request.action === "deck-discard") {
      if (request.cardIds.some((id) => !deck.hand.includes(id))) throw new Error("只能弃掉当前分支手中的卡牌。");
      deck.hand = deck.hand.filter((id) => !request.cardIds.includes(id));
      deck.discard.push(...request.cardIds);
      labels = request.cardIds.map((id) => `弃牌：${id}`);
    } else {
      deck.drawPile = shuffled(deck.cards.map((item) => item.id), seed); deck.hand = []; deck.discard = [];
      labels = [`已重置 ${request.deckId}，手牌与弃牌全部洗回。`];
    }
  }
  return gameToolkitSchema.parse({ ...current, lastResult: { action: request.action, labels, seed, algorithm: GAME_DICE_ALGORITHM } });
}
