import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public: serves an uploaded product image. Ids are random and never reused, so responses can be cached for a year. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db || !/^[a-z0-9]{10,40}$/i.test(id)) return new Response("Not found", { status: 404 });
  const a = await db.mediaAsset.findUnique({ where: { id }, select: { contentType: true, data: true } }).catch(() => null);
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
