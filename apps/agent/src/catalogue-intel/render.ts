import type { Report } from "./audit";
import type { Finding } from "./types";

const PER_CODE = 8;
const esc = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const pct = (x: number | null): string => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
const evidence = (f: Finding): string =>
  Object.entries(f.evidence)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}`)
    .join("; ");

/**
 * The human-readable report. It states its scope and limits first; every finding shows evidence and a PROPOSAL (never an applied change); long lists are cut
 * with an explicit count of what was left out. No blended score appears anywhere.
 */
export function renderMarkdown(r: Report): string {
  const L: string[] = [];
  const s = r.summary;
  L.push("# VOLTA catalogue audit", "");
  L.push(`Tool: ${r.tool.name} ${r.tool.version}. Read-only: **nothing in this report has been applied to any catalogue**; every proposal needs a person.`, "");
  L.push("## Scope and limits", "");
  L.push(`- Products read: **${r.scope.products}**; unreadable records: ${r.scope.invalidRecords}; currency: ${r.scope.currency ?? "not stated (assumed LKR for price checks)"}.`);
  L.push(`- Specification rows supplied: ${r.scope.contentSupplied ? "yes" : "**no** (specification coverage is not demonstrated)"}; accessory links supplied: ${r.scope.linksSupplied ? "yes" : "**no** (compatibility is not demonstrated)"}.`);
  L.push("- Price floors and the placeholder list are **assumptions** (marked); outlier statistics need a minimum sample and are skipped below it.");
  L.push("- A readiness verdict is a data-quality statement, not an accuracy score and not a promise about the assistant's answers.", "");
  if (s.skippedChecks.length) {
    L.push("### Checks that could not run", "");
    for (const c of s.skippedChecks) L.push(`- ${c}`);
    L.push("");
  }

  L.push("## Summary", "");
  L.push("| Severity | Findings |", "|---|---|");
  for (const sev of ["high", "medium", "low", "info"] as const) L.push(`| ${sev} | ${s.findingsBySeverity[sev]} |`);
  L.push("", `Product verdicts: **${s.verdicts.ready} ready**, **${s.verdicts.limited} limited**, **${s.verdicts.not_ready} not ready** (of ${r.scope.products}).`, "");
  L.push("### Dimensions (separate measures, never combined)", "", "| Dimension | Products measured | Fully passing | Mean share of checks passed |", "|---|---|---|---|");
  for (const [d, v] of Object.entries(s.dimensions)) L.push(`| ${d} | ${v.productsMeasured} | ${v.productsFullyPassing} | ${pct(v.meanValue)} |`);
  L.push("");

  L.push("## Categories and feature gates", "", `Thresholds: specifications ${pct(r.thresholds.specCoverage)}, prices ${pct(r.thresholds.priceClean)}, category ${pct(r.thresholds.categoryConsistent)}, names ${pct(r.thresholds.nameOk)}, descriptions ${pct(r.thresholds.descriptionReal)}, accessory links ${pct(r.thresholds.accessoryLinked)}. A missing measurement fails closed.`, "");
  L.push("| Category as filed | Products | In stock | Ready / limited / not ready | Spec | Price | Category | Names | Duplicates |", "|---|---|---|---|---|---|---|---|---|");
  for (const c of r.categories) L.push(`| ${esc(c.category)} | ${c.products} | ${c.inStock} | ${c.verdicts.ready} / ${c.verdicts.limited} / ${c.verdicts.not_ready} | ${pct(c.specRankShare)} | ${pct(c.priceCleanShare)} | ${pct(c.categoryConsistentShare)} | ${pct(c.nameOkShare)} | ${c.strongDuplicates} |`);
  L.push("", "| Category | Spec advice | Budget advice | Comparison | Accessory suggestions | Note |", "|---|---|---|---|---|---|");
  for (const g of r.gates) L.push(`| ${esc(g.category)} | ${g.features.specAdvice.enabled ? "on" : "**off**"} | ${g.features.budgetAdvice.enabled ? "on" : "**off**"} | ${g.features.comparison.enabled ? "on" : "**off**"} | ${g.features.accessorySuggestions.enabled ? "on" : "**off**"} | ${g.lowSample ? "very few products: anecdotal" : ""} |`);
  L.push("", "Reasons a feature is off:", "");
  for (const g of r.gates) for (const [name, f] of Object.entries(g.features)) if (!f.enabled) L.push(`- ${esc(g.category)} / ${name}: ${esc(f.reasons.join("; "))}`);
  L.push("");

  L.push("## Products", "", "| Product | Category status | Identity | Class. | Price | Stock | Specs | Content | Verdict | Blockers |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const p of r.products.slice(0, 200)) {
    const d = p.dimensions;
    L.push(`| ${esc(p.name || "(no name)")} | ${p.categoryStatus} | ${pct(d.identity.value)} | ${pct(d.classification.value)} | ${pct(d.price.value)} | ${pct(d.stock.value)} | ${pct(d.specifications.value)} | ${pct(d.content.value)} | ${p.verdict} | ${p.blockers.join(", ") || "none"} |`);
  }
  if (r.products.length > 200) L.push("", `(${r.products.length - 200} more products are in the JSON report.)`);
  L.push("");

  L.push("## Category mapping proposals (human decision for every row)", "");
  if (r.categoryMapping.length === 0) L.push("Every filed category already names a controlled node.", "");
  else {
    L.push("| Product | Filed | Status | Candidate node | Evidence |", "|---|---|---|---|---|");
    for (const m of r.categoryMapping.slice(0, 200)) L.push(`| ${esc(m.name || m.productId)} | ${esc(m.filed ?? "(none)")} | ${m.status} | ${m.proposedName ?? "none"} | ${esc(m.evidence ?? "")} |`);
    if (r.categoryMapping.length > 200) L.push("", `(${r.categoryMapping.length - 200} more rows are in the JSON report.)`);
    L.push("");
  }

  L.push("## Findings", "");
  const byCode = new Map<string, Finding[]>();
  for (const f of r.findings) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f]);
  for (const [code, list] of byCode) {
    L.push(`### ${code} (${list.length}, ${list[0]!.severity})`, "");
    for (const f of list.slice(0, PER_CODE)) {
      L.push(`- ${esc(f.message)}${f.assumption ? " *(assumption-based)*" : ""} Products: ${f.productIds.slice(0, 4).join(", ") || "shop-wide"}. Evidence: ${esc(evidence(f))}. Proposal: ${esc(f.proposal)}`);
    }
    if (list.length > PER_CODE) L.push(`- … and ${list.length - PER_CODE} more (see the JSON report).`);
    L.push("");
  }
  return `${L.join("\n")}\n`;
}
