/**
 * Catalogue intelligence: a PURE audit of a product snapshot. It reads data and returns findings, scores and PROPOSED corrections. Nothing
 * here writes to a catalogue, calls a server, or is wired into the Agent. Every finding names its evidence and a proposal for a human.
 */
export type Severity = "high" | "medium" | "low" | "info";
export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

export type EvidenceValue = string | number | boolean | null | (string | number)[];
export type Evidence = Record<string, EvidenceValue>;

export interface Finding {
  /** Stable, dotted code, e.g. "dup.strong". Never reused for a different meaning. */
  code: string;
  severity: Severity;
  /** Product ids the finding is about (empty for shop-level findings). */
  productIds: string[];
  message: string;
  evidence: Evidence;
  /** What a PERSON could do. The tool never applies it. */
  proposal: string;
  /** True when the finding rests on an assumption that the owner can tune (for example a price floor). */
  assumption?: boolean;
}

export interface AuditVariant {
  key: string;
  sku?: string;
  storage?: string;
  color?: string;
  price: number | null;
  priceWireOk: boolean;
  salePrice: number | null;
  discountActive: boolean;
  availability: string;
  qty: number | null;
}

/** A product as the audit sees it: a lenient reading of the Agent's raw product. Bad values are kept as null/flags, never thrown. */
export interface AuditProduct {
  index: number;
  id: string;
  name: string;
  nameLength: number;
  sku?: string;
  externalId?: string;
  description?: string;
  descriptionLength: number;
  brand?: string;
  category?: string;
  subCategory?: string;
  model?: string;
  condition?: string;
  warrantyMonths: number | null;
  imageCount: number;
  imageUrls: string[];
  price: number | null;
  priceProblem: string | null;
  priceWireOk: boolean;
  salePrice: number | null;
  discountActive: boolean;
  variants: AuditVariant[];
  invalidVariants: number;
  availability: string;
  qty: number | null;
  publishedAt?: string;
  updatedAt?: string;
  /** Reasons the Agent's strict listing schema (`RawProduct`) would refuse this record. Empty when it would accept it. */
  wireProblems: string[];
}

export interface SpecRow {
  name: string;
  value: string;
  unit?: string;
  group?: string;
}

export interface AccessoryLinkInput {
  sourceItemId: string;
  accessoryItemId: string;
  kind?: string;
}

export interface InvalidRecord {
  index: number;
  reason: string;
}

export interface AuditInput {
  products: AuditProduct[];
  invalid: InvalidRecord[];
  /** Published specification rows keyed by product id, or undefined when the caller did not supply website content. */
  content?: Record<string, SpecRow[]>;
  /** Staff-made accessory links, or undefined when the caller did not supply them. */
  links?: AccessoryLinkInput[];
  currency?: string;
}

export interface AuditOptions {
  /** Smallest category size for outlier statistics. Below it the check is skipped and reported as skipped (default 8). */
  minSampleForOutliers?: number;
  /** Modified z-score above which a log-price is an outlier (default 3.5). */
  outlierThreshold?: number;
  /** ASSUMPTION: lowest plausible price per category node, in the shop currency (LKR). Tune to the shop. */
  priceFloors?: Record<string, number>;
  /** Readiness thresholds used by the gates. */
  thresholds?: Partial<GateThresholds>;
}

export interface GateThresholds {
  /** D6: share of in-stock products that carry every ranking field. */
  specCoverage: number;
  /** D1 proxy: share of in-stock products with no price finding. The shop must still confirm real prices. */
  priceClean: number;
  /** D3 */
  categoryConsistent: number;
  /** D4 */
  nameOk: number;
  /** D8 */
  descriptionReal: number;
  /** D7 */
  accessoryLinked: number;
  /** Smallest category size treated as more than an anecdote. */
  minProducts: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  specCoverage: 0.7,
  priceClean: 0.95,
  categoryConsistent: 0.95,
  nameOk: 0.95,
  descriptionReal: 0.8,
  accessoryLinked: 0.8,
  minProducts: 3,
};
