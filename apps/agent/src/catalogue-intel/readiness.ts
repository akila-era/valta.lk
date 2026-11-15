import { nodeById, type CategoryStatus, type NodeId } from "./categories";
import { describe } from "./checks-content";
import type { SpecAnalysis } from "./checks-specs";
import { inStock, type Context } from "./context";
import { PROFILES } from "./profiles";
import { nameKey } from "./text";
import { SEVERITY_RANK, type Finding, type GateThresholds } from "./types";

/**
 * Readiness is reported as SEPARATE dimensions (identity, classification, price, stock, specifications, content), each a share of its own checks, plus a
 * verdict. There is deliberately no single combined score: one number would hide which part is broken and would not be comparable with any model metric.
 */
export interface Dimension {
  value: number | null;
  checks: { name: string; ok: boolean }[];
}

export type Verdict = "ready" | "limited" | "not_ready";

export interface ProductAudit {
  id: string;
  name: string;
  brand: string | null;
  categoryFiled: string | null;
  categoryStatus: CategoryStatus;
  proposedNode: NodeId | null;
  profile: string | null;
  inStock: boolean;
  dimensions: { identity: Dimension; classification: Dimension; price: Dimension; stock: Dimension; specifications: Dimension; content: Dimension };
  specCoverage: number | null;
  verdict: Verdict;
  /** Finding codes that make the product not fit for recommendations. */
  blockers: string[];
  findingCodes: string[];
}

/** `ready` = positive evidence on every dimension; `limited` = not blocked but not proven; `not_ready` = a blocking finding.
 * A finding with one of these codes makes the product `not_ready`. The list is part of the tool's contract and is tested. */
export const BLOCKING_CODES: ReadonlySet<string> = new Set([
  "input.record_invalid",
  "agent.wire_rejected",
  "agent.not_cardable",
  "name.empty",
  "name.generic",
  "dup.strong",
  "dup.variant_conflict",
  "category.conflict",
  "category.junk",
  "price.format",
  "price.nonpositive",
  "price.placeholder",
  "price.below_plausible_floor",
  "price.sale_nonpositive",
]);

const dim = (checks: { name: string; ok: boolean }[]): Dimension => ({ value: checks.length ? checks.filter((c) => c.ok).length / checks.length : null, checks });

export function groupByProduct(findings: Finding[]): Map<string, Finding[]> {
  const m = new Map<string, Finding[]>();
  for (const f of findings) for (const id of f.productIds) m.set(id, [...(m.get(id) ?? []), f]);
  return m;
}

export function productAudits(ctx: Context, findings: Finding[], specs: Map<string, SpecAnalysis>): ProductAudit[] {
  const by = groupByProduct(findings);
  const out: ProductAudit[] = [];
  for (const p of ctx.input.products) {
    const fs = by.get(p.id) ?? [];
    const has = (...codes: string[]) => fs.some((f) => codes.includes(f.code));
    const c = ctx.classes.get(p.id)!;
    const a = specs.get(p.id)!;
    const identity = dim([
      { name: "name identifies a product", ok: !has("name.empty", "name.generic") },
      { name: "brand recorded", ok: !has("brand.missing") },
      { name: "model recorded and informative", ok: !!p.model && !has("model.repeats_brand") },
      { name: "SKU recorded and not placeholder", ok: !!p.sku && !has("sku.placeholder", "sku.duplicate") },
      { name: "record accepted by the Agent and showable as a card", ok: !has("agent.wire_rejected", "agent.not_cardable") },
    ]);
    const classification = dim([
      { name: "filed category is a controlled node", ok: c.status === "exact" },
      { name: "category points somewhere sensible (exact or candidate)", ok: c.status === "exact" || c.status === "candidate" },
    ]);
    const price = dim([
      { name: "price readable and positive", ok: !has("price.format", "price.nonpositive", "price.sale_nonpositive") },
      { name: "not a placeholder value", ok: !has("price.placeholder") },
      { name: "not below the assumed plausible floor", ok: !has("price.below_plausible_floor") },
      { name: "no larger-storage-cheaper variants", ok: !has("price.variant_inversion") },
      { name: "sale price consistent", ok: !has("price.sale_not_lower") },
    ]);
    const stock = dim([
      { name: "availability matches quantity", ok: !has("stock.inconsistent", "stock.invalid_quantity") },
      { name: "product and variants agree", ok: !has("stock.product_variant_mismatch") },
      { name: "no conflicting duplicate record", ok: !has("dup.variant_conflict") },
    ]);
    const specifications: Dimension = a.profile === null ? { value: null, checks: [] } : { value: a.coverage, checks: a.required.map((k) => ({ name: k, ok: a.present.includes(k) })) };
    const content = dim([
      { name: "description is real text", ok: describe(p) === "ok" },
      { name: "has an image", ok: p.imageCount > 0 },
      { name: "warranty recorded", ok: p.warrantyMonths !== null },
    ]);
    const blockers = [...new Set(fs.filter((f) => BLOCKING_CODES.has(f.code)).map((f) => f.code))];
    // "ready" needs POSITIVE evidence, not just the absence of serious findings: a controlled category, a real description, and measured specification
    // coverage at or above the threshold. Anything less that is not blocked is "limited".
    const proven = c.status === "exact" && describe(p) === "ok" && a.contentSupplied && a.coverage !== null && a.coverage >= ctx.thresholds.specCoverage;
    const limited = !proven || fs.some((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
    out.push({
      id: p.id,
      name: p.name.slice(0, 120),
      brand: p.brand ?? null,
      categoryFiled: p.category ?? null,
      categoryStatus: c.status,
      proposedNode: c.proposedNode,
      profile: a.profile,
      inStock: inStock(p),
      dimensions: { identity, classification, price, stock, specifications, content },
      specCoverage: a.coverage,
      verdict: blockers.length ? "not_ready" : limited ? "limited" : "ready",
      blockers,
      findingCodes: [...new Set(fs.map((f) => f.code))].sort(),
    });
  }
  return out;
}

export interface CategoryStats {
  /** The category as filed (spelling of the first product), or "(none)". */
  category: string;
  key: string;
  products: number;
  inStock: number;
  verdicts: Record<Verdict, number>;
  /** In-stock products carrying every ranking field / in-stock products whose kind has ranking fields. null = not applicable. */
  specRankShare: number | null;
  /** In-stock products with no price finding of medium or higher severity / in-stock products. */
  priceCleanShare: number | null;
  categoryConsistentShare: number | null;
  nameOkShare: number | null;
  descriptionRealShare: number | null;
  /** Products involved in a strong duplicate or a variant conflict. */
  strongDuplicates: number;
  /** Accessory products linked to at least one device / accessory products in this category. null = no accessories or no links supplied. */
  accessoryLinkedShare: number | null;
  contentSupplied: boolean;
}

const share = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export function categoryStats(ctx: Context, audits: ProductAudit[], specs: Map<string, SpecAnalysis>, findings: Finding[]): CategoryStats[] {
  const by = groupByProduct(findings);
  const links = ctx.input.links;
  const linked = new Set((links ?? []).map((l) => l.accessoryItemId));
  const groups = new Map<string, { label: string; items: ProductAudit[] }>();
  for (const a of audits) {
    const key = a.categoryFiled ? nameKey(a.categoryFiled) || "(none)" : "(none)";
    const g = groups.get(key) ?? { label: a.categoryFiled ?? "(none)", items: [] };
    g.items.push(a);
    groups.set(key, g);
  }
  const out: CategoryStats[] = [];
  for (const [key, g] of groups) {
    const stocked = g.items.filter((a) => a.inStock);
    const applicable = stocked.filter((a) => (specs.get(a.id)?.rank.length ?? 0) > 0);
    const rankComplete = applicable.filter((a) => {
      const s = specs.get(a.id)!;
      return s.rankPresent.length === s.rank.length;
    });
    const priceBad = (id: string) => (by.get(id) ?? []).some((f) => f.code.startsWith("price.") && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
    const accessories = g.items.filter((a) => {
      const n = a.proposedNode ?? null;
      const profile = a.profile ? PROFILES[a.profile as keyof typeof PROFILES] : null;
      return profile !== null && n !== null && nodeById(n).accessory;
    });
    out.push({
      category: g.label,
      key,
      products: g.items.length,
      inStock: stocked.length,
      verdicts: {
        ready: g.items.filter((a) => a.verdict === "ready").length,
        limited: g.items.filter((a) => a.verdict === "limited").length,
        not_ready: g.items.filter((a) => a.verdict === "not_ready").length,
      },
      specRankShare: share(rankComplete.length, applicable.length),
      priceCleanShare: share(stocked.filter((a) => !priceBad(a.id)).length, stocked.length),
      categoryConsistentShare: share(g.items.filter((a) => a.categoryStatus === "exact").length, g.items.length),
      nameOkShare: share(g.items.filter((a) => !a.findingCodes.includes("name.generic") && !a.findingCodes.includes("name.empty")).length, g.items.length),
      descriptionRealShare: share(g.items.filter((a) => (ctx.byId.get(a.id) ? describe(ctx.byId.get(a.id)!) === "ok" : false)).length, g.items.length),
      strongDuplicates: g.items.filter((a) => a.findingCodes.includes("dup.strong") || a.findingCodes.includes("dup.variant_conflict")).length,
      accessoryLinkedShare: links === undefined ? null : share(accessories.filter((a) => linked.has(a.id)).length, accessories.length),
      contentSupplied: ctx.input.content !== undefined,
    });
  }
  return out.sort((a, b) => b.products - a.products || a.key.localeCompare(b.key));
}

export interface ShopStats {
  /** Accessory products linked / accessory products across the whole shop. null = no accessories, or links were not supplied. */
  accessoryLinkedShare: number | null;
  linksSupplied: boolean;
}

export function shopStats(ctx: Context, audits: ProductAudit[]): ShopStats {
  const links = ctx.input.links;
  const linked = new Set((links ?? []).map((l) => l.accessoryItemId));
  const accessories = audits.filter((a) => a.proposedNode !== null && nodeById(a.proposedNode).accessory);
  return { accessoryLinkedShare: links === undefined ? null : share(accessories.filter((a) => linked.has(a.id)).length, accessories.length), linksSupplied: links !== undefined };
}

export type FeatureName = "specAdvice" | "budgetAdvice" | "comparison" | "accessorySuggestions";
export interface FeatureGate {
  enabled: boolean;
  reasons: string[];
}
export interface GateDecision {
  category: string;
  lowSample: boolean;
  features: Record<FeatureName, FeatureGate>;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * Which Agent features should be OFF for a category until the data passes the thresholds (docs/VOLTA_AI_DATA_READINESS_REPORT.md, D1 to D8). A missing
 * measurement fails closed ("not demonstrated"). This function only reports; nothing in the Agent reads it, and the owner decides.
 */
export function recommendationGate(stats: CategoryStats, shop: ShopStats, thresholds: GateThresholds): GateDecision {
  const need = (reasons: string[], label: string, observed: number | null, required: number, naText: string) => {
    if (observed === null) reasons.push(`${label}: ${naText}`);
    else if (observed < required) reasons.push(`${label}: ${pct(observed)} observed, ${pct(required)} required`);
  };
  const noDup = (reasons: string[]) => {
    if (stats.strongDuplicates > 0) reasons.push(`duplicates: ${stats.strongDuplicates} product(s) in unresolved strong duplicate or variant-conflict records`);
  };
  const spec: string[] = [];
  need(spec, "specification coverage of in-stock products", stats.specRankShare, thresholds.specCoverage, stats.inStock === 0 ? "no in-stock products to judge" : "this kind of product has no field the Agent ranks by, or its kind is unknown");
  if (!stats.contentSupplied) spec.push("specification content was not supplied to the audit, so coverage is not demonstrated");
  need(spec, "category correctness", stats.categoryConsistentShare, thresholds.categoryConsistent, "no products");
  noDup(spec);
  const budget: string[] = [];
  need(budget, "price plausibility of in-stock products", stats.priceCleanShare, thresholds.priceClean, stats.inStock === 0 ? "no in-stock products to judge" : "not measurable");
  need(budget, "category correctness", stats.categoryConsistentShare, thresholds.categoryConsistent, "no products");
  noDup(budget);
  const compare: string[] = [];
  if (stats.products < 2) compare.push("comparison: fewer than 2 products in this category, so there is nothing to compare");
  need(compare, "names that identify the product", stats.nameOkShare, thresholds.nameOk, "no products");
  need(compare, "category correctness", stats.categoryConsistentShare, thresholds.categoryConsistent, "no products");
  noDup(compare);
  const acc: string[] = [];
  if (!shop.linksSupplied) acc.push("accessory links were not supplied to the audit, so compatibility is not demonstrated");
  else need(acc, "accessories linked to a device (shop-wide)", shop.accessoryLinkedShare, thresholds.accessoryLinked, "there are no accessory products, or none is linked");
  if (stats.accessoryLinkedShare !== null && stats.accessoryLinkedShare < thresholds.accessoryLinked) acc.push(`accessories linked in this category: ${pct(stats.accessoryLinkedShare)} observed, ${pct(thresholds.accessoryLinked)} required`);
  return {
    category: stats.category,
    lowSample: stats.products < thresholds.minProducts,
    features: {
      specAdvice: { enabled: spec.length === 0, reasons: spec },
      budgetAdvice: { enabled: budget.length === 0, reasons: budget },
      comparison: { enabled: compare.length === 0, reasons: compare },
      accessorySuggestions: { enabled: acc.length === 0, reasons: acc },
    },
  };
}
