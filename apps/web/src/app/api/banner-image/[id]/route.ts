import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public: serves a banner picture. The page URL carries ?v=<updatedAt>, so a replaced picture is a new URL and can be cached for a year. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db || !/^[a-z0-9]{10,40}$/i.test(id)) return new Response("Not found", { status: 404 });
  const b = await db.banner.findUnique({ where: { id }, select: { imageType: true, imageData: true } }).catch(() => null);
  if (!b?.imageType || !b.imageData) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(b.imageData), {
    headers: {
      "Content-Type": b.imageType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
