import { getActiveErpEnv } from "@/lib/erp/connection";

export const dynamic = "force-dynamic";

/** Image types passed through. SVG is allowed only because of the sandbox policy below, which stops any script in it. */
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml"]);
const MAX_BYTES = 10 * 1024 * 1024;

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
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(origin + rel, { redirect: "error", signal: ctl.signal, headers: { Accept: "image/*" }, next: { revalidate: 3600 } });
    if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TYPES.has(type)) return new Response("Not an image", { status: 415 });
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return new Response("Too large", { status: 413 });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response("Too large", { status: 413 });
    return new Response(body, {
      headers: {
        "Content-Type": type,
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
