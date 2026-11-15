/**
 * What a tool run proves. Evidence is produced by the SERVER from tool results; a model never writes it. Verifier v2 defines its OWN, differently shaped
 * `ToolEvidence` (typed fields instead of this loose `facts` bag): convert with `toVerifierEvidence` in `./verifier-evidence`. The two are NOT interchangeable.
 *
 * Kinds: product / stock / price / spec come from the VOLTA catalogue (the only authority for the shop's prices and availability); calculation is the exact
 * result of the calculator; search_source and page_excerpt come from the web and are NEVER store facts.
 */
export const EVIDENCE_KINDS = ["product", "stock", "price", "spec", "calculation", "search_source", "page_excerpt"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface ToolEvidence {
  tool: string;
  kind: EvidenceKind;
  facts: Record<string, unknown>;
  productIds?: string[];
  sourceUrl?: string;
  title?: string;
  fetchedAt?: string;
}

/** Evidence from the web (as opposed to the store). Anything with a source URL is web evidence and must be cited, never presented as inventory. */
export const isWebEvidence = (e: ToolEvidence): boolean => e.kind === "search_source" || e.kind === "page_excerpt";
