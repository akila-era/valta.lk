/**
 * Provenance of the router's word lists. Everything here (Sinhala, Singlish and English) was drafted by an engineer, not by a
 * native speaker, and has never been reviewed. Until a native Sinhala speaker signs it off (blocker B5):
 *  - every response that uses it must carry `needsNativeReview: true` (the response contract enforces this), and
 *  - nothing may be presented as production-ready Sinhala.
 */
export const LEXICON_META = {
  version: "0.1.0-provisional",
  needsNativeReview: true,
  authoredBy: "engineer",
  nativeReviewedBy: null as string | null,
  reviewedAt: null as string | null,
} as const;

/** Always false until a named native reviewer is recorded AND the needsNativeReview tag is removed on purpose. */
export const isSinhalaProductionReady = (): boolean => LEXICON_META.nativeReviewedBy !== null && !LEXICON_META.needsNativeReview;
