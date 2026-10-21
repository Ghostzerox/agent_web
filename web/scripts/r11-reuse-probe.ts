/** Offline, opt-in research only. See docs/reports/R11_REPORT.md for vendor preparation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { nextReviewInstant } from "../lib/memorization/domain";
import { normalizeTaskSchedule, type TaskSchedule } from "../lib/tasks/schedule";

type Card = Record<string, unknown> & { due: Date; last_review?: Date };
type Review = { card: Card; log: Record<string, unknown> };
type FsrsModule = {
  createEmptyCard: (date: Date) => Card;
  fsrs: (options: { enable_fuzz: boolean }) => {
    repeat: (card: Card, date: Date) => Record<number, Review>;
    next: (card: Card, date: Date, rating: number) => Review;
  };
};
type RRuleModule = {
  RRule: {
    new (options: { freq: number; dtstart: Date }): { after: (date: Date, inc: boolean) => Date | null };
    DAILY: number;
    WEEKLY: number;
    fromString: (rule: string) => { all: () => Date[] };
  };
};

const root = resolve(__dirname, "../..");
const vendor = resolve(root, ".r3-eval/r11/vendor");

async function loadPinned(folder: string, version: string, bundle: string, sha256: string) {
  const name = folder === "fsrs" ? "ts-fsrs" : "rrule";
  const sri = folder === "fsrs"
    ? "z4qop4pzTcyTzuJ566d9EaX/4bZZzhYfeaPImfVr+xcYT65c5oBgFDijUhCE/D+C78eaolHIhKRZ04/RwF+v2g=="
    : "hM3dHSBMeaJ0Ktp7W38BJZ7O1zOgaFEsn41PDk+yHoEtfLV+PoJt9E9xAlZiWgf/iqEqionN0ebHFZIDAp+iGw==";
  const archive = await readFile(resolve(vendor, `${name}-${version}.tgz`));
  assert.equal(createHash("sha512").update(archive).digest("base64"), sri, "Vendor archive integrity mismatch");
  const directory = resolve(vendor, folder, "package");
  const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
  assert.equal(manifest.version, version, "Unexpected vendor version");
  const path = resolve(directory, bundle);
  const contents = await readFile(path);
  assert.equal(createHash("sha256").update(contents).digest("hex"), sha256, "Vendor bundle changed");
  return { exports: await import(pathToFileURL(path).href), bytes: contents.length, sha256 };
}

async function main() {
  // No downloads, npm install, model calls, database or private data access.
  const fsrsBundle = await loadPinned("fsrs", "5.4.2", "dist/index.mjs", "ad4a4b3b7e259fcbf02764454c8f9db4ea3bf5aae2f473198129ecb7728f1a19");
  const rruleBundle = await loadPinned("rrule", "2.8.1", "dist/es5/rrule.js", "653c3065b3fa57aa510852ea943f4a359ebdfb3d962340f648a37f744f237204");
  const library = fsrsBundle.exports as FsrsModule;
  const rules = (rruleBundle.exports.default ?? rruleBundle.exports) as RRuleModule;
  const scheduler = library.fsrs({ enable_fuzz: false });
  const start = new Date("2030-01-01T00:00:00.000Z");
  const card = library.createEmptyCard(start);
  const original = JSON.stringify(card);
  const preview = scheduler.repeat(card, start);
  assert.equal(JSON.stringify(card), original, "Preview mutated the original card");
  const replay = scheduler.repeat(card, start);
  // repeat() also carries a new bound Symbol.iterator; compare review data, not function identity.
  for (const rating of [1, 2, 3, 4]) assert.deepEqual(preview[rating], replay[rating]);
  const firstRatings = [1, 2, 3, 4].map((rating) => {
    const result = preview[rating];
    assert.ok(result.card.due.getTime() > start.getTime());
    assert.ok(Number.isFinite(Number(result.card.stability)));
    assert.deepEqual(result, scheduler.next(card, start, rating));
    return { rating, due: result.card.due.toISOString(), stability: result.card.stability };
  });
  assert.equal(new Set(firstRatings.map((result) => result.due)).size, 4);
  const reviewAt = preview[4].card.due;
  // JSON storage needs explicit date restoration, not an unvalidated assertion about our schema.
  const serialized = JSON.parse(JSON.stringify(preview[4].card));
  const restored: Card = { ...serialized, due: new Date(serialized.due), last_review: new Date(serialized.last_review) };
  const restoredPreview = scheduler.repeat(restored, reviewAt);
  const originalPreview = scheduler.repeat(preview[4].card, reviewAt);
  for (const rating of [1, 2, 3, 4]) assert.deepEqual(restoredPreview[rating], originalPreview[rating]);
  const lapse = scheduler.next(restored, reviewAt, 1);
  const success = scheduler.next(restored, reviewAt, 3);
  assert.ok(lapse.card.due < success.card.due, "A lapse should differ from a successful review");
  const history: { due: string; stability: unknown }[] = [];
  let learningCard = library.createEmptyCard(start);
  let now = start;
  const fsrsStarted = performance.now();
  for (let index = 0; index < 12; index += 1) {
    learningCard = scheduler.next(learningCard, now, 3).card;
    assert.ok(learningCard.due > now);
    history.push({ due: learningCard.due.toISOString(), stability: learningCard.stability });
    now = learningCard.due;
  }
  const fsrsMs = performance.now() - fsrsStarted;
  assert.ok(Number(history.at(-1)?.stability) > Number(history[0].stability));

  // Exact current product contract: fixed Shanghai UTC+8, single daily/weekly time.
  // This is NOT a TZID/DST adapter. The old anchor is a known local Monday (2026-01-05).
  const schedules: Exclude<TaskSchedule, { type: "once" }>[] = [];
  for (const time of ["00:00", "00:30", "08:30", "23:59"]) {
    schedules.push({ type: "daily", time });
    for (let weekday = 1; weekday <= 7; weekday += 1) schedules.push({ type: "weekly", weekday, time });
  }
  let comparisons = 0;
  let currentMs = 0;
  let candidateMs = 0;
  const ruleStarted = performance.now();
  for (const schedule of schedules) {
    const [hour, minute] = schedule.time.split(":").map(Number);
    const day = 5 + (schedule.type === "weekly" ? schedule.weekday - 1 : 0);
    const anchor = new Date(Date.UTC(2026, 0, day, hour - 8, minute));
    const rule = new rules.RRule({ freq: schedule.type === "daily" ? rules.RRule.DAILY : rules.RRule.WEEKLY, dtstart: anchor });
    // Year boundary, leap day, and exact due-time +/- 1ms (strictly future semantics).
    const boundaries = ["2030-12-31T15:59:59.999Z", "2032-02-29T16:00:00.000Z", "2030-01-01T00:00:00Z"].map((value) => new Date(value));
    const at = normalizeTaskSchedule(schedule, start).nextRunAt.getTime();
    boundaries.push(...[-1, 0, 1].map((offset) => new Date(at + offset)));
    for (const after of boundaries) {
      let began = performance.now();
      const current = normalizeTaskSchedule(schedule, after).nextRunAt;
      currentMs += performance.now() - began;
      began = performance.now();
      const candidate = rule.after(after, false);
      candidateMs += performance.now() - began;
      assert.equal(candidate?.toISOString(), current.toISOString(), JSON.stringify({ schedule, after }));
      comparisons += 1;
    }
  }
  const monthly = rules.RRule.fromString("DTSTART:20300101T003000Z\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3").all();
  assert.deepEqual(monthly.map((value) => value.toISOString()), ["2030-01-31T00:30:00.000Z", "2030-02-28T00:30:00.000Z", "2030-03-29T00:30:00.000Z"]);
  const result = {
    recordedAt: new Date().toISOString(), runtime: process.version, hostTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    scope: "synthetic offline algorithm probes, not production integration, upstream test suite or longitudinal quality validation",
    paidCalls: 0, tokens: 0,
    fsrs: { version: "5.4.2", bundleBytes: fsrsBundle.bytes, bundleSha256: fsrsBundle.sha256, firstRatings,
      currentScores: [40, 70, 85, 95].map((score) => ({ score, due: nextReviewInstant(start, score).toISOString() })),
      assertions: ["immutable-preview", "deterministic-replay", "four-distinct-ratings", "repeat-next-equivalence", "json-dates-restored", "lapse-vs-success", "12-good-reviews"],
      history, twelveReviewsMs: fsrsMs },
    rrule: { version: "2.8.1", bundleBytes: rruleBundle.bytes, bundleSha256: rruleBundle.sha256,
      comparisons, schedules: schedules.length, currentMs, candidateMs, elapsedMs: performance.now() - ruleStarted,
      monthlyLastWeekday: monthly.map((date) => date.toISOString()), timezoneContract: "Asia/Shanghai fixed UTC+8; no TZID or DST claim" },
  };
  const output = resolve(root, "docs/r11/probe-results.json");
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
