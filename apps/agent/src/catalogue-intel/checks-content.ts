import { clip, finding, type Context } from "./context";
import { INJECTION_LIKE, INVISIBLE, looksLikeMash, nameKey, plain, scriptOf } from "./text";
import type { AuditProduct, Finding } from "./types";

const PLACEHOLDER_WORDS = /\b(lorem|ipsum|dolor|sit amet|description here|sample (text|description)|dummy|todo|tbd|coming soon|test(ing)?|asdf\w*|qwerty|n\/a|xxx+)\b/i;

export type DescriptionState = "empty" | "placeholder" | "too_short" | "same_as_name" | "ok";

/** One decision per description, used by the findings and by the readiness numbers. Non-Latin text is never judged as "random typing". */
export function describe(p: AuditProduct): DescriptionState {
  const text = plain(p.description ?? "");
  if (!text) return "empty";
  if (nameKey(text) === nameKey(p.name) && nameKey(text) !== "") return "same_as_name";
  const words = text.split(/\s+/);
  if (PLACEHOLDER_WORDS.test(text)) return "placeholder";
  if (scriptOf(text) === "latin" && words.length <= 3 && words.every((w) => looksLikeMash(w.replace(/[^A-Za-z]/g, "")) || w.length <= 2)) return "placeholder";
  if (scriptOf(text) === "latin" && words.length === 1 && text.length <= 12) return "placeholder";
  if (text.length < 40) return "too_short";
  return "ok";
}

export function contentFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  for (const p of ctx.input.products) {
    const ids = [p.id];
    const state = describe(p);
    if (state === "empty") out.push(finding("desc.empty", "low", ids, "The product has no description.", {}, "Write a real description (what it is, who it suits, what is in the box)."));
    else if (state === "placeholder") out.push(finding("desc.placeholder", "medium", ids, "The description is placeholder or random text.", { text: clip(plain(p.description ?? ""), 40) }, "Replace it with a real description; the assistant would otherwise read it to shoppers."));
    else if (state === "same_as_name") out.push(finding("desc.same_as_name", "low", ids, "The description only repeats the name.", {}, "Write a real description."));
    else if (state === "too_short") out.push(finding("desc.too_short", "low", ids, "The description is under 40 characters.", { length: plain(p.description ?? "").length }, "Say more: use, key features, what is included."));
    if (p.description && INJECTION_LIKE.test(p.description.slice(0, 4000))) {
      out.push(finding("desc.injection_like", "medium", ids, "The description contains text that reads like an instruction to an AI system.", { text: clip(plain(p.description), 60) }, "Remove it. The Agent treats descriptions as data and never obeys them, but staff-visible content should not carry it."));
    }
    if (p.description && INVISIBLE.test(p.description.slice(0, 4000))) out.push(finding("text.hidden_characters", "medium", ids, "The description contains invisible or direction-changing characters.", {}, "Remove them; a model reads what a person cannot see."));
    if (p.descriptionLength > 20_000) out.push(finding("desc.very_long", "low", ids, "The description is longer than 20,000 characters; only the first part is analysed (and the Agent keeps the first 300).", { length: p.descriptionLength }, "Shorten it."));
    if (p.imageCount === 0) out.push(finding("content.no_image", "low", ids, "The product has no image.", {}, "Add at least one image."));
    for (const u of p.imageUrls) {
      if (u.length > 500 || !(/^https?:\/\//i.test(u) || u.startsWith("/"))) {
        out.push(finding("content.image_unusable", "low", ids, "An image address is too long or not a web address; the Agent drops it.", { length: u.length }, "Use an https address or a site-relative path of at most 500 characters."));
        break;
      }
    }
    for (const u of p.imageUrls) {
      const m = /\/products\/([A-Za-z0-9]{12,})\//.exec(u);
      if (m && m[1] !== p.id) {
        out.push(finding("content.image_folder_mismatch", "low", ids, "An image is stored under another product's folder, so it may have been uploaded for or copied from a different item (not provable from this data).", { folderIsAnotherCataloguedProduct: ctx.byId.has(m[1]!) }, "A person checks that the picture shows this product."));
        break;
      }
    }
    if (p.warrantyMonths === null) out.push(finding("content.no_warranty", "low", ids, "No warranty period is recorded (0 means 'no warranty'; empty means unknown).", {}, "Record the warranty, or 0 if none."));
    if (!p.condition) out.push(finding("content.no_condition", "info", ids, "The condition (new, used) is not recorded.", {}, "Record the condition."));
  }
  return out;
}
