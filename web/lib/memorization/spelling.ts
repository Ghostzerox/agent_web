import { z } from "zod";

export const spellingOptionsSchema = z.object({
  caseSensitive: z.boolean().default(true), ignorePunctuation: z.boolean().default(false),
  ignoreWhitespace: z.boolean().default(false),
}).strict();
export const spellingResultSchema = z.object({
  exact: z.boolean(), score: z.number().int().min(0).max(100), distance: z.number().int().nonnegative(),
  changes: z.array(z.object({ kind: z.enum(["insert", "delete", "replace"]), expected: z.string(), actual: z.string(), targetStart: z.number().int(), targetEnd: z.number().int(), actualStart: z.number().int(), actualEnd: z.number().int() }).strict()).max(60),
  truncated: z.boolean(), options: spellingOptionsSchema,
}).strict();
export type SpellingResult = z.infer<typeof spellingResultSchema>;

function tokens(text: string, options: z.infer<typeof spellingOptionsSchema>) {
  let offset = 0;
  return Array.from(text).flatMap((character) => {
    const start = offset; offset += character.length;
    if ((options.ignorePunctuation && /\p{P}/u.test(character)) || (options.ignoreWhitespace && /\s/u.test(character))) return [];
    return [{ value: options.caseSensitive ? character : character.toLocaleLowerCase("en-US"), original: character, start, end: offset }];
  });
}

export function checkSpelling(target: string, actual: string, rawOptions: unknown = {}): SpellingResult {
  const options = spellingOptionsSchema.parse(rawOptions);
  const left = tokens(target, options); const right = tokens(actual, options);
  if (left.length > 2000 || right.length > 2000) throw new z.ZodError([{ code: "custom", path: ["recitation"], message: "逐字检查每次最多 2000 个有效字符，请拆分单元。" }]);
  const width = right.length + 1;
  const distance = new Uint16Array((left.length + 1) * width);
  for (let i = 0; i <= left.length; i++) distance[i * width] = i;
  for (let j = 0; j <= right.length; j++) distance[j] = j;
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    distance[i * width + j] = Math.min(distance[(i - 1) * width + j] + 1, distance[i * width + j - 1] + 1, distance[(i - 1) * width + j - 1] + Number(left[i - 1].value !== right[j - 1].value));
  }
  const changes: SpellingResult["changes"] = [];
  let i = left.length; let j = right.length;
  while (i || j) {
    if (i && j && left[i - 1].value === right[j - 1].value) { i--; j--; continue; }
    const replace = i && j && distance[i * width + j] === distance[(i - 1) * width + j - 1] + 1;
    const remove = !replace && i && distance[i * width + j] === distance[(i - 1) * width + j] + 1;
    const expected = replace || remove ? left[i - 1] : null;
    const given = replace || !remove ? right[j - 1] : null;
    const targetAt = left[i]?.start ?? target.length;
    const actualAt = right[j]?.start ?? actual.length;
    changes.push({ kind: replace ? "replace" : remove ? "delete" : "insert", expected: expected?.original ?? "", actual: given?.original ?? "", targetStart: expected?.start ?? targetAt, targetEnd: expected?.end ?? targetAt, actualStart: given?.start ?? actualAt, actualEnd: given?.end ?? actualAt });
    if (replace || remove) i--;
    if (replace || !remove) j--;
  }
  changes.reverse();
  const count = distance[left.length * width + right.length];
  return spellingResultSchema.parse({ exact: count === 0, score: Math.round((1 - count / Math.max(left.length, right.length, 1)) * 100), distance: count, changes: changes.slice(0, 60), truncated: changes.length > 60, options });
}
