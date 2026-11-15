import type { ProfileId } from "./categories";
import { nodeById } from "./categories";
import { clip, finding, type Context } from "./context";
import { gb } from "./checks-price";
import { DESCRIPTION_READERS, EMPTY_VALUE, FIELDS, PROFILES, type FieldKey } from "./profiles";
import { plain } from "./text";
import type { AuditProduct, Finding, SpecRow } from "./types";

export interface SpecAnalysis {
  profile: ProfileId | null;
  confidence: "high" | "low" | "none";
  contentSupplied: boolean;
  required: FieldKey[];
  present: FieldKey[];
  missing: FieldKey[];
  /** Fields found only in the description text (the Agent reads three of them from there and marks the source). */
  descriptionOnly: FieldKey[];
  rank: FieldKey[];
  rankPresent: FieldKey[];
  /** present/required, or null when the kind of product is unknown (not zero: unknown is not the same as empty). */
  coverage: number | null;
  rankCoverage: number | null;
  rows: SpecRow[];
}

const rowText = (r: SpecRow): string => (r.unit && !r.value.toLowerCase().includes(r.unit.toLowerCase()) ? `${r.value} ${r.unit}` : r.value).trim();
const usable = (r: SpecRow): boolean => rowText(r) !== "" && !EMPTY_VALUE.test(rowText(r));

export function analyseSpecs(p: AuditProduct, ctx: Context): SpecAnalysis {
  const c = ctx.classes.get(p.id);
  const node = c?.profileNode ?? null;
  const profileId = node ? nodeById(node).profile : null;
  const rows = ctx.input.content?.[p.id] ?? [];
  const base = { contentSupplied: ctx.input.content !== undefined, rows };
  if (!profileId) return { ...base, profile: null, confidence: "none", required: [], present: [], missing: [], descriptionOnly: [], rank: [], rankPresent: [], coverage: null, rankCoverage: null };
  const profile = PROFILES[profileId];
  const present: FieldKey[] = [];
  const descriptionOnly: FieldKey[] = [];
  const desc = plain(p.description ?? "");
  for (const key of profile.required) {
    const f = FIELDS[key];
    let ok = rows.some((r) => f.nameRe.test(r.name) && usable(r));
    if (!ok && key === "storage") ok = p.variants.some((v) => gb(v.storage) !== null);
    if (ok) present.push(key);
    else {
      const reader = DESCRIPTION_READERS[key];
      if (reader && reader.test(desc)) descriptionOnly.push(key);
    }
  }
  const missing = profile.required.filter((k) => !present.includes(k));
  const rankPresent = profile.rank.filter((k) => present.includes(k));
  return {
    ...base,
    profile: profileId,
    confidence: c?.profileConfidence ?? "none",
    required: profile.required,
    present,
    missing,
    descriptionOnly,
    rank: profile.rank,
    rankPresent,
    coverage: profile.required.length ? present.length / profile.required.length : null,
    rankCoverage: profile.rank.length ? rankPresent.length / profile.rank.length : null,
  };
}

export function specFindings(ctx: Context, analyses: Map<string, SpecAnalysis>): Finding[] {
  const out: Finding[] = [];
  if (ctx.input.content === undefined) ctx.skipped.push("specification content was not supplied: coverage reflects variant storage only, so 'missing' specification findings are informational. Supply the website's published rows (relay /content) for a real measurement.");
  for (const p of ctx.input.products) {
    const a = analyses.get(p.id);
    if (!a) continue;
    const ids = [p.id];
    if (a.profile === null) {
      out.push(finding("spec.profile_unknown", "low", ids, "The kind of product is not established, so no specification profile applies and coverage is not computed (unknown, not zero).", {}, "Decide the category first; the profile follows from it."));
      continue;
    }
    if (a.missing.length) {
      const sev = !a.contentSupplied ? "info" : (a.coverage ?? 0) < 0.5 ? "medium" : "low";
      out.push(
        finding(
          "spec.missing_required",
          sev,
          ids,
          `Specifications: ${a.present.length} of ${a.required.length} required fields present for a ${a.profile}.`,
          { profile: a.profile, profileConfidence: a.confidence, missing: a.missing, descriptionOnly: a.descriptionOnly, contentSupplied: a.contentSupplied },
          "Staff enter the missing rows with the canonical names (docs/VOLTA_PRODUCT_SPECIFICATION_SCHEMA.md); nothing is guessed from the name or price.",
        ),
      );
    }
    if (a.descriptionOnly.length) out.push(finding("spec.from_description_only", "low", ids, "Some numbers appear only in the free-text description; the Agent can read them but will label the source as a description.", { fields: a.descriptionOnly }, "Move them into specification rows."));
    for (const r of a.rows) {
      for (const key of a.required) {
        const f = FIELDS[key];
        if (!f.nameRe.test(r.name)) continue;
        const text = rowText(r);
        if (text !== "" && EMPTY_VALUE.test(text)) out.push(finding("spec.value_placeholder", "low", ids, `The "${clip(r.name, 40)}" row has no real value.`, { name: clip(r.name, 40), value: clip(text, 20) }, "Remove the row or enter the value."));
        else if (text !== "") {
          if (r.name !== f.label && r.name.toLowerCase() !== f.label.toLowerCase()) out.push(finding("spec.label_noncanonical", "low", ids, `The row "${clip(r.name, 40)}" is not spelled as the schema asks ("${f.label}").`, { name: clip(r.name, 40), canonical: f.label }, "Use the canonical name so the Agent and the comparison table recognise it."));
          if (f.agentRe && !f.agentRe.test(text)) out.push(finding("spec.agent_unparseable", "medium", ids, `The "${clip(r.name, 40)}" value has no number and unit the Agent can read, so shoppers would be told it has no details.`, { name: clip(r.name, 40), value: clip(text, 40), expected: f.range?.unit ?? "number with unit" }, `Write the value with its unit (for example "${key === "battery" ? "5000 mAh" : key === "camera" ? "12 MP" : key === "ram" ? "8 GB" : "128 GB"}").`));
          if (f.range) {
            const m = f.range.take.exec(text);
            const n = m ? Number(m[1]) : NaN;
            if (Number.isFinite(n) && (n < f.range.min || n > f.range.max)) out.push(finding("spec.value_out_of_range", "medium", ids, `The "${clip(r.name, 40)}" value ${n} ${f.range.unit} is outside the plausible range ${f.range.min} to ${f.range.max}.`, { name: clip(r.name, 40), value: n, min: f.range.min, max: f.range.max }, "Check the value and its unit."));
          }
        }
      }
    }
  }
  if (ctx.input.content) {
    const orphans = Object.keys(ctx.input.content).filter((id) => !ctx.byId.has(id));
    if (orphans.length) out.push(finding("spec.orphan_rows", "info", [], `${orphans.length} specification row set(s) belong to product ids that are not in this catalogue.`, { count: orphans.length, sample: orphans.slice(0, 5) }, "Do not delete. Report them to staff: they may belong to a previous catalogue."));
  }
  return out;
}
