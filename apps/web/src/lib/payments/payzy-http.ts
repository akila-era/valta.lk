import "server-only";
import { NextResponse } from "next/server";

/** Payzy redirects the browser with query params (GET); a form POST is accepted too. Read both. */
export async function readPayzyParams(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (req.method === "POST") {
    try {
      if ((req.headers.get("content-type") ?? "").includes("json")) {
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

/** 303 to a path on our public site (APP_URL, not req.url, which is the internal host behind a tunnel or proxy). */
export function redirectToSite(path: string) {
  const base = (process.env.APP_URL || process.env.SITE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  return NextResponse.redirect(new URL(path, base + "/"), 303);
}
