import { getActiveErpEnv } from "@/lib/erp/connection";

export const dynamic = "force-dynamic";

/** Image types passed through. SVG is allowed only because of the sandbox policy below, which stops any script in it. */
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml"]);
const MAX_BYTES = 10 * 1024 * 1024;
/** Photo formats whose plain border is trimmed (SVG and GIF are passed through untouched). */
const TRIM = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Cuts away a plain border around the product (the colour of the photo's corner, e.g. the white studio space many
 * product shots have), so the product fills the card instead of floating small in the middle. A photo without such a
 * border is left as it is, and if anything goes wrong (or sharp is not installed) the original bytes are served.
 */
async function trimBorder(buf: ArrayBuffer, type: string): Promise<{ body: ArrayBuffer; type: string }> {
  if (!TRIM.has(type)) return { body: buf, type };
  try {
    const sharp = (await import("sharp")).default;
    const input = Buffer.from(buf);
    const { data, info } = await sharp(input).trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
    const meta = await sharp(input).metadata();
    // Keep the original when trimming removed (almost) nothing or would leave a sliver.
    if (!meta.width || !meta.height || info.width < 32 || info.height < 32 || info.width * info.height > meta.width * meta.height * 0.95) return { body: buf, type };
    // A little breathing room back around the product, in the corner colour.
    const pad = Math.round(Math.max(info.width, info.height) * 0.04);
    const corner = await sharp(input).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const background = { r: corner[0] ?? 255, g: corner[1] ?? 255, b: corner[2] ?? 255, alpha: 1 };
    const padded = await sharp(data).extend({ top: pad, bottom: pad, left: pad, right: pad, background }).toFormat(type === "image/png" ? "png" : "webp", { quality: 90 }).toBuffer();
    return { body: Uint8Array.from(padded).buffer, type: type === "image/png" ? "image/png" : "image/webp" };
  } catch {
    return { body: buf, type };
  }
}

/**
 * Product photos stored on the connected ERP, served from this site (/api/erp-image/<path on the ERP>).
 *
 * Why: the image optimiser only accepts hosts listed when the site was built, but the ERP can be connected later in the
 * admin (ERP Settings), and an http:// ERP would be blocked on this https site. The path is always fetched from the
 * ERP that is connected right now, never from an address in the request, so this cannot be used to reach other hosts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const env = await getActiveErpEnv();
  if (!env) return new Response("No ERP connected", { status: 404 });
  const rel = "/" + path.map((p) => encodeURIComponent(decodeURIComponent(p))).join("/");
  if (rel.length > 600 || path.some((p) => p === ".." || p === "." || p === "")) return new Response("Bad path", { status: 400 });

  const origin = new URL(env.HX_API_BASE).origin;
  const ctl = new AbortController();
  // Generous: the first request for a photo can wait on a busy ERP; after that it is cached.
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(origin + rel, { redirect: "error", signal: ctl.signal, headers: { Accept: "image/*" }, next: { revalidate: 3600 } });
    if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TYPES.has(type)) return new Response("Not an image", { status: 415 });
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return new Response("Too large", { status: 413 });
    const raw = await res.arrayBuffer();
    if (raw.byteLength > MAX_BYTES) return new Response("Too large", { status: 413 });
    const out = await trimBorder(raw, type);
    return new Response(out.body, {
      headers: {
        "Content-Type": out.type,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("ERP image unavailable", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
