import "server-only";
import { getDb } from "./db";

/** Social posts live in the banner table under their own placement, so no schema change is needed. */
export const SOCIAL_PLACEMENT = "SOCIAL";
export const MAX_SOCIAL = 8;

export type SocialPlatform = "instagram" | "tiktok";
export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  /** Canonical link to the post. */
  url: string;
  /** Address of the official embed player. */
  embedUrl: string;
  caption: string;
}

/** Accepts an Instagram post/reel link or a TikTok video link; returns its canonical link and embed address, or null. */
export function parseSocialUrl(input: string): { platform: SocialPlatform; url: string; embedUrl: string } | null {
  let u: URL;
  try {
    u = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,20})/);
    if (!m) return null;
    const kind = m[1] === "reels" ? "reel" : m[1];
    const url = `https://www.instagram.com/${kind}/${m[2]}/`;
    return { platform: "instagram", url, embedUrl: `${url}embed` };
  }
  if (host === "tiktok.com") {
    const m = u.pathname.match(/^\/@([A-Za-z0-9._-]{1,40})\/video\/(\d{8,25})/);
    if (!m) return null;
    return { platform: "tiktok", url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}`, embedUrl: `https://www.tiktok.com/embed/v2/${m[2]}` };
  }
  return null;
}

/** Active social posts staff added in the admin, in order. Rows whose link no longer parses are skipped. */
export async function activeSocialPosts(): Promise<SocialPost[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.banner
    .findMany({ where: { placement: SOCIAL_PLACEMENT, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: MAX_SOCIAL, select: { id: true, headline: true, href: true } })
    .catch(() => []);
  return rows.flatMap((r) => {
    const p = parseSocialUrl(r.href);
    return p ? [{ id: r.id, ...p, caption: r.headline }] : [];
  });
}
