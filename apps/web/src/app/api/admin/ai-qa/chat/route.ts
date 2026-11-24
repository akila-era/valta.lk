import { z } from "zod";
import { qaChat } from "@/lib/ai-qa/agent-client";
import { qaFront } from "@/lib/ai-qa/front";
import { errorResponse, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

const Body = z.strictObject({ message: z.string().trim().min(1).max(800), locale: z.enum(["auto", "en", "si"]).default("auto"), token: z.string().max(80).optional() });

/**
 * Admin, development only: one chat turn through the REAL Agent path (same signing, validation and response shaping as the public
 * assistant), as a guest, with its own QA conversation. It never confirms a proposal and never carries a customer identity.
 */
export async function POST(req: Request) {
  const denied = await qaFront(req, "chat", true);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await readJson(req, 4_000);
  } catch {
    return errorResponse(422, "INVALID", "Send a message of up to 800 characters.");
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return errorResponse(422, "INVALID", "Send a message of up to 800 characters.");
  const r = await qaChat({ message: parsed.data.message, locale: parsed.data.locale, ...(parsed.data.token ? { token: parsed.data.token } : {}) });
  return json(r.ok ? { ok: true, token: r.token, response: r.response, latencyMs: r.latencyMs } : { ok: false, code: r.code, latencyMs: r.latencyMs, ...(r.retryAfterSec ? { retryAfterSec: r.retryAfterSec } : {}) });
}
