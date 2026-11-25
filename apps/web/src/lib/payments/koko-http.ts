import "server-only";
import { NextResponse } from "next/server";
import { getActiveKokoConfig } from "./koko-config";

/** Koko may call our return/cancel URLs as a browser redirect (GET + query) or a form POST. Read both. */
export async function readKokoParams(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (req.method === "POST") {
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        const j: unknown = await req.json();
        if (j && typeof j === "object") for (const [k, v] of Object.entries(j as Record<string, unknown>)) out[k] = v == null ? "" : String(v);
      } else {
        for (const [k, v] of (await req.formData()).entries()) if (typeof v === "string") out[k] = v;
      }
    } catch {
      /* an empty or unreadable body just means no extra params */
    }
  }
  return out;
}

/** Public base URL of the site: the admin-saved one, else APP_URL/SITE_URL. Redirects must use it, not req.url, which is the internal host behind a tunnel or proxy. */
export async function publicBase(): Promise<string> {
  const saved = (await getActiveKokoConfig().catch(() => null))?.appUrl;
  return (saved || process.env.APP_URL || process.env.SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
}

/** 303 so that a POST from Koko is followed with a GET on the target page. */
export async function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, (await publicBase()) + "/"), 303);
}
