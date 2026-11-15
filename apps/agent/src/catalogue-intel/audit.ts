import { nodeById, type CategoryStatus, type NodeId } from "./categories";
import { categoryFindings } from "./checks-category";
import { contentFindings } from "./checks-content";
import { duplicateFindings } from "./checks-duplicates";
import { identityFindings } from "./checks-identity";
import { priceFindings } from "./checks-price";
import { analyseSpecs, specFindings, type SpecAnalysis } from "./checks-specs";
import { accessoryFindings, stockFindings } from "./checks-stock";
import { buildContext } from "./context";
import { categoryStats, productAudits, recommendationGate, shopStats, type CategoryStats, type GateDecision, type ProductAudit, type ShopStats } from "./readiness";
import { SEVERITY_RANK, type AuditInput, type AuditOptions, type Finding, type GateThresholds, type Severity } from "./types";

export const TOOL = { name: "volta-catalogue-intel", version: "1.0.0" } as const;

export interface CategoryMappingRow {
  productId: string;
  name: string;
  filed: string | null;
  status: CategoryStatus;
  proposedNode: NodeId | null;
  proposedName: string | null;
  evidence: string | null;
  /** Always true: nothing in this report is applied without a person. */
  humanDecision: boolean;
}

export interface Report {
  tool: typeof TOOL;
  scope: { products: number; invalidRecords: number; contentSupplied: boolean; linksSupplied: boolean; currency: string | null };
  summary: {
    findingsBySeverity: Record<Severity, number>;
    findingsByCode: Record<string, number>;
    verdicts: Record<"ready" | "limited" | "not_ready", number>;
    /** Per dimension, the share of products passing each dimension's checks completely, and the mean of the values: SEPARATE numbers, never combined. */
    dimensions: Record<string, { meanValue: number | null; productsFullyPassing: number; productsMeasured: number }>;
    /** Checks that could not run, and why. */
    skippedChecks: string[];
  };
  findings: Finding[];
  products: ProductAudit[];
  categories: CategoryStats[];
  shop: ShopStats;
  gates: GateDecision[];
  categoryMapping: CategoryMappingRow[];
  thresholds: GateThresholds;
}

const sevOrder = (a: Finding, b: Finding): number => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.code.localeCompare(b.code) || (a.productIds[0] ?? "").localeCompare(b.productIds[0] ?? "") || a.message.localeCompare(b.message);

/** Runs every check. Pure and deterministic: the same input and options give the same report; nothing is read from or written to anywhere. */
export function runAudit(input: AuditInput, options: AuditOptions = {}): Report {
  const ctx = buildContext(input, options);
  const analyses = new Map<string, SpecAnalysis>();
  for (const p of input.products) if (!analyses.has(p.id)) analyses.set(p.id, analyseSpecs(p, ctx));

  const findings = [
    ...identityFindings(ctx),
    ...duplicateFindings(ctx),
    ...categoryFindings(ctx),
    ...priceFindings(ctx),
    ...contentFindings(ctx),
    ...specFindings(ctx, analyses),
    ...stockFindings(ctx),
    ...accessoryFindings(ctx),
  ].sort(sevOrder);

  const products = productAudits(ctx, findings, analyses);
  const categories = categoryStats(ctx, products, analyses, findings);
  const shop = shopStats(ctx, products);
  const gates = categories.map((c) => recommendationGate(c, shop, ctx.thresholds));

  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  const byCode: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity]++;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }
  const dims = ["identity", "classification", "price", "stock", "specifications", "content"] as const;
  const dimensions: Report["summary"]["dimensions"] = {};
  for (const d of dims) {
    const vals = products.map((p) => p.dimensions[d].value).filter((v): v is number => v !== null);
    dimensions[d] = { meanValue: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000 : null, productsFullyPassing: vals.filter((v) => v === 1).length, productsMeasured: vals.length };
  }
  const categoryMapping: CategoryMappingRow[] = products
    .filter((p) => p.categoryStatus !== "exact")
    .map((p) => {
      const c = ctx.classes.get(p.id)!;
      return { productId: p.id, name: p.name, filed: p.categoryFiled, status: p.categoryStatus, proposedNode: p.proposedNode, proposedName: p.proposedNode ? nodeById(p.proposedNode).name : null, evidence: c.inferred.evidence.join("; ") || (c.note || null), humanDecision: true };
    });

  return {
    tool: TOOL,
    scope: { products: input.products.length, invalidRecords: input.invalid.length, contentSupplied: input.content !== undefined, linksSupplied: input.links !== undefined, currency: input.currency ?? null },
    summary: {
      findingsBySeverity: bySeverity,
      findingsByCode: Object.fromEntries(Object.entries(byCode).sort(([a], [b]) => a.localeCompare(b))),
      verdicts: { ready: products.filter((p) => p.verdict === "ready").length, limited: products.filter((p) => p.verdict === "limited").length, not_ready: products.filter((p) => p.verdict === "not_ready").length },
      dimensions,
      skippedChecks: [...new Set(ctx.skipped)],
    },
    findings,
    products,
    categories,
    shop,
    gates,
    categoryMapping,
    thresholds: ctx.thresholds,
  };
}
