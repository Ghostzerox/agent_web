import { readFileSync } from "node:fs";
import { blindReviewSheet, parseQualityRun, summarizeQualityTrials } from "../evals/r3/qualityReport";

const inputAt = process.argv.indexOf("--input");
try {
  if (inputAt < 0 || !process.argv[inputAt + 1]) throw new Error("A local JSONL result file is required");
  const { trials } = parseQualityRun(readFileSync(process.argv[inputAt + 1], "utf8"));
  if (process.argv.includes("--blind-answers")) console.log(JSON.stringify(blindReviewSheet(trials).answers, null, 2));
  else if (process.argv.includes("--blind-mapping")) console.log(JSON.stringify(blindReviewSheet(trials).mapping, null, 2));
  else console.log(JSON.stringify(summarizeQualityTrials(trials), null, 2));
} catch {
  console.error("Invalid local quality results. No network, credential read or generation was performed.");
  process.exitCode = 1;
}
