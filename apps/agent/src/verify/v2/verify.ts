import { indexProducts } from "./evidence";
import { checkCitations } from "./citations";
import { checkGrounding } from "./grounding";
import { checkEmpty, checkFormat, checkHonorifics, checkLanguage, checkRepetition } from "./quality";
import { planRepair, redactUnsupportedSentences } from "./repair";
import { checkSafetyClasses } from "./safety";
import { MAX_ANALYSED_CHARS, fold, splitSentences } from "./text";
import type { Issue, Verdict, VerifyV2Input, VerifyV2Result } from "./types";

/**
 * Verifier v2 entry point: claim-grounding verification of a FREE-FORM model answer against this turn's tool evidence. Pure and deterministic.
 * It does not verify cards or actions (the existing verifier keeps doing that) and it never calls a model: the repair PLAN it returns is carried
 * out by the turn loop, which must verify every candidate again.
 */
export function verifyAnswerV2(input: VerifyV2Input): VerifyV2Result {
  const full = typeof input.answerText === "string" ? input.answerText : "";
  const truncated = full.length > MAX_ANALYSED_CHARS;
  const text = truncated ? full.slice(0, MAX_ANALYSED_CHARS) : full;
  const folded = fold(text);
  const spans = splitSentences(text);
  const products = indexProducts(input.toolEvidence);

  const issues: Issue[] = [
    ...checkEmpty(text, spans),
    ...checkFormat(text, spans, input, truncated),
    ...checkSafetyClasses(text, folded, spans, input),
    ...checkCitations(text, folded, spans, input),
    ...checkGrounding({ text, folded, spans, input, products }),
    ...checkHonorifics(text, spans, input),
    ...checkRepetition(text, spans, input),
    ...checkLanguage(text, spans, input),
  ];
  issues.sort((a, b) => a.start - b.start || a.end - b.end);

  const verdict: Verdict = issues.some((i) => i.severity === "critical") ? "fail" : issues.some((i) => i.severity === "error") ? "repairable" : "pass";
  const base: VerifyV2Result = { ok: verdict === "pass", verdict, issues, repairs: [], analysed: { chars: text.length, truncated, sentences: spans.length } };
  if (verdict === "pass") return base;

  // The repair plan always works on the text that was ANALYSED (a non-string answer is analysed as "", a very long one is cut), never on the raw input.
  const withInput: VerifyV2Input = { ...input, answerText: text };
  base.repairs = planRepair(base, withInput);
  const red = redactUnsupportedSentences(text, issues, spans);
  if (red.removed.length > 0) base.redactedText = red.text;
  return base;
}
