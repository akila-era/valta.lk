import { z } from "zod";
import { errorResponse, guard, json, readJson } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/**
 * Speech to text for the AI assistant. The browser sends one recorded sentence (16 kHz mono WAV, base64) and Gemini
 * writes down what was said, working out for itself whether it is English, Sinhala or Tamil, so the shopper never has to
 * pick a language. The key comes from GEMINI_API_KEY only and never reaches the client. Audio is not stored.
 */
const MODELS = [
  ...new Set([
    process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash",
    ...(process.env.GEMINI_FALLBACK_MODELS?.split(",").map((m) => m.trim()) ?? ["gemini-3-flash-preview", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"]),
  ]),
].filter(Boolean);
const coolUntil = new Map<string, number>();

const bodySchema = z.object({
  // 15 seconds of 16 kHz 16-bit mono is about 480 KB, about 640 KB as base64.
  wav: z.string().min(100).max(900_000).regex(/^[A-Za-z0-9+/=]+$/),
});

const PROMPT =
  "Transcribe the speech in this audio exactly as spoken. The speaker uses English, Sinhala or Tamil, or a mix of them. " +
  "Write Sinhala in Sinhala script and Tamil in Tamil script; write English in English. Output ONLY the transcript, with no " +
  "quotes, labels or commentary. If there is no intelligible speech, output exactly: [none]";

export async function POST(req: Request) {
  const blocked = guard(req, { name: "ai-stt", limit: 30, windowMs: 60_000, mutating: true });
  if (blocked) return blocked;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return errorResponse(503, "AI_UNAVAILABLE", "The AI assistant is not switched on yet.");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(req, 1_000_000));
  } catch {
    return errorResponse(400, "INVALID_BODY", "Invalid request.");
  }

  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: body.wav } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 300 },
  });
  const now = Date.now();
  const ready = MODELS.filter((m) => (coolUntil.get(m) ?? 0) <= now);
  let busy = false;
  for (const model of ready.length ? ready : MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: payload,
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 429 || res.status === 503) {
        coolUntil.set(model, Date.now() + (res.status === 429 ? 30 * 60_000 : 60_000));
        busy = res.status === 429;
        continue;
      }
      if (!res.ok) {
        console.error("[ai-stt]", model, res.status); // never includes the key; it is only sent as a header
        continue;
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      return json({ text: !text || text === "[none]" ? "" : text.slice(0, 600) });
    } catch {
      coolUntil.set(model, Date.now() + 60_000); // timed out: try the next model
    }
  }
  return busy
    ? errorResponse(429, "AI_BUSY", "The assistant has reached its usage limit for now. Please try again in a little while.")
    : errorResponse(502, "AI_FAILED", "I could not understand the audio just now. Please try again.");
}
