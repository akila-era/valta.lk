import "server-only";
import { z } from "zod";
import { getDb } from "./db";
import { siteConfig } from "./site-config";

/** Instalment providers the storefront can name, with their display names. */
export const INSTALMENT_PROVIDERS = { koko: "KOKO", mintpay: "Mintpay" } as const;
export type InstalmentProvider = keyof typeof INSTALMENT_PROVIDERS;

/**
 * The "or 3 × LKR … with KOKO | Mintpay" line under product card prices, as staff set it in the admin (Payments).
 * Off unless switched on there; before anything is saved, the SITE_INSTALMENTS environment variable is the default.
 */
export const instalmentSchema = z.object({
  enabled: z.boolean(),
  providers: z.array(z.enum(["koko", "mintpay"])).max(2),
  parts: z.number().int().min(2).max(6),
});
export type InstalmentSettings = z.infer<typeof instalmentSchema>;

/** What the cards get: null = no line. */
export type InstalmentLine = { providers: InstalmentProvider[]; parts: number } | null;

const KEY = "instalments";
const TTL_MS = 15_000;

const fromEnv = (): InstalmentSettings => ({ enabled: siteConfig.instalments.length > 0, providers: siteConfig.instalments as InstalmentProvider[], parts: 3 });

const g = globalThis as unknown as { __voltaInstalments?: { at: number; value: InstalmentSettings } };

/** The saved settings (or the environment default). Cached briefly; never throws, so the storefront cannot break on it. */
export async function getInstalmentSettings(): Promise<InstalmentSettings> {
  const cur = g.__voltaInstalments;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const parsed = row ? instalmentSchema.safeParse(row.value) : null;
  const value = parsed?.success ? { ...parsed.data, providers: [...new Set(parsed.data.providers)] } : fromEnv();
  g.__voltaInstalments = { at: Date.now(), value };
  return value;
}

/** The line to show on product cards right now, or null when it is off (or no provider is chosen). */
export async function instalmentLine(): Promise<InstalmentLine> {
  const s = await getInstalmentSettings();
  return s.enabled && s.providers.length ? { providers: s.providers, parts: s.parts } : null;
}

/** Saves the settings and drops the cache, so this server shows the change at once (others within TTL_MS). */
export async function saveInstalmentSettings(value: InstalmentSettings, by: string): Promise<InstalmentSettings> {
  const db = getDb();
  if (!db) throw new Error("NO_DATABASE");
  const clean = { ...value, providers: [...new Set(value.providers)] };
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: clean, updatedBy: by }, update: { value: clean, updatedBy: by } });
  g.__voltaInstalments = undefined;
  return clean;
}
