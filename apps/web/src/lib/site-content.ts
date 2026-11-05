import "server-only";
import { z } from "zod";
import { getDb } from "./db";
import { reviewSchema, videoSchema } from "./home-config";

/**
 * Website content staff edit in the admin (Content): text pages, FAQs, homepage reviews and videos, the Why Choose
 * cards, the strip under the banner, the opening banner slide and the popular searches. Each piece is one StoreSetting
 * row ("content:<key>"). Until staff save a piece, the storefront keeps its built-in text (or the environment setting),
 * so nothing changes for shoppers before someone edits it.
 */
const line = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) => z.string().trim().min(1, `${label} is required`).max(max);

/** A text page: a title, an optional short intro and the body in simple formatting (see simple-text.tsx). */
export const pageSchema = z.object({
  title: required(100, "Title"),
  intro: line(300).default(""),
  body: z.string().max(20_000).default(""),
});
export type PageContent = z.infer<typeof pageSchema>;

/** Pages that exist on the site; staff can replace their text. Custom pages (e.g. giveaway terms) are added freely. */
export const BUILT_IN_PAGES: Record<string, { title: string; path: string }> = {
  about: { title: "About us", path: "/about" },
  "privacy-policy": { title: "Privacy policy", path: "/privacy-policy" },
  terms: { title: "Terms & conditions", path: "/terms" },
  "shipping-policy": { title: "Shipping policy", path: "/shipping-policy" },
  "returns-policy": { title: "Returns policy", path: "/returns-policy" },
  "warranty-policy": { title: "Warranty & refund policy", path: "/warranty-policy" },
  wholesale: { title: "Apply for wholesale", path: "/wholesale" },
};
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CONTENT = {
  pages: z.record(z.string().regex(SLUG_RE).max(60), pageSchema.extend({ custom: z.boolean().default(false) })).refine((r) => Object.keys(r).length <= 40, "At most 40 pages"),
  faq: z.object({ items: z.array(z.object({ q: required(160, "Question"), a: required(1000, "Answer") })).max(30) }),
  "home-reviews": z.object({ title: line(80).default(""), items: z.array(reviewSchema).max(6) }),
  "home-videos": z.object({ title: line(80).default(""), items: z.array(videoSchema).max(4) }),
  "why-choose": z.object({ items: z.array(z.object({ title: required(60, "Title"), text: required(200, "Text") })).min(1).max(6) }),
  "service-strip": z.object({ items: z.array(z.object({ title: required(40, "Title"), text: line(60).default("") })).min(1).max(6) }),
  "hero-opener": z.object({ eyebrow: line(40).default(""), title: required(80, "Title"), text: line(160).default(""), cta: required(30, "Button label") }),
  "popular-searches": z.object({ items: z.array(z.object({ label: required(30, "Label") })).max(10) }),
} as const;
export type ContentKey = keyof typeof CONTENT;
export type ContentOf<K extends ContentKey> = z.infer<(typeof CONTENT)[K]>;
export const isContentKey = (k: string): k is ContentKey => k in CONTENT;

const TTL_MS = 15_000;
const g = globalThis as unknown as { __voltaSiteContent?: Map<string, { at: number; value: unknown }> };
const cache = (g.__voltaSiteContent ??= new Map());

/** The saved content for a key, or null when staff have not saved it (the caller then uses its built-in default). Never throws. */
export async function getContent<K extends ContentKey>(key: K): Promise<ContentOf<K> | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as ContentOf<K> | null;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: `content:${key}` } }).catch(() => null) : null;
  const parsed = row ? CONTENT[key].safeParse(row.value) : null;
  const value = parsed?.success ? (parsed.data as ContentOf<K>) : null;
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Saves (validated) content; `null` removes it so the built-in default shows again. */
export async function saveContent(key: ContentKey, value: unknown, by: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Website database is not configured." };
  if (value === null) {
    await db.storeSetting.deleteMany({ where: { key: `content:${key}` } });
    cache.delete(key);
    return { ok: true };
  }
  const parsed = CONTENT[key].safeParse(value);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i ? `${i.path.filter((p) => typeof p === "string").join(" ") || "Content"}: ${i.message}` : "Check the content." };
  }
  const data = JSON.parse(JSON.stringify(parsed.data));
  await db.storeSetting.upsert({ where: { key: `content:${key}` }, create: { key: `content:${key}`, value: data, updatedBy: by }, update: { value: data, updatedBy: by } });
  cache.delete(key);
  return { ok: true };
}

/** One page's saved text (built-in or custom), or null. */
export async function getPage(slug: string): Promise<(PageContent & { custom: boolean }) | null> {
  return (await getContent("pages"))?.[slug] ?? null;
}
