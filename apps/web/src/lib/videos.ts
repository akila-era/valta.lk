import "server-only";
import { getDb } from "./db";
import { configuredVideos, type VideoConfig } from "./home-config";

/** Most videos staff can keep. */
export const MAX_VIDEOS = 12;
/** Videos live in the banner table with this placement, so no schema change is needed. */
export const VIDEO_PLACEMENT = "VIDEO";

/** The 11-character YouTube id from a watch, short, embed or shorts link (or a bare id); null when it is none of those. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** Videos staff added in the admin (active, in order); with none, the HOME_VIDEOS configuration is used. */
export async function homeVideos(): Promise<{ title: string; items: VideoConfig[] }> {
  const env = configuredVideos();
  const db = getDb();
  if (!db) return { title: env.title, items: env.videos };
  const rows = await db.banner
    .findMany({ where: { placement: VIDEO_PLACEMENT, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: MAX_VIDEOS, select: { headline: true, text: true, href: true } })
    .catch(() => []);
  const items: VideoConfig[] = rows.flatMap((r) => (/^[A-Za-z0-9_-]{11}$/.test(r.href) ? [{ id: r.href, title: r.headline, channel: r.text ?? undefined }] : []));
  return items.length ? { title: env.title, items } : { title: env.title, items: env.videos };
}
