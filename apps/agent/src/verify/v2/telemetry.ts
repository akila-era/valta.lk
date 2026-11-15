import type { IssueCategory, IssueCode, Severity, VerifyV2Result } from "./types";

/** What may be logged or counted about a verification: codes and numbers only. NEVER the answer, a sentence, a product name or any message text. */
export interface VerdictSummary {
  verdict: VerifyV2Result["verdict"];
  ok: boolean;
  issueCount: number;
  codes: Partial<Record<IssueCode, number>>;
  severities: Partial<Record<Severity, number>>;
  categories: Partial<Record<IssueCategory, number>>;
  repairSteps: string[];
  chars: number;
  sentences: number;
  truncated: boolean;
}

export function explainVerdict(result: VerifyV2Result): VerdictSummary {
  const codes: VerdictSummary["codes"] = {};
  const severities: VerdictSummary["severities"] = {};
  const categories: VerdictSummary["categories"] = {};
  for (const i of result.issues) {
    codes[i.code] = (codes[i.code] ?? 0) + 1;
    severities[i.severity] = (severities[i.severity] ?? 0) + 1;
    categories[i.category] = (categories[i.category] ?? 0) + 1;
  }
  return {
    verdict: result.verdict,
    ok: result.ok,
    issueCount: result.issues.length,
    codes,
    severities,
    categories,
    repairSteps: result.repairs.map((r) => r.kind),
    chars: result.analysed.chars,
    sentences: result.analysed.sentences,
    truncated: result.analysed.truncated,
  };
}
