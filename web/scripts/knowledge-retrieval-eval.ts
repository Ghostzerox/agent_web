import { evaluateRetrieval } from "../evals/r5/retrievalEval";
const result = evaluateRetrieval(process.argv.includes("--stress") ? 10 : 1);
console.log(JSON.stringify(result, null, 2));
if (result.summary.recallAt5 < 0.85 || result.summary.noAnswerFalseRetrievals / result.summary.noAnswerCount > 0.05 || result.summary.isolationLeaks || result.summary.staleDeletedHits || result.summary.locatorFailures) process.exitCode = 1;
