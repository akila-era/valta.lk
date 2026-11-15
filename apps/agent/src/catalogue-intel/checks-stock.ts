import { nodeById } from "./categories";
import { finding, type Context } from "./context";
import type { Finding } from "./types";

const KNOWN_AVAILABILITY = new Set(["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"]);
/** The ERP caps `purchasableQuantity` at 20 (docs/VOLTA_AI_CATALOGUE_INTEGRATION_PLAN.md), so 20 means "20 or more", not exactly 20. */
const ERP_CAP = 20;

export function stockFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  for (const p of ctx.input.products) {
    const ids = [p.id];
    const check = (label: string, availability: string, qty: number | null) => {
      if (qty !== null && (qty < 0 || !Number.isInteger(qty))) out.push(finding("stock.invalid_quantity", "high", ids, `${label}: the quantity is negative or not a whole number.`, { quantity: qty }, "Correct the stock figure at the source."));
      if (availability === "IN_STOCK" && (qty === null || qty === 0)) out.push(finding("stock.inconsistent", "medium", ids, `${label}: marked in stock but the purchasable quantity is ${qty ?? "missing"}.`, { availability, quantity: qty }, "A person checks the real stock; the Agent shows such items as out of stock."));
      if (availability === "OUT_OF_STOCK" && qty !== null && qty > 0) out.push(finding("stock.inconsistent", "medium", ids, `${label}: marked out of stock but ${qty} are purchasable.`, { availability, quantity: qty }, "A person checks the real stock."));
      if (!KNOWN_AVAILABILITY.has(availability)) out.push(finding("stock.unknown_availability", "info", ids, `${label}: the availability value "${availability.slice(0, 30)}" is not one the Agent recognises (it counts only IN_STOCK as available).`, { availability: availability.slice(0, 30) }, "Confirm the ERP's availability vocabulary."));
      if (qty === ERP_CAP) out.push(finding("stock.at_erp_cap", "info", ids, `${label}: the quantity equals the ERP's cap of ${ERP_CAP}; real stock may be higher.`, { quantity: qty }, "Nothing to fix; do not quote it to shoppers as an exact count."));
    };
    if (p.variants.length === 0) check("Product", p.availability, p.qty);
    else {
      for (const v of p.variants) check(`Variant ${v.key}`, v.availability, v.qty);
      const anyIn = p.variants.some((v) => v.availability === "IN_STOCK" && (v.qty ?? 0) > 0);
      if (p.availability === "IN_STOCK" && !anyIn) out.push(finding("stock.product_variant_mismatch", "medium", ids, "The product is listed in stock but none of its variants is purchasable.", { variants: p.variants.length }, "Check which is right; the Agent trusts the variants."));
      if (p.availability === "OUT_OF_STOCK" && anyIn) out.push(finding("stock.product_variant_mismatch", "medium", ids, "The product is listed out of stock but a variant is purchasable.", { variants: p.variants.length }, "Check which is right; the Agent trusts the variants."));
      const maxQ = Math.max(0, ...p.variants.map((v) => v.qty ?? 0));
      if (p.qty !== null && p.qty !== maxQ) out.push(finding("stock.list_vs_variants", "low", ids, "The list-level quantity is not the largest variant quantity (the ERP lists the largest, not the total).", { listQuantity: p.qty, largestVariant: maxQ }, "Informational; never add variant quantities up from the list figure."));
    }
  }
  return out;
}

export function accessoryFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const links = ctx.input.links;
  const accessories = ctx.input.products.filter((p) => {
    const n = ctx.classes.get(p.id)?.profileNode;
    return n ? nodeById(n).accessory : false;
  });
  if (links === undefined) {
    ctx.skipped.push("accessory links were not supplied: link gaps cannot be judged. Supply the website's AccessoryLink rows.");
    return out;
  }
  const linked = new Set(links.map((l) => l.accessoryItemId));
  for (const l of links) {
    if (l.sourceItemId === l.accessoryItemId) out.push(finding("acc.link_self", "medium", [l.sourceItemId], "A product is linked as its own accessory.", { id: l.sourceItemId }, "Remove the link."));
    for (const id of [l.sourceItemId, l.accessoryItemId]) if (!ctx.byId.has(id)) out.push(finding("acc.link_dangling", "medium", [], "A link refers to a product that is not in the catalogue.", { id }, "Remove or repair the link."));
  }
  if (accessories.length && links.length === 0) out.push(finding("acc.no_links_at_all", "medium", accessories.map((a) => a.id).slice(0, 20), `There are ${accessories.length} accessory product(s) and no accessory links at all, so 'which charger fits my phone' cannot be answered.`, { accessories: accessories.length, links: 0 }, "Staff link accessories to the devices they fit; the Agent never infers compatibility from names."));
  else for (const a of accessories) if (!linked.has(a.id)) out.push(finding("acc.no_link", "low", [a.id], "This accessory is not linked to any device.", {}, "Link it to the devices it fits."));
  return out;
}
