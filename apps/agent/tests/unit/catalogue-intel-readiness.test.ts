import { describe, expect, it } from "vitest";
import { BLOCKING_CODES, DEFAULT_THRESHOLDS, recommendationGate, renderMarkdown } from "../../src/catalogue-intel";
import { audit, phoneSpecs, product, variant, type Raw } from "../fixtures/catalogue-intel/builders";

const id = (p: Raw): string => String(p.id);
const fullContent = (ps: Raw[]) => ({ items: ps.map((p) => ({ id: id(p), specs: phoneSpecs() })) });

describe("product verdicts", () => {
  it("is 'ready' only with positive evidence: controlled category, real description, measured specification coverage", () => {
    const p = product();
    const r = audit([p], { content: fullContent([p]) });
    expect(r.products[0]!.verdict).toBe("ready");
  });
  it("is only 'limited' when specifications were never supplied, even with no serious finding", () => {
    expect(audit([product()]).products[0]!.verdict).toBe("limited");
  });
  it("is 'limited' for a category outside the tree or an empty description", () => {
    const a = product({ category: "watch", name: "watch2", model: null });
    const b = product({ description: null });
    const r = audit([a, b], { content: fullContent([a, b]) });
    expect(r.products.map((x) => x.verdict)).toEqual(["limited", "limited"]);
  });
  it("is 'not_ready' with a blocking finding, and names the blockers", () => {
    const dupA = product({ name: "iPhone 11 Pro", brand: "Apple", sku: "9", variants: [variant({ key: "a", sku: "Z-1" })] });
    const dupB = product({ name: "iPhone 11 Pro", brand: "Apple", sku: "9-ABCD", variants: [variant({ key: "a", sku: "Z-1" })] });
    const generic = product({ name: "13" });
    const cheap = product({ price: "1000.00" });
    const r = audit([dupA, dupB, generic, cheap]);
    const by = new Map(r.products.map((p) => [p.id, p]));
    expect(by.get(id(dupA))!.blockers).toContain("dup.strong");
    expect(by.get(id(generic))!.blockers).toContain("name.generic");
    expect(by.get(id(cheap))!.blockers).toContain("price.below_plausible_floor");
    expect([...by.values()].every((p) => p.verdict === "not_ready")).toBe(true);
  });
  it("keeps the blocking list stable and every blocking code is one the tool can emit", () => {
    expect([...BLOCKING_CODES].sort()).toEqual(
      ["agent.not_cardable", "agent.wire_rejected", "category.conflict", "category.junk", "dup.strong", "dup.variant_conflict", "input.record_invalid", "name.empty", "name.generic", "price.below_plausible_floor", "price.format", "price.nonpositive", "price.placeholder", "price.sale_nonpositive"].sort(),
    );
  });
});

describe("dimensions are separate and never combined", () => {
  it("exposes six dimensions per product and no overall score anywhere", () => {
    const r = audit([product()]);
    expect(Object.keys(r.products[0]!.dimensions).sort()).toEqual(["classification", "content", "identity", "price", "specifications", "stock"]);
    // No blended number: neither the report, its summary, a product, a category nor a gate has an overall/score/accuracy field.
    const banned = /^(score|overall|total|accuracy|quality|grade|rating)/i;
    const levels = [r, r.summary, r.products[0]!, r.categories[0]!, r.gates[0]!, r.shop, r.products[0]!.dimensions];
    for (const o of levels) expect(Object.keys(o).filter((k) => banned.test(k))).toEqual([]);
    expect(Object.keys(r.summary.dimensions)).toHaveLength(6);
  });
  it("lists each check inside a dimension so a number can be traced", () => {
    const d = audit([product()]).products[0]!.dimensions.identity;
    expect(d.checks.length).toBeGreaterThan(3);
    expect(d.value).toBe(d.checks.filter((c) => c.ok).length / d.checks.length);
  });
});

describe("recommendation gates", () => {
  it("switches features on only when every threshold is met", () => {
    const ps = Array.from({ length: 4 }, () => product());
    const charger = product({ name: "65W GaN charger", category: "Chargers", brand: "Anker", model: null });
    const links = ps.map((p) => ({ sourceItemId: id(p), accessoryItemId: id(charger) }));
    const r = audit([...ps, charger], { content: { items: ps.map((p) => ({ id: id(p), specs: phoneSpecs() })) }, links });
    const g = r.gates.find((x) => x.category === "Mobile Phones")!;
    expect(g.lowSample).toBe(false);
    expect(g.features.specAdvice).toEqual({ enabled: true, reasons: [] });
    expect(g.features.budgetAdvice.enabled).toBe(true);
    expect(g.features.comparison.enabled).toBe(true);
    expect(g.features.accessorySuggestions.enabled).toBe(true);
  });
  it("fails closed: no content, no links, no in-stock products all mean 'off, not demonstrated'", () => {
    const p = product();
    const r = audit([p]);
    const g = r.gates[0]!;
    expect(g.features.specAdvice.enabled).toBe(false);
    expect(g.features.specAdvice.reasons.join(" ")).toMatch(/not supplied/);
    expect(g.features.accessorySuggestions.reasons.join(" ")).toMatch(/not supplied/);
    const oos = product({ availability: "OUT_OF_STOCK", purchasableQuantity: 0, variants: [variant({ availability: "OUT_OF_STOCK", purchasableQuantity: 0 })] });
    const g2 = audit([oos], { content: fullContent([oos]) }).gates[0]!;
    expect(g2.features.budgetAdvice.enabled).toBe(false);
    expect(g2.features.budgetAdvice.reasons.join(" ")).toMatch(/no in-stock products/);
  });
  it("turns everything about price and comparison off for placeholder prices and unresolved duplicates, and says exactly why", () => {
    const a = product({ name: "iPhone 11 Pro", brand: "Apple", sku: "9", price: "1000.00", variants: [variant({ key: "a", sku: "Z-1", price: "1000.00" })] });
    const b = product({ name: "iPhone 11 Pro", brand: "Apple", sku: "9-ABCD", price: "1000.00", variants: [variant({ key: "a", sku: "Z-1", price: "1000.00" })] });
    const r = audit([a, b], { content: fullContent([a, b]) });
    const g = r.gates[0]!;
    expect(g.lowSample).toBe(true);
    expect(g.features.budgetAdvice.enabled).toBe(false);
    expect(g.features.budgetAdvice.reasons.join(" ")).toMatch(/price plausibility/);
    expect(g.features.comparison.reasons.join(" ")).toMatch(/duplicates/);
  });
  it("is a pure function of the statistics and the thresholds, so the owner can tighten or relax it", () => {
    const p = product();
    const r = audit([p], { content: fullContent([p]) });
    const stats = r.categories[0]!;
    const strict = recommendationGate(stats, r.shop, { ...DEFAULT_THRESHOLDS, specCoverage: 1.01 });
    expect(strict.features.specAdvice.enabled).toBe(false);
    expect(recommendationGate(stats, r.shop, DEFAULT_THRESHOLDS).features.specAdvice.enabled).toBe(true);
  });
  it("a kind with no ranking field never gets spec advice", () => {
    const cable = product({ name: "USB C cable", category: "Cables", brand: "Anker", model: null });
    const r = audit([cable]);
    expect(r.gates[0]!.features.specAdvice.enabled).toBe(false);
  });
});

describe("report properties", () => {
  it("is deterministic and JSON-serialisable", () => {
    const ps = [product(), product({ name: "13", category: "apple" })];
    const a = JSON.stringify(audit(ps));
    expect(JSON.stringify(audit(ps))).toBe(a);
    expect(() => JSON.parse(a)).not.toThrow();
  });
  it("sorts findings by severity, then code", () => {
    const r = audit([product({ name: "13", price: "1000.00", description: null, images: [] })]);
    const sev = r.findings.map((f) => f.severity);
    const rank = { high: 3, medium: 2, low: 1, info: 0 } as const;
    for (let i = 1; i < sev.length; i++) expect(rank[sev[i - 1]!]).toBeGreaterThanOrEqual(rank[sev[i]!]);
  });
  it("every finding carries evidence and a human proposal, and no proposal claims to have changed anything", () => {
    const r = audit([product({ name: "13", category: "apple", price: "1000.00", description: "asdf" }), product({ name: "13", category: "apple", price: "1000.00", description: "asdf" })]);
    for (const f of r.findings) {
      expect(f.proposal.length).toBeGreaterThan(5);
      expect(f.proposal).not.toMatch(/\b(was|were) (changed|deleted|merged|applied)\b/i);
      expect(typeof f.evidence).toBe("object");
    }
  });
  it("renders a markdown report that states scope, limits and that nothing was applied", () => {
    const md = renderMarkdown(audit([product(), product({ name: "13", category: "apple" })]));
    expect(md).toMatch(/nothing in this report has been applied/i);
    expect(md).toMatch(/Scope and limits/);
    expect(md).toMatch(/never combined/);
    expect(md).toMatch(/Category mapping proposals/);
  });
  it("cuts long finding lists with an explicit count", () => {
    const many = Array.from({ length: 30 }, () => product({ description: null }));
    expect(renderMarkdown(audit(many))).toMatch(/and 22 more/);
  });
});

describe("comparison gate needs something to compare", () => {
  it("is off for a category with a single product, whatever its quality", () => {
    const p = product();
    const r = audit([p], { content: fullContent([p]) });
    expect(r.gates[0]!.features.comparison.enabled).toBe(false);
    expect(r.gates[0]!.features.comparison.reasons.join(" ")).toMatch(/nothing to compare/);
  });
});
