import { z } from "zod";
import { htmlToText, sanitizeHtml } from "./sanitize";

/**
 * The website-owned content document of one product (shared by admin and storefront; contains no ERP-owned data:
 * no price, stock, SKU or ERP name). Every field is optional so a product can have as little or as much as needed.
 */
export const BADGES = ["new", "featured"] as const;
export const BADGE_LABELS: Record<(typeof BADGES)[number], string> = { new: "New Arrival", featured: "Featured" };

export const FEATURE_ICONS = ["check", "zap", "shield", "battery", "wifi", "cpu", "camera", "smartphone", "headphones"] as const;

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const contentDocSchema = z.object({
  displayTitle: text(150),
  subtitle: text(150),
  shortDescription: text(300),
  descriptionHtml: z.string().max(20_000).default("").transform((v) => sanitizeHtml(v)),
  gallery: z.array(z.object({ id: z.string().regex(/^[a-z0-9]{10,40}$/i), alt: text(150), caption: text(200) })).max(8).default([]),
  features: z.array(z.object({ title: text(80), description: text(300), icon: text(30) }).refine((f) => f.title.length > 0, "Each feature needs a title")).max(20).default([]),
  specs: z
    .array(z.object({ group: text(40), name: text(60), value: text(200), unit: text(20) }).refine((s) => s.name.length > 0 && s.value.length > 0, "Each specification needs a name and a value"))
    .max(100)
    .default([]),
  badges: z.array(z.enum(BADGES)).max(2).default([]),
  promoLabel: text(30),
  warranty: z.object({ duration: text(60), description: text(300), terms: text(2000), provider: text(80), notes: text(300) }).default({ duration: "", description: "", terms: "", provider: "", notes: "" }),
  delivery: z.object({ estimate: text(120), pickup: text(500), notes: text(500) }).default({ estimate: "", pickup: "", notes: "" }),
  seo: z.object({ title: text(70), description: text(160), noindex: z.boolean().default(false), ogImageId: z.string().regex(/^[a-z0-9]{10,40}$/i).nullable().default(null) }).default({ title: "", description: "", noindex: false, ogImageId: null }),
  related: z.array(id).max(8).default([]),
});

export type ContentDoc = z.infer<typeof contentDocSchema>;
export type ContentInput = z.input<typeof contentDocSchema>;

export const emptyDoc = (): ContentDoc => contentDocSchema.parse({});

/** Parses whatever is stored (older or partial documents) into a complete, sanitised document; never throws. */
export function normalizeDoc(raw: unknown): ContentDoc {
  const r = contentDocSchema.safeParse(raw);
  if (r.success) return r.data;
  return emptyDoc();
}

/** Does the document hold anything worth showing? */
export function hasContent(d: ContentDoc): boolean {
  return Boolean(
    d.displayTitle || d.subtitle || d.shortDescription || htmlToText(d.descriptionHtml) || d.gallery.length || d.features.length || d.specs.length ||
      d.badges.length || d.promoLabel || d.warranty.duration || d.warranty.description || d.warranty.terms || d.delivery.estimate || d.delivery.pickup ||
      d.delivery.notes || d.seo.title || d.seo.description || d.related.length,
  );
}

/** "Complete" for the admin list: a description, at least one image and some features or specifications. */
export const isComplete = (d: ContentDoc) => Boolean(htmlToText(d.descriptionHtml)) && d.gallery.length > 0 && (d.features.length > 0 || d.specs.length > 0);

export function groupSpecs(specs: ContentDoc["specs"]): { group: string; rows: ContentDoc["specs"] }[] {
  const groups = new Map<string, ContentDoc["specs"]>();
  for (const s of specs) groups.set(s.group || "General", [...(groups.get(s.group || "General") ?? []), s]);
  return [...groups].map(([group, rows]) => ({ group, rows }));
}
