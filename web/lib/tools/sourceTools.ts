import type { WebCitation } from "@/lib/search/webSearch";

/** Deterministic metadata checks, not a claim that linked content is true. No network I/O. */
export function normalizeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid)$/iu.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

export function normalizeBookTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{Z}\s]/gu, "");
}

export function normalizeKnownCitationMarkers(content: string, sourceIds: readonly string[]): string {
  const known = new Set(sourceIds);
  // Syntax adapter only: never synthesize evidence or rewrite unknown source ids.
  return content.replace(/\[\^(S\d+)\](?!:)/gu, (marker, id: string) => known.has(id) ? `[${id}]` : marker);
}

export function normalizeIsbn(value: string): { normalized: string; valid: boolean } {
  const normalized = value.toUpperCase().replace(/[\s-]/gu, "");
  if (/^\d{13}$/u.test(normalized)) {
    const sum = [...normalized.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return { normalized, valid: /^(978|979)/u.test(normalized) && (10 - sum % 10) % 10 === Number(normalized[12]) };
  }
  if (/^\d{9}[\dX]$/u.test(normalized)) return { normalized, valid: [...normalized].reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0 };
  return { normalized, valid: false };
}

export function inspectSourceMetadata(rows: readonly { title: string; url: string; publishedAt: string | null }[], now: Date) {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const normalizedUrl = normalizeSourceUrl(row.url);
    const warnings: string[] = [];
    if (!normalizedUrl) warnings.push("invalid-url");
    if (normalizedUrl && seen.has(normalizedUrl)) warnings.push("duplicate-url");
    if (normalizedUrl) seen.add(normalizedUrl);
    const date = row.publishedAt ? new Date(row.publishedAt) : null;
    if (!date) warnings.push("unknown-date");
    else if (!Number.isFinite(date.getTime())) warnings.push("invalid-date");
    else if (date > now) warnings.push("future-date");
    return { index, title: row.title, normalizedUrl, warnings, verifiedContent: false as const };
  });
}

export function usableSourceCitations(citations: readonly WebCitation[], now: Date): WebCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const url = normalizeSourceUrl(citation.url);
    const published = citation.publishedAt ? new Date(citation.publishedAt).getTime() : null;
    if (!url || seen.has(url) || (published !== null && Number.isFinite(published) && published > now.getTime())) return false;
    seen.add(url);
    return true;
  }).map((citation, index) => ({ ...citation, id: `S${index + 1}` }));
}
