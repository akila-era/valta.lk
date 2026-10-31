import "server-only";
import { z } from "zod";
import { getDb } from "./db";

/**
 * The seasonal look of the storefront, switched on and off by staff in the admin (Promotions, Seasonal Theme).
 * "halloween" turns the O of the header wordmark into a pumpkin, puts the theme's line in the top bar and adds bats and
 * a cobweb under the header. Decoration only: prices, stock and checkout never change with it.
 */
export const SEASONS = { none: "Normal look", halloween: "Halloween" } as const;
export type Season = keyof typeof SEASONS;

export const DEFAULT_MESSAGES: Record<Exclude<Season, "none">, string> = {
  halloween: "Happy Halloween from VOLTA.LK",
};

export const seasonSchema = z.object({
  season: z.enum(["none", "halloween"]),
  /** The top bar line while the theme is on; empty means the default line for that theme. */
  message: z.string().trim().max(90).default(""),
});
export type SeasonSettings = z.infer<typeof seasonSchema>;

/** What the storefront gets: null when the normal look is on. */
export type ActiveSeason = { season: Exclude<Season, "none">; message: string } | null;

const KEY = "season";
const TTL_MS = 15_000;
const OFF: SeasonSettings = { season: "none", message: "" };

const g = globalThis as unknown as { __voltaSeason?: { at: number; value: SeasonSettings } };

/** The saved theme (or the normal look). Cached briefly; never throws, so the storefront cannot break on it. */
export async function getSeasonSettings(): Promise<SeasonSettings> {
  const cur = g.__voltaSeason;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const parsed = row ? seasonSchema.safeParse(row.value) : null;
  const value = parsed?.success ? parsed.data : OFF;
  g.__voltaSeason = { at: Date.now(), value };
  return value;
}

export async function activeSeason(): Promise<ActiveSeason> {
  const s = await getSeasonSettings();
  return s.season === "none" ? null : { season: s.season, message: s.message || DEFAULT_MESSAGES[s.season] };
}

/** Saves the theme and drops the cache, so this server shows the change at once (others within TTL_MS). */
export async function saveSeasonSettings(value: SeasonSettings, by: string): Promise<SeasonSettings> {
  const db = getDb();
  if (!db) throw new Error("NO_DATABASE");
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy: by }, update: { value, updatedBy: by } });
  g.__voltaSeason = undefined;
  return value;
}
