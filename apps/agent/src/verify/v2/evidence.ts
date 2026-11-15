import { fold, squeeze } from "./text";
import type { SpecFact, ToolEvidence } from "./types";

/** Everything the server knows about one store product this turn, merged from all evidence that carries its id (or, without an id, its name). */
export interface ProductFacts {
  key: string;
  names: string[];
  brand?: string;
  category?: string;
  urls: string[];
  /** Every price the server gave for the product (list and offer), in minor units. */
  pricesMinor: number[];
  stock?: { status: "in_stock" | "low_stock" | "out_of_stock" | "unknown"; quantities: number[] };
  specs: SpecFact[];
}

const keyOf = (e: ToolEvidence, i: number): string => (e.productId ? `id:${e.productId}` : e.productName ? `name:${squeeze(e.productName)}` : `anon:${i}`);

export function indexProducts(evidence: readonly ToolEvidence[]): ProductFacts[] {
  const byKey = new Map<string, ProductFacts>();
  evidence.forEach((e, i) => {
    if (e.kind === "calculation" || e.kind === "search_source" || e.kind === "page_excerpt") return;
    if (!e.productId && !e.productName) return;
    const k = keyOf(e, i);
    let p = byKey.get(k);
    if (!p) {
      p = { key: k, names: [], urls: [], pricesMinor: [], specs: [] };
      byKey.set(k, p);
    }
    for (const n of [e.productName, ...(e.aliases ?? [])]) if (n && n.trim() && !p.names.includes(n.trim())) p.names.push(n.trim());
    if (e.brand && !p.brand) p.brand = e.brand;
    if (e.category && !p.category) p.category = e.category;
    if (e.url) p.urls.push(e.url);
    for (const v of [e.priceMinor, e.effectivePriceMinor]) if (typeof v === "number" && Number.isFinite(v) && !p.pricesMinor.includes(v)) p.pricesMinor.push(v);
    if (e.stock) {
      p.stock ??= { status: e.stock.status, quantities: [] };
      if (e.stock.status !== "unknown") p.stock.status = e.stock.status;
      if (typeof e.stock.quantity === "number") p.stock.quantities.push(e.stock.quantity);
    }
    if (e.specs) p.specs.push(...e.specs);
  });
  return [...byKey.values()];
}

export interface NameHit {
  product: ProductFacts;
  start: number;
  end: number;
}

/** A model usually shortens "Lumen P1 128GB Black" to "Lumen P1": a name with 3+ words whose second word contains a digit also answers to its first two words. */
function aliasesOf(name: string): string[] {
  const sq = squeeze(name);
  const out = new Set<string>([sq]);
  const parts = sq.split(" ");
  if (parts.length >= 3 && /\d/.test(parts[1]!)) out.add(`${parts[0]} ${parts[1]}`);
  return [...out].filter((s) => s.length >= 3);
}

/**
 * Finds store-product mentions in one sentence. Matching runs on word boundaries over the squeezed text; the longest name wins and its characters
 * are consumed, so "Lumen P1 Pro" does not also resolve "Lumen P1". Offsets refer to the squeezed sentence (callers only use the set of products).
 */
export function productsInSentence(sentence: string, products: readonly ProductFacts[]): ProductFacts[] {
  let sq = ` ${squeeze(sentence)} `;
  const candidates: { name: string; product: ProductFacts }[] = [];
  for (const p of products) for (const n of p.names) for (const a of aliasesOf(n)) candidates.push({ name: a, product: p });
  candidates.sort((a, b) => b.name.length - a.name.length);
  const hit: ProductFacts[] = [];
  for (const c of candidates) {
    const needle = ` ${c.name} `;
    let idx = sq.indexOf(needle);
    if (idx < 0) continue;
    if (!hit.includes(c.product)) hit.push(c.product);
    while (idx >= 0) {
      sq = sq.slice(0, idx + 1) + " ".repeat(c.name.length) + sq.slice(idx + 1 + c.name.length);
      idx = sq.indexOf(needle);
    }
  }
  return hit;
}

/**
 * The folded sentence with every store-product name (and its short alias) replaced by spaces of the same length. A product's NAME often contains a size or a model
 * code ("Lumen P1 128GB Black", "Galaxy A55"): without masking, "128GB ... RAM" would be read as a RAM claim about the product. Offsets are unchanged.
 */
export function maskProductNames(folded: string, products: readonly ProductFacts[]): string {
  const names = new Set<string>();
  for (const p of products) {
    for (const n of p.names) {
      const f = fold(n).trim();
      if (f.length >= 3) names.add(f);
      const parts = f.split(/\s+/);
      if (parts.length >= 3 && /\d/.test(parts[1]!)) names.add(`${parts[0]} ${parts[1]}`);
    }
  }
  let out = folded;
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    let i = out.indexOf(n);
    while (i >= 0) {
      out = out.slice(0, i) + " ".repeat(n.length) + out.slice(i + n.length);
      i = out.indexOf(n, i + n.length);
    }
  }
  return out;
}

/** True when a name (brand, product or category) is mentioned in the text: Latin names on word boundaries, other scripts as substrings. */
export function mentions(text: string, name: string): boolean {
  const n = squeeze(name);
  if (n.length < 2) return false;
  const sq = ` ${squeeze(text)} `;
  if (/^[\x00-\x7f]+$/.test(n)) return sq.includes(` ${n} `) || sq.includes(` ${n}s `);
  return sq.includes(n);
}

export interface CalcFact {
  result: number;
  minor: number;
}

export function calculations(evidence: readonly ToolEvidence[]): CalcFact[] {
  const out: CalcFact[] = [];
  for (const e of evidence) {
    if (e.kind === "calculation" && e.calculation && Number.isFinite(e.calculation.result)) out.push({ result: e.calculation.result, minor: Math.round(e.calculation.result * 100) });
  }
  return out;
}
