import "server-only";
import { z } from "zod";
import { getDb } from "./db";

/**
 * A short line per category (as on ugreen.lk: "Power Up Fast", "Strong durability"), shown above the category's name
 * on the homepage range tiles. Staff write it in the admin (Categories); a category without one shows its product count.
 */
export const MAX_TAGLINE = 40;
const KEY = "category-taglines";
const TTL_MS = 15_000;
const schema = z.record(z.string().max(120), z.string().max(MAX_TAGLINE));
const g = globalThis as unknown as { __voltaTaglines?: { at: number; value: Record<string, string> } };

/** category slug -> tagline. Cached briefly; never throws. */
export async function categoryTaglines(): Promise<Record<string, string>> {
  const cur = g.__voltaTaglines;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const parsed = row ? schema.safeParse(row.value) : null;
  const value = parsed?.success ? parsed.data : {};
  g.__voltaTaglines = { at: Date.now(), value };
  return value;
}

/** Saves one category's tagline; an empty one removes it. */
export async function saveCategoryTagline(slug: string, tagline: string, by: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("NO_DATABASE");
  const next = { ...(await categoryTaglines()) };
  const clean = tagline.trim().slice(0, MAX_TAGLINE);
  if (clean) next[slug] = clean;
  else delete next[slug];
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next, updatedBy: by }, update: { value: next, updatedBy: by } });
  g.__voltaTaglines = undefined;
}
