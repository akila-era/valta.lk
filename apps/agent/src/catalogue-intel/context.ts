import { classify, type Classification } from "./categories";
import { nameKey } from "./text";
import type { AuditInput, AuditOptions, AuditProduct, Evidence, Finding, GateThresholds, Severity } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";

/** ASSUMPTION: lowest plausible selling price per node in LKR. A price under it is "confirm this", never "this is wrong". Tune with `options.priceFloors`. */
export const DEFAULT_PRICE_FLOORS: Record<string, number> = {
  "mobile-phones": 5_000,
  tablets: 10_000,
  "smart-watches": 3_000,
  laptops: 40_000,
  "power-banks": 1_000,
  chargers: 300,
  cables: 150,
  "audio-devices": 500,
  "phone-accessories": 100,
  "computer-accessories": 200,
};

export interface Context {
  input: AuditInput;
  products: AuditProduct[];
  byId: Map<string, AuditProduct>;
  classes: Map<string, Classification>;
  knownBrands: Set<string>;
  floors: Record<string, number>;
  minSample: number;
  outlierThreshold: number;
  thresholds: GateThresholds;
  /** Checks that could not run, and why (reported, never hidden). */
  skipped: string[];
  currencyIsLkr: boolean;
}

export function buildContext(input: AuditInput, options: AuditOptions = {}): Context {
  const byId = new Map<string, AuditProduct>();
  for (const p of input.products) if (!byId.has(p.id)) byId.set(p.id, p);
  // A brand is "known" when it is the brand of a product, so a category equal to it is a brand used as a category.
  const knownBrands = new Set<string>();
  for (const p of input.products) if (p.brand) knownBrands.add(nameKey(p.brand));
  for (const b of ["apple", "samsung", "xiaomi", "huawei", "oppo", "vivo", "nokia", "sony", "lenovo", "dell", "hp", "asus", "acer", "anker", "baseus", "jbl", "realme", "oneplus", "google", "msi", "logitech"]) knownBrands.add(b);
  const classes = new Map<string, Classification>();
  for (const p of input.products) if (!classes.has(p.id)) classes.set(p.id, classify(p, knownBrands));
  return {
    input,
    products: input.products,
    byId,
    classes,
    knownBrands,
    floors: { ...DEFAULT_PRICE_FLOORS, ...(options.priceFloors ?? {}) },
    minSample: options.minSampleForOutliers ?? 8,
    outlierThreshold: options.outlierThreshold ?? 3.5,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) },
    skipped: [],
    currencyIsLkr: !input.currency || input.currency.toUpperCase() === "LKR",
  };
}

export function finding(code: string, severity: Severity, productIds: string[], message: string, evidence: Evidence, proposal: string, assumption = false): Finding {
  return { code, severity, productIds, message, evidence, proposal, ...(assumption ? { assumption } : {}) };
}

/** Evidence must stay small: ids and short strings only, never whole descriptions. */
export const clip = (s: string | undefined | null, n = 80): string | null => (s == null ? null : s.length > n ? `${s.slice(0, n)}…` : s);

export const inStock = (p: AuditProduct): boolean => (p.variants.length ? p.variants.some((v) => v.availability === "IN_STOCK" && (v.qty ?? 0) > 0) : p.availability === "IN_STOCK" && (p.qty ?? 0) > 0);
