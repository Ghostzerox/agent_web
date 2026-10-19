import { createSeededRandom, SEEDED_RANDOM_ALGORITHM } from "@/lib/shared/random";
import type { ExplorationState } from "../exploration/contracts";
import type { WorldTemplate } from "../exploration/templateTypes";
import { drawPoolsSchema, DrawError, type DrawEntry, type DrawPool, type DrawSample } from "./contracts";

type PoolWorld = Pick<WorldTemplate, "items" | "ranks" | "numericPolicy" | "slots"> & { locations: { id: string }[] };
export function drawPoolIssues(raw: unknown, world: PoolWorld): string[] {
  const parsed = drawPoolsSchema.safeParse(raw); if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
  const issues: string[] = [];
  for (const pool of parsed.data) {
    if (pool.locationId && !world.locations.some((place) => place.id === pool.locationId)) issues.push(`${pool.name}的获取地点不存在。`);
    for (const entry of pool.entries) {
      if (entry.source === "fixed") {
        const item = world.items.find((item) => item.id === entry.definitionId);
        if (!item) issues.push(`${pool.name}引用的物品不存在。`);
        else if ((!item.stackable || item.unique) && entry.maxQuantity !== 1) issues.push("独立 / 唯一物品每次只能获得一件。");
      } else {
        if (entry.category === "equipment" && !world.slots.length) issues.push("装备生成条目需要世界声明装备槽。");
        for (const field of ["quality", "tier", "rating"] as const) if (!world.ranks[field].some((rank) => rank.id === entry[field])) issues.push(`生成条目的${field}不属于世界字典。`);
        if (world.numericPolicy === "light" ? entry.level === undefined || entry.level > (world.ranks.levelsPerTier ?? 0) : entry.level !== undefined) issues.push("生成条目的等级与世界策略冲突。");
        if ((entry.category !== "material" || entry.unique) && entry.maxQuantity !== 1) issues.push("生成池仅非唯一材料可一次获得多份。");
      }
    }
  }
  return [...new Set(issues)];
}

/** Conditional probabilities: unavailable/zero-weight entries are excluded, not rerolled after selection. */
export function eligibleDrawEntries(pool: DrawPool, state: ExplorationState, template: WorldTemplate): DrawEntry[] {
  const receipts = state.acquisitions?.receipts ?? [];
  if (receipts.length >= 200 || pool.locationId && pool.locationId !== state.locationId || state.tick < pool.minTick
    || state.coins < pool.coinCost || receipts.filter((entry) => entry.poolId === pool.id).length >= pool.maxDraws) return [];
  return pool.entries.filter((entry) => {
    if (entry.weight <= 0 || !pool.replacement && receipts.some((receipt) => receipt.poolId === pool.id && receipt.entryId === entry.id)) return false;
    if (entry.source === "generated") return (state.acquisitions?.items.length ?? 0) < 50 && state.instances.length < 150
      && (!entry.unique || !receipts.some((receipt) => receipt.poolId === pool.id && receipt.entryId === entry.id));
    const item = template.items.find((item) => item.id === entry.definitionId);
    if (state.instances.length >= 150 && (!item?.stackable || !state.instances.some((instance) => instance.definitionId === item.id && instance.owner === "player" && !instance.equippedSlot && instance.quantity + entry.maxQuantity <= 999))) return false;
    // Unique definitions already placed anywhere in the immutable world cannot be cloned by a pool.
    return Boolean(item && (!item.unique || !template.instances.some((instance) => instance.definitionId === item.id)
      && !state.instances.some((instance) => instance.definitionId === item.id) && !receipts.some((receipt) => receipt.definitionId === item.id)));
  });
}

export function weightedEntry(entries: readonly DrawEntry[], random: () => number): DrawEntry {
  const available = entries.filter((entry) => entry.weight > 0); const total = available.reduce((sum, entry) => sum + entry.weight, 0);
  if (!available.length || !Number.isSafeInteger(total) || total <= 0) throw new DrawError("DRAW_INVALID", "当前卡池没有可抽取条目；未调用模型或扣除资源。");
  const value = random(); if (!Number.isFinite(value) || value < 0 || value >= 1) throw new DrawError("DRAW_INVALID", "随机源必须返回[0,1)范围。");
  let threshold = value * total;
  for (const entry of available) { threshold -= entry.weight; if (threshold < 0) return structuredClone(entry); }
  return structuredClone(available.at(-1)!);
}
export function sampleDraw(entries: DrawEntry[], seed: string, random = createSeededRandom(seed)): DrawSample {
  const entry = weightedEntry(entries, random); const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new DrawError("DRAW_INVALID", "数量随机源无效。");
  return { entry, quantity: entry.minQuantity + Math.floor(value * (entry.maxQuantity - entry.minQuantity + 1)), seed, algorithm: SEEDED_RANDOM_ALGORITHM };
}
