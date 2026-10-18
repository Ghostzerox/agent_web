export type ExplorationTemplateReference = { templateId: string; templateVersion: string };

/** Existing sessions already store this marker. Never upgrade them to a newer template implicitly. */
export function sessionExplorationTemplate(rules: readonly string[]): ExplorationTemplateReference | null {
  for (const rule of rules) {
    const match = rule.match(/^exploration\.v1 \/ ([a-z][a-z0-9-]{0,59})@(\d+\.\d+\.\d+)$/u);
    if (match) return { templateId: match[1], templateVersion: match[2] };
  }
  return null;
}
