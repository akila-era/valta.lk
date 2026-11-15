import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth/session";
import { readAssistantConfig } from "@/lib/assistant/config";
import { hasAssistantAccess } from "@/lib/assistant/preview";
import type { AgentIdentity } from "@/lib/assistant/sign";
import { audioKindOf, BodyTooLarge, callAgentVoice, guestOrCustomerIp, MAX_AUDIO_BYTES, MAX_SPEECH_CHARS, MAX_SPEECH_REQUEST_BYTES, readBodyCapped, voiceFailure } from "@/lib/assistant/voice-agent";
import { readVoiceCapabilities } from "@/lib/assistant/voice-config";
import { errorResponse, guard, json } from "@/lib/security/api";
import { clientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(1).max(MAX_SPEECH_CHARS), lang: z.enum(["en", "si"]) }).strict();

/**
 * Text to speech: reads an assistant reply aloud. When the Agent has no voice for the language the answer is 501 and the browser falls
 * back to its own speech synthesis (or stays silent). The audio is validated again here (wav or mp3 only) before it is sent on, and it is
 * never cached or stored.
 */
export async function POST(req: Request) {
  const cfg = readAssistantConfig();
  if (!cfg || !readVoiceCapabilities().tts || !(await hasAssistantAccess(cfg))) return errorResponse(404, "NOT_FOUND", "Not found.");
  const blocked = guard(req, { name: "assistant-voice-tts", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  let raw: unknown;
  try {
    raw = JSON.parse((await readBodyCapped(req, MAX_SPEECH_REQUEST_BYTES)).toString("utf8")); // streamed with a cap: a large body is never buffered whole
  } catch (e) {
    if (e instanceof BodyTooLarge) return errorResponse(413, "PAYLOAD_TOO_LARGE", "That request is too large.");
    return errorResponse(422, "INVALID", "That request is not valid.");
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return errorResponse(422, "INVALID", "That request is not valid.");

  const customer = await getCurrentCustomer();
  const identity: AgentIdentity = customer ? { kind: "customer", customerId: customer.id } : { kind: "guest" };
  const r = await callAgentVoice(cfg, { path: "/v1/voice/speak", body: Buffer.from(JSON.stringify(parsed.data)), contentType: "application/json", identity, clientIp: guestOrCustomerIp(clientIp(req)), maxReplyBytes: MAX_AUDIO_BYTES });
  if (!r.ok) {
    const f = voiceFailure(r);
    return json({ error: { code: f.code, message: f.message } }, f.status, f.retryAfterSec ? { "Retry-After": String(f.retryAfterSec) } : undefined);
  }
  const kind = audioKindOf(r.body);
  if (!kind || r.body.length === 0 || r.body.length > MAX_AUDIO_BYTES) return errorResponse(502, "ASSISTANT_ERROR", "Spoken replies are not available right now.");
  return new Response(new Uint8Array(r.body), { status: 200, headers: { "Content-Type": kind, "Content-Length": String(r.body.length), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
