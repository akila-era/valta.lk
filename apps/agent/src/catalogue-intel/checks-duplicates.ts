import { finding, type Context } from "./context";
import { editDistance, jaccard, nameKey, tokens } from "./text";
import type { AuditProduct, Finding } from "./types";

/**
 * Duplicate detection (docs/VOLTA_DUPLICATE_VARIANT_AUDIT.md, section 5). Three signals: the same normalised name and brand; the same variant keys with
 * the same variant SKUs; a product SKU that is another's SKU plus a suffix. All three = strong, two = likely, one = weak. Records are compared only inside
 * small blocks (same name, same variant SKU, same SKU stem, same brand and name prefix), so the cost stays near-linear on thousands of products.
 */
const MAX_BLOCK = 120;
const SKU_SUFFIX = /^(.{3,}?)-[A-Za-z0-9]{3,12}$/;

const brandKey = (p: AuditProduct): string => (p.brand ? nameKey(p.brand) : "");
const variantKeys = (p: AuditProduct): string => p.variants.map((v) => v.key).sort().join("|");
const variantSkus = (p: AuditProduct): string => p.variants.map((v) => v.sku ?? "").filter(Boolean).sort().join("|");

interface Pair {
  a: AuditProduct;
  b: AuditProduct;
}
const pairKey = (a: AuditProduct, b: AuditProduct): string => (a.id < b.id ? `${a.id}\u0000${b.id}` : `${b.id}\u0000${a.id}`);

export function duplicateFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const products = ctx.input.products.filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);
  const blocks = new Map<string, AuditProduct[]>();
  const add = (k: string, p: AuditProduct) => {
    const list = blocks.get(k) ?? [];
    list.push(p);
    blocks.set(k, list);
  };
  for (const p of products) {
    const nk = nameKey(p.name);
    if (nk) {
      add(`n:${nk}`, p);
      add(`b:${brandKey(p)}|${nk.slice(0, 4)}`, p);
    }
    for (const v of p.variants) if (v.sku) add(`v:${v.sku}`, p);
    if (p.sku) {
      add(`s:${p.sku}`, p);
      const m = SKU_SUFFIX.exec(p.sku);
      if (m) add(`s:${m[1]}`, p);
    }
  }
  const pairs = new Map<string, Pair>();
  let oversize = 0;
  for (const list of blocks.values()) {
    if (list.length < 2) continue;
    if (list.length > MAX_BLOCK) {
      oversize++;
      continue;
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.set(pairKey(list[i]!, list[j]!), { a: list[i]!, b: list[j]! });
  }
  if (oversize) ctx.skipped.push(`duplicate detection: ${oversize} comparison block(s) with more than ${MAX_BLOCK} records were skipped (very common names or SKUs); review them by hand.`);

  const variantOwners = new Map<string, string[]>();
  for (const p of products) for (const v of p.variants) if (v.sku) variantOwners.set(v.sku, [...(variantOwners.get(v.sku) ?? []), p.id]);

  for (const { a, b } of pairs.values()) {
    const ka = nameKey(a.name);
    const kb = nameKey(b.name);
    const sameBrand = brandKey(a) === brandKey(b);
    const sameName = ka !== "" && ka === kb && sameBrand;
    const nearName = !sameName && sameBrand && brandKey(a) !== "" && ka !== "" && kb !== "" && ((ka.length >= 6 && editDistance(ka, kb, 1) <= 1) || (tokens(ka).length >= 3 && jaccard(tokens(ka), tokens(kb)) >= 0.8));
    const sameVariants = a.variants.length > 0 && variantKeys(a) === variantKeys(b) && variantSkus(a) !== "" && variantSkus(a) === variantSkus(b);
    const skuSuffix = !!a.sku && !!b.sku && a.sku !== b.sku && (b.sku.startsWith(`${a.sku}-`) || a.sku.startsWith(`${b.sku}-`));
    const signals = [sameName, sameVariants, skuSuffix].filter(Boolean).length;
    if (signals === 0 && !nearName) continue;
    const strength = signals >= 3 ? "strong" : signals === 2 ? "likely" : "weak";
    const severity = strength === "strong" ? "high" : strength === "likely" ? "medium" : "low";
    out.push(
      finding(
        `dup.${strength}`,
        severity,
        [a.id, b.id],
        `Possible duplicate (${strength}): ${[sameName && "same name and brand", nearName && "near-identical name", sameVariants && "same variant keys and SKUs", skuSuffix && "SKU is the other's plus a suffix"].filter(Boolean).join(", ")}.`,
        { sameNameAndBrand: sameName, nearName, sameVariantKeysAndSkus: sameVariants, skuSuffix, skuA: a.sku ?? null, skuB: b.sku ?? null, updatedA: a.updatedAt ?? null, updatedB: b.updatedAt ?? null },
        "Never merge or delete automatically. A person checks real stock and price, picks the surviving record or marks both as separate; retire the other by unpublishing, not deleting (see the duplicate audit, section 5).",
      ),
    );
    // Conflicts on the same variant between the two records.
    if (sameVariants || signals >= 1) {
      for (const va of a.variants) {
        const vb = b.variants.find((x) => x.key === va.key || (va.sku && x.sku === va.sku));
        if (!vb) continue;
        const priceDiff = va.price !== null && vb.price !== null && va.price !== vb.price;
        const stockDiff = va.qty !== vb.qty || va.availability !== vb.availability;
        if (priceDiff || stockDiff) {
          out.push(
            finding(
              "dup.variant_conflict",
              "high",
              [a.id, b.id],
              `The same variant (${va.storage ?? ""} ${va.color ?? va.key}) differs between the two records: ${[priceDiff && "price", stockDiff && "stock"].filter(Boolean).join(" and ")}.`,
              { variant: va.key, priceA: va.price, priceB: vb.price, qtyA: va.qty, qtyB: vb.qty, availabilityA: va.availability, availabilityB: vb.availability },
              "Only someone who can count the stock and knows the real price can say which record is right; the newer record is not necessarily correct.",
            ),
          );
        }
      }
    }
  }

  for (const [sku, owners] of variantOwners) {
    const uniq = [...new Set(owners)];
    if (uniq.length > 1) out.push(finding("sku.shared_variant_sku", "high", uniq, "One variant SKU is claimed by more than one product.", { sku, products: uniq.slice(0, 6) }, "A variant SKU must identify one sellable item; validate on entry and reject a copy that keeps its source's variant SKUs."));
  }
  return out;
}
