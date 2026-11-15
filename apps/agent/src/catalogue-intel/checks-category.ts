import { nodeById } from "./categories";
import { clip, finding, type Context } from "./context";
import type { Finding } from "./types";

/** Category findings against the proposed tree. Every row of the proposal's mapping table becomes a finding with a confidence and a human decision. */
export function categoryFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  for (const p of ctx.input.products) {
    const c = ctx.classes.get(p.id);
    if (!c) continue;
    const ids = [p.id];
    const ev = { filed: clip(c.filed), inferredFrom: c.inferred.evidence.join("; ") || null, proposedNode: c.proposedNode, status: c.status };
    const propose = c.proposedNode ? `Candidate node: ${nodeById(c.proposedNode).name}. ` : "";
    switch (c.status) {
      case "exact":
        break;
      case "conflict":
        out.push(finding("category.conflict", "high", ids, `Filed as "${c.filed}" but ${c.note.replace(/^filed as .*? but /, "")}.`, ev, `${propose}Human decision: either the category or the name is wrong; apply neither automatically.`));
        break;
      case "junk":
        out.push(finding("category.junk", "medium", ids, `The category "${c.filed}" looks typed at random.`, ev, `${propose}Human decision; keep the original text so the change can be reversed.`));
        break;
      case "brand_as_category":
        out.push(finding("category.brand_as_category", "medium", ids, `A brand ("${c.filed}") is filed as the category, so searches for the kind of product miss it.`, ev, `${propose}The brand belongs in the brand field; a human confirms the kind of product.`));
        break;
      case "missing":
        out.push(finding("category.missing", "medium", ids, "No category is filed.", ev, `${propose}Choose a category from the controlled list.`));
        break;
      case "candidate":
        out.push(finding("category.not_in_tree", "low", ids, `The category "${c.filed}" is not in the proposed tree (${c.note}).`, ev, `${propose}Human decision; this is a candidate, not an exact mapping.`));
        break;
      case "none":
        out.push(finding("category.unmappable", "medium", ids, `The category "${c.filed}" is not in the proposed tree and nothing in the record says what the product is.`, ev, "Name the product, then place it; until then it belongs in Uncategorised."));
        break;
    }
    if (p.subCategory && c.status !== "missing") {
      const sub = p.subCategory.trim();
      if (sub && c.status === "exact" && !ctx.input.products.some((q) => q.id !== p.id && q.subCategory === sub)) {
        out.push(finding("category.subcategory_singleton", "info", ids, `The sub-category "${sub}" is used by no other product; it may be a product line, not a kind of product.`, { subCategory: clip(sub) }, "Keep it as a product-line attribute or drop it (owner decision)."));
      }
    }
  }
  return out;
}
