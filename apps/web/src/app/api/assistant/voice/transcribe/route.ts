import { z } from "zod";
import { getCurrentCustomer } from "@/lib/auth/session";
import { readAssistantConfig } from "@/lib/assistant/config";
import { hasAssistantAccess } from "@/lib/assistant/preview";
import type { AgentIdentity } from "@/lib/assistant/sign";
import { callAgentVoice, BodyTooLarge, guestOrCustomerIp, looksLikeAudio, MAX_AUDIO_BYTES, readBodyCapped, voiceFailure } from "@/lib/assistant/voice-agent";
import { readVoiceCapabilities } from "@/lib/assistant/voice-config";
import { errorResponse, guard, json } from "@/lib/security/api";
import { clientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Reply = z.object({ voiceVersion: z.literal("1"), text: z.string().max(800), language: z.enum(["si", "en", "mixed", "unknown"]) }).passthrough();
const Lang = z.enum(["auto", "en", "si"]);

/**
 * Speech to text. The browser posts the recorded audio; the answer is TEXT only, which the browser puts in the message box for the
 * shopper to read and edit. The text reaches the assistant only when the shopper sends it through the normal chat route, so voice has no
 * conversation, memory or tool path of its own.
 *
 *  - Off (404) unless the assistant is configured, the shopper has access, and AI_ASSISTANT_VOICE lists "stt".
 *  - Same-origin only, rate limited per client, body capped while it is read, first-bytes check; the Agent does the strict audio check.
 *  - Identity comes only from the sign-in cookie; the Agent receives it signed. Audio is held in memory for this request and zeroed after.
 *  - Nothing about the audio or the transcript is logged or stored.
 */
export async function POST(req: Request) {
  const cfg = readAssistantConfig();
  if (!cfg || !readVoiceCapabilities().stt || !(await hasAssistantAccess(cfg))) return errorResponse(404, "NOT_FOUND", "Not found.");
  const blocked = guard(req, { name: "assistant-voice-stt", limit: 10, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;

  const lang = Lang.safeParse(new URL(req.url).searchParams.get("lang") ?? "auto");
  if (!lang.success) return errorResponse(422, "INVALID", "That request is not valid.");

  let audio: Buffer;
  try {
    audio = await readBodyCapped(req, MAX_AUDIO_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLarge) return errorResponse(413, "PAYLOAD_TOO_LARGE", "The recording is too large.");
    return errorResponse(422, "INVALID", "The recording could not be read.");
  }
  try {
    if (audio.length === 0) return errorResponse(422, "INVALID_AUDIO", "No audio was received.");
    if (!looksLikeAudio(audio)) return errorResponse(415, "UNSUPPORTED_AUDIO", "This audio format is not supported.");

    const customer = await getCurrentCustomer();
    const identity: AgentIdentity = customer ? { kind: "customer", customerId: customer.id } : { kind: "guest" };
    const r = await callAgentVoice(cfg, { path: "/v1/voice/transcribe", body: audio, contentType: "application/octet-stream", identity, clientIp: guestOrCustomerIp(clientIp(req)), lang: lang.data, maxReplyBytes: 20_000 });
    if (!r.ok) {
      const f = voiceFailure(r);
      return json({ error: { code: f.code, message: f.message } }, f.status, f.retryAfterSec ? { "Retry-After": String(f.retryAfterSec) } : undefined);
    }
    let parsed: z.infer<typeof Reply>;
    try {
      parsed = Reply.parse(JSON.parse(r.body.toString("utf8")));
    } catch {
      return errorResponse(502, "ASSISTANT_ERROR", "Voice is not available right now. Please type your message.");
    }
    // Only these two fields reach the browser. The text is shown for editing and is never trusted further.
    return json({ text: parsed.text, language: parsed.language });
  } finally {
    audio.fill(0);
  }
}
