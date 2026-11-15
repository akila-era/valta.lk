import { clip, finding, type Context } from "./context";
import { editDistance, INVISIBLE, looksLikeMash, nameKey, tokens } from "./text";
import type { Finding } from "./types";

/** Words that are a kind of product, not a product. A name made only of one of them cannot be told apart from another record. */
const GENERIC_NAMES = new Set(["watch", "phone", "mobile", "laptop", "tablet", "charger", "cable", "earbuds", "headphones", "speaker", "mouse", "keyboard", "product", "item", "test", "sample", "new", "demo"]);
/** Common model suffix words; a name token one letter away from one of them is a probable typo ("prp" for "pro"). */
const MODEL_WORDS = ["pro", "max", "plus", "ultra", "mini", "lite", "note", "fold", "flip", "air", "edge", "neo", "prime"];

/** The same rules the Agent's card layer applies (`cardable` in backend/cards.ts), re-implemented so the audit stays independent; parity is tested. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
export const productSlug = (name: string, id: string): string => `${slugify(name) || "product"}-${id.toLowerCase()}`;
export const isCardable = (id: string, name: string): boolean => id.length >= 1 && id.length <= 100 && /^[A-Za-z0-9._~-]{1,200}$/.test(productSlug(name, id));

export function identityFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const idCount = new Map<string, number>();
  for (const p of ctx.input.products) idCount.set(p.id, (idCount.get(p.id) ?? 0) + 1);
  const skuOwners = new Map<string, string[]>();

  for (const r of ctx.input.invalid) out.push(finding("input.record_invalid", "high", [], `Record ${r.index} could not be read: ${r.reason}.`, { index: r.index, reason: r.reason }, "Fix the record at its source; the audit and the Agent both skip it."));
  for (const [id, n] of idCount) if (n > 1) out.push(finding("input.duplicate_id", "high", [id], `The product id appears ${n} times in the snapshot.`, { id, count: n }, "Ids must be unique; find where the export repeats a record."));

  for (const p of ctx.input.products) {
    const ids = [p.id];
    if (p.wireProblems.length) {
      out.push(
        finding(
          "agent.wire_rejected",
          "high",
          ids,
          "The Agent's strict listing schema would refuse this record. Its transport throws for a whole page of products if one record fails, so one bad record can hide a page of the catalogue from the assistant.",
          { problems: p.wireProblems.slice(0, 6), total: p.wireProblems.length },
          "Correct the field at its source (prices must be decimal strings such as \"1000.00\"; updatedAt is required), or sanitise in the website relay. The Agent must not be loosened to accept bad data.",
        ),
      );
    }
    if (!isCardable(p.id, p.name)) {
      out.push(finding("agent.not_cardable", "high", ids, "The product cannot be shown as a card: its id or generated link has characters or a length the card contract refuses. The Agent skips it silently.", { idLength: p.id.length, slugLength: productSlug(p.name, p.id).length }, "Use ids made of letters, digits and . _ ~ - (at most 100 characters)."));
    }
    if (p.name.trim() === "") out.push(finding("name.empty", "high", ids, "The product has no name.", {}, "Give the product a name that includes the brand and model."));
    else {
      const key = nameKey(p.name);
      const toks = tokens(key);
      const bare = /^\d+$/.test(key) || key.length <= 2 || (toks.length === 1 && GENERIC_NAMES.has(key));
      if (bare) {
        out.push(
          finding("name.generic", "medium", ids, "The name does not identify a product (a bare number, a very short word or a kind of product).", { name: clip(p.name), brand: p.brand ?? null, model: p.model ?? null }, 'Use a full name such as "iPhone 11 Pro 128GB"; a person who knows the item must confirm it.'),
        );
      }
      for (const t of toks) {
        if (t.length < 3 || MODEL_WORDS.includes(t)) continue;
        const near = MODEL_WORDS.find((w) => w.length >= 3 && editDistance(t, w, 1) === 1 && t[0] === w[0]);
        if (near) out.push(finding("name.typo_suspect", "low", ids, `The word "${t}" is one letter away from "${near}".`, { name: clip(p.name), word: t, near }, "A person should confirm the spelling; nothing is corrected automatically."));
      }
      if (p.name.length > 200) out.push(finding("name.too_long", "low", ids, "The name is longer than the 200 characters cards show.", { length: p.name.length }, "Shorten the name; put detail in the description or specifications."));
      if (INVISIBLE.test(p.name) || (p.brand && INVISIBLE.test(p.brand))) out.push(finding("text.hidden_characters", "medium", ids, "The name or brand contains invisible or direction-changing characters.", {}, "Remove them; they show nothing to a person but a model reads them."));
    }
    if (!p.brand) out.push(finding("brand.missing", "low", ids, "No brand is recorded.", {}, "Add the brand."));
    if (p.brand && p.model && p.brand.toLowerCase() === p.model.toLowerCase()) out.push(finding("model.repeats_brand", "low", ids, "The model field repeats the brand, so it says nothing about the model.", { model: p.model }, "Enter the real model name."));
    if (!p.sku) out.push(finding("sku.missing", "info", ids, "No product SKU is recorded.", {}, "Add a SKU in the shop's chosen format."));
    else {
      const w = p.sku;
      if (!/\d/.test(w) && looksLikeMash(w.replace(/[^A-Za-z]/g, ""))) out.push(finding("sku.placeholder", "low", ids, "The SKU looks typed at random.", { sku: clip(w, 40) }, "Replace it with a real SKU; do not rewrite existing SKUs that other systems use without the owner's decision."));
      const owners = skuOwners.get(w) ?? [];
      owners.push(p.id);
      skuOwners.set(w, owners);
    }
    const seen = new Set<string>();
    for (const v of p.variants) {
      if (seen.has(v.key)) out.push(finding("variant.key_duplicate_in_product", "high", ids, "Two variants of the product share one key; a cart cannot address them separately.", { key: v.key }, "Variant keys must be unique inside a product."));
      seen.add(v.key);
    }
    if (p.invalidVariants > 0) out.push(finding("variant.invalid", "medium", ids, "Some variants have no key or are not objects and were ignored.", { count: p.invalidVariants }, "Fix the variant records at the source."));
  }
  if (ctx.input.products.length > 0 && ctx.input.products.every((p) => !p.externalId)) {
    out.push(finding("identity.no_external_id", "info", [], "No product carries an external id, so nothing links these records to another system and duplicates cannot be reconciled by an external key.", { products: ctx.input.products.length }, "Record the ERP or supplier reference where one exists; do not invent one."));
  }
  for (const [sku, owners] of skuOwners) if (owners.length > 1) out.push(finding("sku.duplicate", "high", owners, "Two products share one product SKU.", { sku: clip(sku, 40), products: owners.slice(0, 6) }, "One SKU must identify one item; a person decides which record is real."));
  return out;
}
