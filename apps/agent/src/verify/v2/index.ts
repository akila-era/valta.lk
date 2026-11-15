/** Verifier v2 public API (pure, model-free). Not wired into the production pipeline. */
export { verifyAnswerV2 } from "./verify";
export { planRepair, redactUnsupportedSentences, autoFix, buildFeedback, noticeFor } from "./repair";
export { explainVerdict, type VerdictSummary } from "./telemetry";
export { extractAmounts } from "./money";
export { splitSentences, fold } from "./text";
export { findTitles, stripViolatingTitles } from "./quality";
export { findUrls, urlKey } from "./citations";
export * from "./types";
