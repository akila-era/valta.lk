import { SYSTEM, tools } from "@/lib/ai/shop-tools";
import { errorResponse, guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/**
 * Live voice agent, step 1: hand the browser a short-lived Gemini token so it can talk to Gemini Live directly
 * (audio goes browser <-> Google, not through this server). The real GEMINI_API_KEY stays on the server.
 * The token works for one connection only, starts within 60 seconds and stops working after 15 minutes. (Locking the
 * model into the token makes Gemini ignore the tools and prompt the browser sends, so it is deliberately not locked.)
 */
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";

const LIVE_INSTRUCTION = `${SYSTEM}
You are speaking out loud with the shopper in a live voice conversation. Keep every answer to one or two short spoken sentences, never read lists or links aloud, and mention at most two or three products. Reply in the language the shopper speaks: English, Sinhala or Tamil. When the shopper asks you to open, show, add, compare or find something, call the matching tool first and then say briefly what you did.`;

export async function POST(req: Request) {
  const blocked = guard(req, { name: "ai-live", limit: 6, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return errorResponse(503, "AI_UNAVAILABLE", "The AI assistant is not switched on yet.");

  try {
    const now = Date.now();
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 15 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error("[ai-live] token", res.status, (await res.text()).slice(0, 200));
      if (res.status === 429) return errorResponse(429, "AI_BUSY", "The assistant has reached its usage limit for now. Please try again in a little while.");
      return errorResponse(502, "AI_FAILED", "The live voice assistant could not start just now.");
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) return errorResponse(502, "AI_FAILED", "The live voice assistant could not start just now.");
    return json({ token: data.name, model: `models/${LIVE_MODEL}`, systemInstruction: LIVE_INSTRUCTION, tools });
  } catch (e) {
    console.error("[ai-live]", e instanceof Error ? e.message : e);
    return errorResponse(502, "AI_FAILED", "The live voice assistant could not start just now.");
  }
}
