import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/session";
import { readAssistantConfig } from "@/lib/assistant/config";
import { PREVIEW_COOKIE, PREVIEW_MAX_AGE, previewCookieValue, previewKeyMatches } from "@/lib/assistant/preview";
import { errorResponse, guard } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Opens the private preview of the assistant for this browser: GET /api/assistant/preview?key=<AI_ASSISTANT_PREVIEW_KEY>. */
export async function GET(req: Request) {
  const cfg = readAssistantConfig();
  if (!cfg || !cfg.previewKey) return errorResponse(404, "NOT_FOUND", "Not found.");
  const blocked = guard(req, { name: "assistant-preview", limit: 10, windowMs: 60_000 });
  if (blocked) return blocked;
  if (!previewKeyMatches(cfg, new URL(req.url).searchParams.get("key"))) return errorResponse(404, "NOT_FOUND", "Not found.");
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(PREVIEW_COOKIE, previewCookieValue(cfg)!, { ...sessionCookieOptions(new Date(Date.now() + PREVIEW_MAX_AGE * 1000)), maxAge: PREVIEW_MAX_AGE });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
