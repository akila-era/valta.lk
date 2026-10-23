import { z } from "zod";

/**
 * Optional homepage promotions, configured with the HOME_BANNERS environment variable (JSON array).
 * Example:
 *   [{"variant":"dark","eyebrow":"Flagships","headline":"The latest smartphones","text":"Browse our range.",
 *     "ctaLabel":"Shop phones","href":"/categories/mobile-phones","categorySlug":"mobile-phones"}]
 * Hrefs must be internal paths. A banner whose destination category does not exist is hidden.
 * When HOME_BANNERS is unset, the homepage derives two neutral banners from real categories (no offers or claims).
 */
export const bannerSchema = z.object({
  variant: z.enum(["dark", "light"]),
  eyebrow: z.string().trim().max(40).optional(),
  headline: z.string().trim().min(3).max(80),
  text: z.string().trim().max(160).optional(),
  ctaLabel: z.string().trim().min(2).max(30),
  href: z.string().regex(/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/, "internal path only"),
  categorySlug: z.string().trim().max(100).optional(),
});
export type BannerConfig = z.infer<typeof bannerSchema>;

export function parseBanners(raw: string | undefined): BannerConfig[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = z.array(bannerSchema).max(4).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const configuredBanners = () => parseBanners(process.env.HOME_BANNERS);

/** Optional social links shown in the footer when set. */
export const socialLinks = () =>
  [
    { label: "Facebook", href: process.env.SITE_SOCIAL_FACEBOOK },
    { label: "Instagram", href: process.env.SITE_SOCIAL_INSTAGRAM },
    { label: "TikTok", href: process.env.SITE_SOCIAL_TIKTOK },
    { label: "YouTube", href: process.env.SITE_SOCIAL_YOUTUBE },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href && /^https:\/\//.test(s.href)));

/**
 * Optional homepage videos, configured with HOME_VIDEOS (JSON array, max 4) and HOME_VIDEOS_TITLE. Example:
 *   [{"id":"<11-char YouTube id>","title":"Unboxing our latest arrivals","channel":"Our channel"}]
 * Nothing is shown until real videos are configured. `thumbnail` may be an internal path or an i.ytimg.com URL;
 * by default YouTube's own thumbnail for the id is used. Videos load only after the visitor presses play.
 */
export const videoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "11-character YouTube video id"),
  title: z.string().trim().min(2).max(100),
  channel: z.string().trim().max(60).optional(),
  thumbnail: z
    .string()
    .regex(/^(\/(?!\/)[A-Za-z0-9\-._~/]+|https:\/\/i\.ytimg\.com\/[A-Za-z0-9\-._~/]+)$/, "internal path or i.ytimg.com URL")
    .optional(),
});
export type VideoConfig = z.infer<typeof videoSchema>;

export function parseVideos(raw: string | undefined): VideoConfig[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = z.array(videoSchema).max(4).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const configuredVideos = () => ({
  title: process.env.HOME_VIDEOS_TITLE?.trim().slice(0, 80) || "Watch and learn",
  videos: parseVideos(process.env.HOME_VIDEOS),
});
