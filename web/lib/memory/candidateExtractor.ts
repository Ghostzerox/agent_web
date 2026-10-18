import type { MemoryCandidateKind, MemorySensitivity } from "@/lib/memory/types";

const MAX_CANDIDATE_LENGTH = 500;

export type MemoryCandidateDraft = {
  kind: MemoryCandidateKind;
  content: string;
  evidenceQuote: string;
  sensitivity: MemorySensitivity;
  confidence: number;
  reason: string;
};

const transientPattern = /(?:今天|今晚|明天|昨天|现在|这次|本次|刚才|刚刚|暂时|目前|本周|这周|下周|最近几天)/u;
const secretPattern = /(?:api[-_ ]?key|密码|口令|验证码|私钥|助记词|token|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{8,}|AIza[a-z0-9_-]{20,}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|\b[a-f0-9]{32,}\b)/iu;
const sensitivePattern = /(?:身份证|护照|住址|家庭住址|手机号|电话号码|邮箱|病史|疾病|诊断|药物|收入|工资|银行卡|宗教|政治立场|性取向|亲密关系)/u;

function normalize(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function classify(content: string): MemoryCandidateKind {
  if (/^(?:我|本人)(?:一直|通常|更|最)?(?:喜欢|偏好|习惯于|不喜欢|讨厌)/u.test(content)) {
    return "preference";
  }
  if (/^(?:我的(?:长期)?目标是|我(?:长期)?(?:计划|希望|想要|正在努力|打算))/u.test(content)) {
    return "goal";
  }
  if (/^我(?:是|来自|住在|就读于|任职于)/u.test(content)) return "profile";
  return "fact";
}

function sensitivityFor(
  content: string,
  kind: MemoryCandidateKind,
): MemorySensitivity {
  if (sensitivePattern.test(content)) return "sensitive";
  return kind === "profile" ? "personal" : "low";
}

function durableStatement(content: string): boolean {
  if (/^(?:我|本人)(?:一直|通常|更|最)?(?:喜欢|偏好|习惯于|不喜欢|讨厌)\s*\S+/u.test(content)) {
    return true;
  }
  if (/^(?:我的(?:长期)?目标是|我(?:长期)?(?:计划|希望|想要|正在努力|打算))\s*\S+/u.test(content)) {
    return !/^我希望你/u.test(content);
  }
  return /^我(?:是|来自|住在|就读于|任职于)\s*\S+/u.test(content);
}

/**
 * High-precision Phase 5.1 extraction. It intentionally returns nothing for
 * questions, temporary statements and secrets. Every returned value is still
 * only a candidate and must be confirmed by the user before becoming memory.
 */
export function extractMemoryCandidate(
  rawContent: string,
): MemoryCandidateDraft | null {
  const evidenceQuote = normalize(rawContent).slice(0, MAX_CANDIDATE_LENGTH);
  if (!evidenceQuote || /[？?]/u.test(evidenceQuote) || secretPattern.test(evidenceQuote)) {
    return null;
  }

  const explicitMatch = evidenceQuote.match(
    /^(?:请(?:你)?记住|记住)(?:[：:,，]\s*|\s+)(.+)$/u,
  );
  const explicit = Boolean(explicitMatch);
  const content = normalize(explicitMatch?.[1] ?? evidenceQuote).slice(
    0,
    MAX_CANDIDATE_LENGTH,
  );
  if (!content || /[？?]/u.test(content) || secretPattern.test(content)) return null;
  if (!explicit && (transientPattern.test(content) || !durableStatement(content))) {
    return null;
  }

  const kind = classify(content);
  return {
    kind,
    content,
    evidenceQuote,
    sensitivity: sensitivityFor(content, kind),
    confidence: explicit ? 95 : kind === "profile" ? 78 : 86,
    reason: explicit
      ? "用户明确要求记住；仍需确认，避免误解或保存不应长期保留的信息。"
      : kind === "preference"
        ? "检测到稳定偏好表达；需由用户确认它是否长期有效。"
        : kind === "goal"
          ? "检测到可能持续一段时间的目标；需由用户确认范围与表述。"
          : "检测到可能有助于后续交流的个人资料；需由用户确认。",
  };
}
