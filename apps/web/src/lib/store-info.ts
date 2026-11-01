import "server-only";
import { z } from "zod";
import { getDb } from "./db";
import { siteConfig } from "./site-config";

/** Payment brands the footer's "Payment System" row can show (as on ugreen.lk), with their display names. */
export const PAYMENT_BADGES = {
  koko: "KOKO",
  mintpay: "Mintpay",
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "AMEX",
  bank: "Bank Transfer",
  cod: "Cash Payment",
} as const;
export type PaymentBadge = keyof typeof PAYMENT_BADGES;

const text = (max: number) => z.string().trim().max(max).default("");
const link = z.union([z.literal(""), z.string().trim().url().max(300).refine((u) => /^https:\/\//i.test(u), "Links must start with https://")]).default("");

/**
 * The store's own details, edited in the admin (Settings, Store details): the top bar, contact details, opening hours,
 * social links and the payment badges in the footer. Everything the ERP does not own. Blank values are hidden.
 */
export const storeInfoSchema = z.object({
  /** The line at the left of the black top bar, e.g. "VOLTA.LK Sri Lanka Official Store". */
  topLine: text(90),
  phone: text(30),
  phone2: text(30),
  whatsapp: text(30),
  email: z.union([z.literal(""), z.string().trim().email().max(120)]).default(""),
  address: text(200),
  /** The "Store Locator" link in the top bar (a Google Maps link). */
  mapUrl: link,
  hours: z.array(z.string().trim().min(1).max(60)).max(4).default([]),
  social: z.object({ facebook: link, instagram: link, tiktok: link, youtube: link }).default({ facebook: "", instagram: "", tiktok: "", youtube: "" }),
  payments: z.array(z.enum(Object.keys(PAYMENT_BADGES) as [PaymentBadge, ...PaymentBadge[]])).max(7).default([]),
});
export type StoreInfo = z.infer<typeof storeInfoSchema>;

/** Sample details for a demo: one click in the admin fills the form with these (nothing is saved until Save). */
export const DEMO_STORE_INFO: StoreInfo = {
  topLine: `${siteConfig.name} Sri Lanka Official Store`,
  phone: "077 123 4567",
  phone2: "011 234 5678",
  whatsapp: "+94 77 123 4567",
  email: "info@volta.lk",
  address: "123 Galle Road, Colombo 03, Sri Lanka",
  mapUrl: "https://maps.google.com/?q=Galle+Road+Colombo+03",
  hours: ["Mon - Sat: 9:00 AM - 7:00 PM", "Sunday: 10:00 AM - 4:00 PM"],
  social: {
    facebook: "https://www.facebook.com/",
    instagram: "https://www.instagram.com/",
    tiktok: "https://www.tiktok.com/",
    youtube: "https://www.youtube.com/",
  },
  payments: ["koko", "mintpay", "visa", "mastercard", "bank", "cod"],
};

const KEY = "store-info";
const TTL_MS = 15_000;

/** Before anything is saved in the admin, the server environment settings are the default. */
const fromEnv = (): StoreInfo => ({
  topLine: siteConfig.announcement,
  phone: siteConfig.phone,
  phone2: "",
  whatsapp: siteConfig.whatsapp,
  email: siteConfig.email,
  address: siteConfig.address,
  mapUrl: "",
  hours: siteConfig.hours,
  social: {
    facebook: process.env.SITE_SOCIAL_FACEBOOK?.trim() ?? "",
    instagram: process.env.SITE_SOCIAL_INSTAGRAM?.trim() ?? "",
    tiktok: process.env.SITE_SOCIAL_TIKTOK?.trim() ?? "",
    youtube: process.env.SITE_SOCIAL_YOUTUBE?.trim() ?? "",
  },
  payments: siteConfig.paymentMethods.filter((p): p is PaymentBadge => p in PAYMENT_BADGES),
});

const g = globalThis as unknown as { __voltaStoreInfo?: { at: number; value: StoreInfo } };

/** The saved details (or the environment defaults). Cached briefly; never throws, so the storefront cannot break on it. */
export async function getStoreInfo(): Promise<StoreInfo> {
  const cur = g.__voltaStoreInfo;
  if (cur && Date.now() - cur.at < TTL_MS) return cur.value;
  const db = getDb();
  const row = db ? await db.storeSetting.findUnique({ where: { key: KEY } }).catch(() => null) : null;
  const parsed = row ? storeInfoSchema.safeParse(row.value) : null;
  const value = parsed?.success ? parsed.data : fromEnv();
  g.__voltaStoreInfo = { at: Date.now(), value };
  return value;
}

/** Saves the details and drops the cache, so this server shows the change at once (others within TTL_MS). */
export async function saveStoreInfo(value: StoreInfo, by: string): Promise<StoreInfo> {
  const db = getDb();
  if (!db) throw new Error("NO_DATABASE");
  const clean = { ...value, payments: [...new Set(value.payments)] };
  await db.storeSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: clean, updatedBy: by }, update: { value: clean, updatedBy: by } });
  g.__voltaStoreInfo = undefined;
  return clean;
}

/** The social links that are set, in a fixed order, for the footer. */
export function socialFrom(info: StoreInfo): { label: string; href: string }[] {
  const s = info.social;
  return [
    { label: "Facebook", href: s.facebook },
    { label: "Instagram", href: s.instagram },
    { label: "TikTok", href: s.tiktok },
    { label: "YouTube", href: s.youtube },
  ].filter((x) => x.href);
}

/** "077 123 4567" -> "tel:0771234567" */
export const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
