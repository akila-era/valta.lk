import { finding, type Context } from "./context";
import type { AuditProduct, Finding } from "./types";

/** Digit patterns people type when they have no real price yet. */
const PLACEHOLDER_PRICES = new Set([1, 10, 100, 123, 1234, 12345, 123456, 999, 9999, 99999, 1111, 2222, 3333, 4444, 5555, 11111, 111111]);

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? NaN : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Modified z-scores on log10 prices (MAD, falling back to the mean absolute deviation when MAD is 0). Needs at least `minSample` values. */
export function logOutliers(values: { id: string; price: number }[], threshold: number): { id: string; price: number; score: number }[] {
  const logs = values.filter((v) => v.price > 0).map((v) => ({ id: v.id, price: v.price, l: Math.log10(v.price) }));
  if (logs.length < 3) return [];
  const med = median(logs.map((x) => x.l));
  const mad = median(logs.map((x) => Math.abs(x.l - med)));
  const meanAd = logs.reduce((s, x) => s + Math.abs(x.l - med), 0) / logs.length;
  const out: { id: string; price: number; score: number }[] = [];
  for (const x of logs) {
    const score = mad > 0 ? (0.6745 * (x.l - med)) / mad : meanAd > 0 ? (x.l - med) / (1.253314 * meanAd) : 0;
    if (Math.abs(score) > threshold) out.push({ id: x.id, price: x.price, score: Math.round(score * 100) / 100 });
  }
  return out;
}

const priceProblemText: Record<string, string> = {
  missing: "no price",
  not_a_number: "the price is not a number",
  not_numeric: "the price is not numeric",
  wrong_type: "the price has the wrong type",
  number_type: "the price is a JSON number, the Agent needs a decimal string",
  thousands_separator: "the price has a thousands separator",
  currency_symbol: "the price carries a currency symbol or text",
  too_many_decimals: "the price has more than two decimals",
  negative: "the price is negative",
  format: "the price has an unexpected format",
};

export function priceFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const effective = (p: AuditProduct) => p.price;

  for (const p of ctx.input.products) {
    const ids = [p.id];
    const c = ctx.classes.get(p.id);
    if (p.priceProblem) {
      out.push(finding("price.format", "high", ids, `${priceProblemText[p.priceProblem] ?? "the price cannot be read"}.`, { problem: p.priceProblem }, 'Prices must be decimal strings with at most two decimals, such as "1000.00".'));
    }
    const price = effective(p);
    if (price !== null) {
      if (price <= 0) out.push(finding("price.nonpositive", "high", ids, "The price is zero or negative.", { price }, "Enter the real price; a free or negative price is never valid for sale."));
      else {
        if (PLACEHOLDER_PRICES.has(price)) out.push(finding("price.placeholder", "medium", ids, "The price matches a typical placeholder value.", { price }, "Confirm the real price with the shop.", true));
        const node = c?.proposedNode ?? c?.filedNode ?? null;
        const floor = node ? ctx.floors[node] : undefined;
        if (ctx.currencyIsLkr && floor !== undefined && price < floor) {
          out.push(
            finding("price.below_plausible_floor", "medium", ids, `The price is below ${floor.toLocaleString("en-US")} LKR, the assumed lowest plausible price for this kind of product.`, { price, floor: floor, node }, "Confirm the real price. The floor is an assumption (options.priceFloors), not a market fact.", true),
          );
        }
        if (p.discountActive && p.salePrice !== null && p.salePrice >= price) out.push(finding("price.sale_not_lower", "medium", ids, "A discount is active but the sale price is not lower than the list price.", { price, salePrice: p.salePrice }, "Correct or end the discount."));
        if (p.salePrice !== null && p.salePrice <= 0) out.push(finding("price.sale_nonpositive", "high", ids, "The sale price is zero or negative.", { salePrice: p.salePrice }, "Correct or end the discount."));
      }
    }
    // Inside one product: a larger storage must not cost less than a smaller one (same colour is not required: the pattern is what matters).
    const sized = p.variants
      .map((v) => ({ v, gb: gb(v.storage) }))
      .filter((x): x is { v: (typeof p.variants)[number]; gb: number } => x.gb !== null && x.v.price !== null);
    const inversion = sized.flatMap((a) => sized.filter((b) => a.gb > b.gb && a.v.price! < b.v.price!).map((b) => ({ a, b })))[0];
    if (inversion) {
      const { a, b } = inversion;
      out.push(finding("price.variant_inversion", "medium", ids, `A larger storage (${a.v.storage}) is cheaper than a smaller one (${b.v.storage}).`, { larger: a.v.key, largerPrice: a.v.price, smaller: b.v.key, smallerPrice: b.v.price }, "A person checks whether the two prices were swapped or are test values."));
    }
    // The product-level price should be one of its variant prices (the storefront shows "from" the lowest).
    if (price !== null && p.variants.length > 0) {
      const prices = p.variants.map((v) => v.price).filter((x): x is number => x !== null);
      if (prices.length && !prices.includes(price)) out.push(finding("price.product_vs_variants", "low", ids, "The product-level price equals none of its variant prices.", { price, variantPrices: prices.slice(0, 8) }, "Check which price the storefront and the Agent should show."));
    }
    for (const v of p.variants) {
      if (v.price !== null && v.price <= 0) out.push(finding("price.nonpositive", "high", ids, `Variant ${v.key} has a zero or negative price.`, { variant: v.key, price: v.price }, "Enter the real price."));
      if (!v.priceWireOk && v.price !== null) out.push(finding("price.format", "high", ids, `Variant ${v.key} has a price in a format the Agent refuses.`, { variant: v.key }, 'Prices must be decimal strings such as "1000.00".'));
    }
  }

  // Robust outliers inside each filed category: only with a real sample, otherwise skipped and reported as skipped.
  const groups = new Map<string, { id: string; price: number }[]>();
  for (const p of ctx.input.products) {
    const c = ctx.classes.get(p.id);
    const key = c?.proposedNode ?? c?.filedNode ?? c?.filedKey ?? "";
    if (!key || p.price === null || p.price <= 0) continue;
    const list = groups.get(key) ?? [];
    list.push({ id: p.id, price: p.price });
    groups.set(key, list);
  }
  const skippedGroups: string[] = [];
  for (const [key, list] of groups) {
    if (list.length < ctx.minSample) {
      skippedGroups.push(`${key} (${list.length})`);
      continue;
    }
    for (const o of logOutliers(list, ctx.outlierThreshold)) {
      out.push(finding("price.outlier", "medium", [o.id], `The price is an outlier among ${list.length} products of the same kind (robust score ${o.score}).`, { price: o.price, score: o.score, group: key, sample: list.length }, "Confirm the price; an outlier can be a typo or a genuinely premium item."));
    }
  }
  if (skippedGroups.length) ctx.skipped.push(`price outliers: skipped for ${skippedGroups.length} group(s) with fewer than ${ctx.minSample} priced products (${skippedGroups.slice(0, 8).join(", ")}${skippedGroups.length > 8 ? ", …" : ""}); a small group gives no honest statistics.`);
  return out;
}

/** "128GB" or "1 TB" in gigabytes, or null. */
export function gb(storage: string | undefined): number | null {
  if (!storage) return null;
  const m = /(\d{1,4})\s*(gb|tb)/i.exec(storage);
  return m ? Number(m[1]) * (/tb/i.test(m[2]!) ? 1024 : 1) : null;
}
