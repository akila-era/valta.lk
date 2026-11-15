import type { ProductView } from "../backend/types";
import type { ToolOutcome } from "../tools/runner";
import { emptyExclusions, type Exclusions } from "./profile";

/**
 * Explicit negative preferences (R0): "don't recommend Samsung", "no chargers", "Lumen P1 epa". They are kept for the whole conversation (they are NOT cleared when
 * the topic changes) until the shopper asks for that thing again, and they are applied to the products a SEARCH or an accessory list returns, before anything
 * is ranked, shown or verified, so an excluded brand can never reach a card, a comparison or a fit code. A product the shopper names themselves in a later
 * request (details, comparison) is never hidden: naming it is asking for it.
 */
export type ExclusionAdd = Partial<Exclusions>;

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];

/** Adds exclusions to the set (in place) and reports whether anything new was added. */
export function addExclusions(set: Exclusions, add: ExclusionAdd | undefined): boolean {
  if (!add) return false;
  let changed = false;
  const merge = (key: keyof Exclusions, values: readonly string[] | undefined): void => {
    for (const v of values ?? []) {
      const value = v.toLowerCase();
      if (value && !set[key].includes(value)) {
        set[key].push(value);
        changed = true;
      }
    }
  };
  merge("brands", add.brands);
  merge("categories", add.categories);
  merge("words", add.words);
  // Product ids are opaque and case-sensitive.
  for (const id of add.productIds ?? []) if (id && !set.productIds.includes(id)) {
    set.productIds.push(id);
    changed = true;
  }
  return changed;
}

/** The shopper asked for these things again: they are no longer excluded. Returns whether anything was removed. */
export function withdrawExclusions(set: Exclusions, positive: { brand?: string | undefined; categorySlug?: string | undefined; words?: readonly string[]; productIds?: readonly string[] }): boolean {
  let changed = false;
  const drop = (key: keyof Exclusions, value: string | undefined): void => {
    if (!value) return;
    const v = key === "productIds" ? value : value.toLowerCase();
    const at = set[key].indexOf(v);
    if (at >= 0) {
      set[key].splice(at, 1);
      changed = true;
    }
  };
  drop("brands", positive.brand);
  drop("categories", positive.categorySlug);
  for (const w of positive.words ?? []) drop("words", w);
  for (const id of positive.productIds ?? []) drop("productIds", id);
  return changed;
}

export const hasExclusions = (set: Exclusions): boolean => set.brands.length + set.categories.length + set.words.length + set.productIds.length > 0;

const wordRe = (w: string): RegExp => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");

/** True when the product matches an exclusion: its id, its brand, its category, or a kind-of-product word in its name or category. */
export function isExcluded(p: ProductView, set: Exclusions): boolean {
  if (set.productIds.includes(p.id)) return true;
  const brand = (p.brand ?? "").toLowerCase();
  if (brand && set.brands.includes(brand)) return true;
  // A brand written inside the product name ("Samsung Galaxy ..." with no brand field) is still that brand.
  if (set.brands.some((b) => wordRe(b).test(p.name))) return true;
  if (p.category && set.categories.includes(p.category.slug.toLowerCase())) return true;
  return set.words.some((w) => wordRe(w).test(p.name) || (p.category !== undefined && wordRe(w).test(p.category.name)));
}

/**
 * Removes excluded products from the search and accessory results of a tool batch, and lowers the search total by what was removed. Details and comparison
 * results are left alone (the shopper named those products). Returns the new outcomes and how many products were removed.
 */
export function filterOutcomes(outcomes: ToolOutcome[], set: Exclusions): { outcomes: ToolOutcome[]; removed: number } {
  if (!hasExclusions(set)) return { outcomes, removed: 0 };
  let removed = 0;
  const next = outcomes.map((o): ToolOutcome => {
    if (o.status !== "ok" || !o.data || typeof o.data !== "object") return o;
    const data = o.data as { kind?: string };
    if (data.kind === "search") {
      const d = o.data as { kind: "search"; total: number; items: ProductView[] };
      const kept = d.items.filter((p) => !isExcluded(p, set));
      const gone = d.items.length - kept.length;
      if (gone === 0) return o;
      removed += gone;
      // When every returned product was excluded the page is empty: report none rather than a total that no card backs (a catalogue with more than the
      // candidate limit of products that all match an exclusion is a known limitation, see the R0 report).
      return { ...o, data: { ...d, total: kept.length === 0 ? 0 : Math.max(kept.length, d.total - gone), items: kept } };
    }
    if (data.kind === "accessories") {
      const d = o.data as { kind: "accessories"; sourceId: string; items: { kind: string; product: ProductView }[] };
      const kept = d.items.filter((i) => !isExcluded(i.product, set));
      const gone = d.items.length - kept.length;
      if (gone === 0) return o;
      removed += gone;
      return { ...o, data: { ...d, items: kept } };
    }
    return o;
  });
  return { outcomes: next, removed };
}

/** Filters a plain product list (used for the by-name and alternative searches the pipeline runs itself). */
export const filterProducts = (items: ProductView[], set: Exclusions): ProductView[] => (hasExclusions(set) ? items.filter((p) => !isExcluded(p, set)) : items);

export { emptyExclusions, uniq };
