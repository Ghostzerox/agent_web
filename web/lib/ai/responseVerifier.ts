import type {
  MessageCitation,
  ResponseVerification,
  VerificationCheckStatus,
} from "@/lib/ai/messages";
import type { SearchRetrieval } from "@/lib/search/webSearch";

export const RESPONSE_VERIFIER_VERSION = "core-3.4/rule-v1" as const;

type VerificationCheck = ResponseVerification["checks"][number];

const TIME_SENSITIVE_PATTERN =
  /(?:最新|最近|近期|今天|今日|现在|当前|本周|本月|今年|新闻|进展|更新|现任|价格|汇率|天气|赛程|比分|股价|截至|latest|recent|today|current|news|update|price|weather|score|schedule|as of)/iu;
const EXPLICIT_DATE_PATTERN =
  /(?:截至\s*)?(?:20\d{2})[年./-](?:0?[1-9]|1[0-2])(?:[月./-](?:0?[1-9]|[12]\d|3[01])日?)?/u;
const INFERENCE_PATTERN =
  /(?:因此|由此|这意味着|可以推断|据此|可见|显然|必然|一定会|说明|表明|therefore|thus|implies?|suggests?)/iu;
const QUALIFICATION_PATTERN =
  /(?:可能|推测|或许|不确定|尚无|初步|倾向|看起来|大概|据目前资料|could|may|might|likely|uncertain|appears?)/iu;

function markerIds(answer: string): string[] {
  return Array.from(
    new Set(
      [...answer.matchAll(/\[S(\d+)\]/giu)].map(
        (match) => `S${Number(match[1])}`,
      ),
    ),
  );
}

function answerSentences(answer: string): string[] {
  return answer
    .split(/(?<=[。！？.!?])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const ENGLISH_STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "from",
  "that",
  "their",
  "there",
  "these",
  "this",
  "with",
  "would",
]);

function lexicalTokens(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase();
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/[a-z0-9]{4,}/gu)) {
    if (!ENGLISH_STOP_WORDS.has(match[0])) tokens.add(match[0]);
  }
  for (const match of normalized.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    const sequence = match[0];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      tokens.add(sequence.slice(index, index + 2));
    }
  }
  return tokens;
}

function citationSupportsSentence(
  sentence: string,
  citation: MessageCitation,
): boolean {
  const claimTokens = lexicalTokens(
    sentence.replace(/\[S\d+\]/giu, "").replace(/https?:\/\/\S+/giu, ""),
  );
  const sourceTokens = lexicalTokens(
    `${citation.title} ${citation.snippet ?? ""} ${citation.source ?? ""}`,
  );
  if (claimTokens.size === 0 || sourceTokens.size === 0) return false;
  let overlap = 0;
  for (const token of claimTokens) {
    if (sourceTokens.has(token)) overlap += 1;
  }
  const threshold = Math.max(1, Math.min(3, Math.ceil(claimTokens.size * 0.08)));
  return overlap >= threshold;
}

function claimBeforeMarker(answer: string, id: string): string | null {
  const upper = answer.toLocaleUpperCase();
  const markerIndex = upper.indexOf(`[${id}]`);
  if (markerIndex === -1) return null;
  const before = answer
    .slice(Math.max(0, markerIndex - 500), markerIndex)
    .replace(/[。！？.!?\s]+$/gu, "");
  const boundary = Math.max(
    before.lastIndexOf("。"),
    before.lastIndexOf("！"),
    before.lastIndexOf("？"),
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n"),
  );
  const claim = before.slice(boundary + 1).trim();
  return claim || null;
}

function citationIntegrityCheck(
  ids: readonly string[],
  retrieval: SearchRetrieval,
): VerificationCheck {
  const available = new Set(retrieval.citations.map((citation) => citation.id));
  const unknown = ids.filter((id) => !available.has(id));
  if (unknown.length > 0) {
    return {
      id: "citation-integrity",
      label: "引用完整性",
      status: "fail",
      detail: `回答包含无法对应检索来源的编号：${unknown.join("、")}。`,
      citationIds: unknown,
    };
  }
  if (retrieval.status === "failed") {
    return {
      id: "citation-integrity",
      label: "引用完整性",
      status: "warning",
      detail: "本次外部检索未完成，回答没有可验证的检索来源。",
    };
  }
  if (retrieval.status === "completed" && ids.length === 0) {
    return {
      id: "citation-integrity",
      label: "引用完整性",
      status: "warning",
      detail: "本次已检索资料，但回答没有使用 [S1] 形式的行内引用。",
    };
  }
  if (ids.length === 0) {
    return {
      id: "citation-integrity",
      label: "引用完整性",
      status: "not-applicable",
      detail: "本次回答没有使用外部引用。",
    };
  }
  return {
    id: "citation-integrity",
    label: "引用完整性",
    status: "pass",
    detail: `${ids.length} 个引用编号均能对应本次检索来源。`,
    citationIds: [...ids],
  };
}

function citationSupportCheck(
  answer: string,
  ids: readonly string[],
  retrieval: SearchRetrieval,
): VerificationCheck {
  if (ids.length === 0) {
    return {
      id: "citation-support",
      label: "摘要支持度",
      status: "not-applicable",
      detail: "没有可进行摘要支持度检查的引用。",
    };
  }
  const citations = new Map(
    retrieval.citations.map((citation) => [citation.id, citation]),
  );
  const unsupported: string[] = [];
  for (const id of ids) {
    const citation = citations.get(id);
    const sentence = claimBeforeMarker(answer, id);
    if (!citation || !sentence || !citationSupportsSentence(sentence, citation)) {
      unsupported.push(id);
    }
  }
  if (unsupported.length > 0) {
    return {
      id: "citation-support",
      label: "摘要支持度",
      status: "warning",
      detail: `以下引用与相邻断言未建立足够的词面对应：${unsupported.join("、")}。需要打开原文复核。`,
      citationIds: unsupported,
    };
  }
  return {
    id: "citation-support",
    label: "摘要支持度",
    status: "pass",
    detail: "行内引用与对应搜索摘要存在可识别的词面关联。",
    citationIds: [...ids],
  };
}

function freshnessCheck(
  answer: string,
  query: string | null,
  ids: readonly string[],
  retrieval: SearchRetrieval,
): VerificationCheck {
  if (retrieval.kind === "knowledge") return { id: "freshness", label: "时效标注", status: "not-applicable", detail: "本次仅核对资料修订版本，未联网；不能据此证明内容最新。" };
  if (!query || !TIME_SENSITIVE_PATTERN.test(query)) {
    return {
      id: "freshness",
      label: "时效标注",
      status: "not-applicable",
      detail: "问题未被规则识别为时效性问题。",
    };
  }
  if (retrieval.status !== "completed") {
    return {
      id: "freshness",
      label: "时效标注",
      status: "warning",
      detail: "问题包含时效信息，但本次没有完成外部检索，不能确认内容是否最新。",
    };
  }
  if (ids.length === 0 || !EXPLICIT_DATE_PATTERN.test(answer)) {
    return {
      id: "freshness",
      label: "时效标注",
      status: "warning",
      detail: "已检索时效资料，但回答缺少明确的截止日期或可追踪引用。",
      citationIds: [...ids],
    };
  }
  return {
    id: "freshness",
    label: "时效标注",
    status: "pass",
    detail: "时效性回答包含明确日期，并关联本次检索来源。",
    citationIds: [...ids],
  };
}

function inferenceBoundaryCheck(answer: string): VerificationCheck {
  if (!answer.trim()) {
    return {
      id: "inference-boundary",
      label: "推断边界",
      status: "warning",
      detail: "回答为空，无法检查事实与推断的表达边界。",
    };
  }
  const unqualified = answerSentences(answer).filter(
    (sentence) =>
      INFERENCE_PATTERN.test(sentence) &&
      !QUALIFICATION_PATTERN.test(sentence) &&
      !/\[S\d+\]/iu.test(sentence),
  );
  if (unqualified.length > 0) {
    return {
      id: "inference-boundary",
      label: "推断边界",
      status: "warning",
      detail: `发现 ${unqualified.length} 处带有强推断语气但没有引用或不确定性标记的表述。`,
    };
  }
  return {
    id: "inference-boundary",
    label: "推断边界",
    status: "pass",
    detail: "未发现未标注来源或不确定性的强推断语句。",
  };
}

function overallStatus(
  checks: readonly VerificationCheck[],
): ResponseVerification["status"] {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "pass";
}

function summaryFor(status: ResponseVerification["status"]): string {
  if (status === "fail") return "规则检查发现引用完整性问题";
  if (status === "warning") return "规则检查发现需要人工复核的项目";
  return "规则检查未发现明显问题";
}

export function verifyResponse(input: {
  answer: string;
  query: string | null;
  retrieval: SearchRetrieval;
  checkedAt?: string;
}): ResponseVerification {
  const ids = markerIds(input.answer);
  const checks = [
    citationIntegrityCheck(ids, input.retrieval),
    citationSupportCheck(input.answer, ids, input.retrieval),
    freshnessCheck(input.answer, input.query, ids, input.retrieval),
    inferenceBoundaryCheck(input.answer),
  ];
  const status = overallStatus(checks);
  return {
    schemaVersion: 1,
    verifierVersion: RESPONSE_VERIFIER_VERSION,
    status,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    summary: summaryFor(status),
    checks,
    limitations: [
      "这是确定性规则检查，不等同于事实证明。",
      "摘要词面匹配不能替代阅读原文、专业审查或完整语义核验。",
    ],
  };
}

export function isResponseVerification(
  value: unknown,
): value is ResponseVerification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResponseVerification>;
  const validCheckIds = new Set([
    "citation-integrity",
    "citation-support",
    "freshness",
    "inference-boundary",
  ]);
  const checks = Array.isArray(candidate.checks) ? candidate.checks : [];
  return (
    candidate.schemaVersion === 1 &&
    candidate.verifierVersion === RESPONSE_VERIFIER_VERSION &&
    (candidate.status === "pass" ||
      candidate.status === "warning" ||
      candidate.status === "fail") &&
    typeof candidate.checkedAt === "string" &&
    !Number.isNaN(new Date(candidate.checkedAt).getTime()) &&
    typeof candidate.summary === "string" &&
    checks.length === 4 &&
    new Set(checks.map((check) => check.id)).size === 4 &&
    checks.every(
      (check) =>
        check &&
        validCheckIds.has(check.id) &&
        typeof check.label === "string" &&
        typeof check.detail === "string" &&
        (["pass", "warning", "fail", "not-applicable"] as VerificationCheckStatus[]).includes(
          check.status,
        ) &&
        (check.citationIds === undefined ||
          (Array.isArray(check.citationIds) &&
            check.citationIds.every((id) => /^S[1-9]\d*$/u.test(id)))),
    ) &&
    Array.isArray(candidate.limitations) &&
    candidate.limitations.every((item) => typeof item === "string")
  );
}
