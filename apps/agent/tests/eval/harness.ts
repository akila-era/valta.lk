import { detectLanguage } from "../../src/router/language";
import { normalizeMatch } from "../../src/router/normalize";
import { routeMessage } from "../../src/router/router";
import type { Intent, RouteContext, RouteDecision } from "../../src/router/types";
import { MOCK_VOCAB } from "../fixtures/mock-vocab";
import type { Case } from "./sinhala-sets";

export const EMPTY_CONTEXT: RouteContext = { lastShownProductIds: [], cart: [] };

export function route(text: string, ctx: RouteContext = EMPTY_CONTEXT): RouteDecision {
  return routeMessage({ matchText: normalizeMatch(text), rawText: text, vocab: MOCK_VOCAB, context: ctx });
}

export interface Mismatch {
  text: string;
  expected: Intent;
  got: Intent;
  score: number;
  margin: number;
}
export interface EntityMiss {
  text: string;
  field: string;
  expected: unknown;
  got: unknown;
}
export interface Report {
  total: number;
  intentCorrect: number;
  entityChecked: number;
  entityCorrect: number;
  abstained: number;
  perTag: Record<string, { n: number; ok: number }>;
  mismatches: Mismatch[];
  entityMisses: EntityMiss[];
}

function checkEntities(c: Case, d: RouteDecision): EntityMiss[] {
  const out: EntityMiss[] = [];
  const x = c.expect;
  if (!x) return out;
  const e = d.entities;
  const miss = (field: string, expected: unknown, got: unknown) => out.push({ text: c.text, field, expected, got });
  if (x.maxPriceLkr !== undefined && e.maxPriceLkr !== x.maxPriceLkr) miss("maxPriceLkr", x.maxPriceLkr, e.maxPriceLkr);
  if (x.minPriceLkr !== undefined && e.minPriceLkr !== x.minPriceLkr) miss("minPriceLkr", x.minPriceLkr, e.minPriceLkr);
  if (x.productIds) {
    const got = e.products.map((p) => p.id).sort();
    const want = [...x.productIds].sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) miss("productIds", want, got);
  }
  if (x.brand !== undefined && e.brand !== x.brand) miss("brand", x.brand, e.brand);
  if (x.categorySlug !== undefined && e.categorySlug !== x.categorySlug) miss("categorySlug", x.categorySlug, e.categorySlug);
  if (x.quantity !== undefined && e.quantity !== x.quantity) miss("quantity", x.quantity, e.quantity);
  if (x.color !== undefined && !e.colors.includes(x.color)) miss("color", x.color, e.colors);
  if (x.sort !== undefined && e.sort !== x.sort) miss("sort", x.sort, e.sort);
  if (x.onSale !== undefined && Boolean(e.onSale) !== x.onSale) miss("onSale", x.onSale, e.onSale);
  if (x.topic !== undefined && d.topic !== x.topic) miss("topic", x.topic, d.topic);
  if (x.referent !== undefined && Boolean(e.referent) !== x.referent) miss("referent", x.referent, e.referent);
  if (x.productAmbiguous !== undefined && e.productAmbiguous !== x.productAmbiguous) miss("productAmbiguous", x.productAmbiguous, e.productAmbiguous);
  return out;
}

export function evaluate(cases: Case[]): Report {
  const r: Report = { total: cases.length, intentCorrect: 0, entityChecked: 0, entityCorrect: 0, abstained: 0, perTag: {}, mismatches: [], entityMisses: [] };
  for (const c of cases) {
    const d = route(c.text);
    const ok = d.intent === c.intent;
    if (ok) r.intentCorrect++;
    else r.mismatches.push({ text: c.text, expected: c.intent, got: d.intent, score: d.confidence.score, margin: d.confidence.margin });
    if (d.intent === "unknown") r.abstained++;
    const tag = (r.perTag[c.tag] ??= { n: 0, ok: 0 });
    tag.n++;
    if (ok) tag.ok++;
    if (c.expect) {
      r.entityChecked++;
      const misses = checkEntities(c, d);
      if (misses.length === 0) r.entityCorrect++;
      r.entityMisses.push(...misses);
    }
  }
  return r;
}

export function formatReport(name: string, r: Report): string {
  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(0)}%`);
  const lines = [
    `\n===== ${name} =====`,
    `intent accuracy : ${r.intentCorrect}/${r.total} (${pct(r.intentCorrect, r.total)})   abstained: ${r.abstained}`,
    `entity checks   : ${r.entityCorrect}/${r.entityChecked} cases fully correct (${pct(r.entityCorrect, r.entityChecked)})`,
    `by tag          : ${Object.entries(r.perTag).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join("  ")}`,
  ];
  for (const m of r.mismatches) lines.push(`  INTENT  expected=${m.expected} got=${m.got} (score ${m.score}, margin ${m.margin})  | ${m.text}`);
  for (const m of r.entityMisses) lines.push(`  ENTITY  ${m.field}: expected=${JSON.stringify(m.expected)} got=${JSON.stringify(m.got)}  | ${m.text}`);
  return lines.join("\n");
}

export { detectLanguage };
