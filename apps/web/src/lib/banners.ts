import "server-only";
import { z } from "zod";
import { bannerSchema, type BannerConfig } from "./home-config";
import { getDb } from "./db";
import { bannerIsClean } from "./hygiene";

/** Most banners staff can keep, and most the homepage shows at once. */
export const MAX_BANNERS = 6;
export const MAX_SHOWN = 4;
/** Most wide pictures the homepage rotates through. */
export const MAX_WIDE_SHOWN = 5;

/** Same field rules as the HOME_BANNERS configuration: internal destinations only, short copy. */
export const bannerFormSchema = bannerSchema.omit({ variant: true, categorySlug: true });

/** A wide banner is just a picture with an optional link; the headline is its accessible description. */
export const wideBannerFormSchema = z.object({
  headline: z.string().trim().min(3).max(80),
  href: z.union([z.literal(""), bannerSchema.shape.href]).optional(),
});

/** SIDE = the two pictures beside the hero slider. WIDE and SIDE are picture-only: a picture, a description and an optional link. */
export type Placement = "CARDS" | "WIDE" | "SIDE";
export const isPlacement = (v: unknown): v is Placement => v === "CARDS" || v === "WIDE" || v === "SIDE";
export const isPictureBanner = (p: Placement) => p === "WIDE" || p === "SIDE";
/** Most side pictures the hero rotates through. */
export const MAX_SIDE_SHOWN = 6;

export const bannerImageUrl = (id: string, updatedAt: Date) => `/api/banner-image/${id}?v=${updatedAt.getTime()}`;

export interface StoreBanner extends BannerConfig {
  id?: string;
  image?: string;
  /** True when staff uploaded the picture, so it is used instead of the stock photo. */
  custom: boolean;
}

/** Active banners in display order; empty when there are none or the website database is unavailable. */
export async function activeBanners(): Promise<StoreBanner[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.banner
    .findMany({
      where: { active: true, placement: "CARDS" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: MAX_SHOWN,
      select: { id: true, eyebrow: true, headline: true, text: true, ctaLabel: true, href: true, imageType: true, updatedAt: true },
    })
    .catch(() => []);
  return rows.filter((r) => bannerIsClean(r)).map((r) => ({
    id: r.id,
    variant: "dark" as const,
    eyebrow: r.eyebrow ?? undefined,
    headline: r.headline,
    text: r.text ?? undefined,
    ctaLabel: r.ctaLabel,
    href: r.href,
    image: r.imageType ? bannerImageUrl(r.id, r.updatedAt) : undefined,
    custom: Boolean(r.imageType),
  }));
}

export interface WideBanner {
  image: string;
  alt: string;
  href?: string;
}

/** Active wide banners (with a picture) in display order; the homepage rotates through them. */
export async function activeWideBanners(): Promise<WideBanner[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.banner
    .findMany({
      where: { active: true, placement: "WIDE", imageType: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: MAX_WIDE_SHOWN,
      select: { id: true, headline: true, href: true, updatedAt: true },
    })
    .catch(() => []);
  return rows.filter((r) => bannerIsClean(r)).map((r) => ({ image: bannerImageUrl(r.id, r.updatedAt), alt: r.headline, href: r.href || undefined }));
}

/** Active hero side pictures (with a picture) in display order. */
export async function activeSideBanners(): Promise<WideBanner[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.banner
    .findMany({
      where: { active: true, placement: "SIDE", imageType: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: MAX_SIDE_SHOWN,
      select: { id: true, headline: true, href: true, updatedAt: true },
    })
    .catch(() => []);
  return rows.filter((r) => bannerIsClean(r)).map((r) => ({ image: bannerImageUrl(r.id, r.updatedAt), alt: r.headline, href: r.href || undefined }));
}
