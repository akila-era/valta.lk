import "server-only";
import { z } from "zod";
import { brandKey } from "./brand-logos";
import { getDb } from "./db";

/**
 * Each brand's own colour, for its brand page (the band at the top and the page's buttons, prices and badges) and its
 * tile in "Explore our brands". Staff set it in the admin (Brands); until then a well-known brand uses its usual colour
 * and any other brand gets a steady colour of its own from a fixed palette.
 */
const HEX = /^#[0-9a-f]{6}$/i;

/** The usual colours of well-known brands (keys are lower-case brand names). */
const KNOWN: Record<string, string> = {
  samsung: "#1428a0", apple: "#111111", xiaomi: "#ff6900", redmi: "#ff6900", poco: "#ffcc00", huawei: "#c7000b",
  honor: "#0d0d0d", oppo: "#1ba784", vivo: "#415fff", realme: "#ffc915", oneplus: "#eb0028", nokia: "#124191",
  hmd: "#0b2a5b", sony: "#111111", jbl: "#ff5a00", anker: "#00a0e0", ugreen: "#00a65f", google: "#4285f4",
  motorola: "#5c92fa", lenovo: "#e2231a", asus: "#00539b", hp: "#0096d6", dell: "#007db8", philips: "#0b5ed7",
  sandisk: "#e01a22", kingston: "#e31837", transcend: "#d6001c", tecno: "#0057ff", infinix: "#111111", nothing: "#111111",
  cmf: "#ff5b00", baseus: "#e8b20c", amazon: "#ff9900", logitech: "#00b8fc", jabra: "#ffcc00", beats: "#e01f3d",
};

/** Strong colours that read well with white text, for brands with no known or saved colour. */
const PALETTE = ["#1d4ed8", "#047857", "#7c3aed", "#be123c", "#0e7490", "#b45309", "#4338ca", "#15803d", "#9d174d", "#0f766e", "#6d28d9", "#c2410c"];

function paletteColor(name: string): string {
  let h = 0;
  for (const ch of brandKey(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The default colour for a brand: its usual colour when well known, otherwise one from the palette. */
export const defaultBrandColor = (name: string) => KNOWN[brandKey(name)] ?? paletteColor(name);

/** Black or white text, whichever reads better on the colour (WCAG relative luminance). */
export function textOn(hex: string): "#ffffff" | "#111111" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#111111" : "#ffffff";
}

/** The colour mixed toward white (amount 0..1), for light tints. */
export function tint(hex: string, amount: number): string {
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * amount).toString(16).padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

const KEY = "brand-colors";
const TTL_MS = 15_000;
const savedSchema = z.record(z.string().max(80), z.string().regex(HEX));
const g = globalThis as unknown as { __voltaBrandColors?: { at: number; value: Record<string, string> } };

/** Colours staff saved (brandKey -> #rrggbb). Cached briefly; never throws. */
export async function savedBrandColors(): Promise<Record<string, string>> {
  const cur = g.__voltaBrandColors;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const parsed = row ? savedSchema.safeParse(row.value) : null;
  const value = parsed?.success ? parsed.data : {};
  g.__voltaBrandColors = { at: Date.now(), value };
  return value;
}

/** A brand's colour: saved in the admin, else its default. */
export async function brandColor(name: string): Promise<string> {
  return (await savedBrandColors())[brandKey(name)] ?? defaultBrandColor(name);
}

/** Saves (or with null, clears back to the default) one brand's colour. */
export async function saveBrandColor(name: string, color: string | null, by: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("NO_DATABASE");
  if (color !== null && !HEX.test(color)) throw new Error("INVALID_COLOR");
  const next = { ...(await savedBrandColors()) };
  if (color === null) delete next[brandKey(name)];
  else next[brandKey(name)] = color.toLowerCase();
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: next, updatedBy: by }, update: { value: next, updatedBy: by } });
  g.__voltaBrandColors = undefined;
}

/**
 * CSS variables that recolour a page area in the brand's colour: everything inside that uses the store's accent
 * (buttons, prices, badges, links) takes the brand colour instead. Text that must stay readable on white keeps the
 * store's dark text colours.
 */
export function brandThemeStyle(hex: string): Record<string, string> {
  return {
    "--color-brand-500": hex,
    "--color-brand-400": hex,
    "--color-brand-hover": hex,
    "--color-brand-100": tint(hex, 0.8),
    "--color-brand-50": tint(hex, 0.92),
    "--color-on-brand": textOn(hex),
    "--shadow-neon": `0 0 0 1px ${hex}, 0 6px 16px -8px rgb(0 0 0 / 0.35)`,
    "--shadow-neon-lift": `0 0 0 1px ${hex}, 0 14px 30px -14px rgb(0 0 0 / 0.35)`,
  };
}
