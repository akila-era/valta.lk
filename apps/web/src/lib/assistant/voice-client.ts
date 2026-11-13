/**
 * Browser-side client of the two voice routes of THIS website:
 *   POST /api/assistant/voice/transcribe   body: the recorded audio; answer: { text }
 *   POST /api/assistant/voice/speak        body: { text, lang }; answer: audio
 * These routes are not implemented yet. Until they are, every call here fails with "unavailable" (HTTP 404/501) and the modal says
 * so. Nothing here fakes a result. The recognised text goes back into the text box for the shopper to check and edit; it reaches the
 * assistant only through the normal chat route (HMAC, verification and safety are all unchanged).
 */
export type VoiceFailure = "unavailable" | "too_large" | "rate_limited" | "failed";

export class VoiceError extends Error {
  constructor(readonly code: VoiceFailure) {
    super(code);
    this.name = "VoiceError";
  }
}

export interface VoiceApi {
  transcribe(audio: Blob, lang: "auto" | "en" | "si", signal?: AbortSignal): Promise<{ text: string }>;
  speak(text: string, lang: "en" | "si", signal?: AbortSignal): Promise<Blob>;
}

export const TRANSCRIBE_URL = "/api/assistant/voice/transcribe";
export const SPEAK_URL = "/api/assistant/voice/speak";
export const MAX_AUDIO_BYTES = 5_000_000;
export const MAX_TRANSCRIPT_CHARS = 800;

function failure(status: number): VoiceError {
  if (status === 404 || status === 501 || status === 405) return new VoiceError("unavailable");
  if (status === 413) return new VoiceError("too_large");
  if (status === 429) return new VoiceError("rate_limited");
  return new VoiceError("failed");
}

export const realVoiceApi: VoiceApi = {
  async transcribe(audio, lang, signal) {
    if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) throw new VoiceError("too_large");
    let res: Response;
    try {
      res = await fetch(`${TRANSCRIBE_URL}?lang=${lang}`, { method: "POST", headers: { "content-type": audio.type || "application/octet-stream" }, body: audio, ...(signal ? { signal } : {}) });
    } catch {
      throw new VoiceError("failed");
    }
    if (!res.ok) throw failure(res.status);
    const data = (await res.json().catch(() => null)) as { text?: unknown } | null;
    // Whatever comes back is shown as plain text for the shopper to read and edit: bounded and trimmed, never trusted further.
    if (!data || typeof data.text !== "string") throw new VoiceError("failed");
    return { text: data.text.replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS) };
  },

  async speak(text, lang, signal) {
    let res: Response;
    try {
      res = await fetch(SPEAK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, MAX_TRANSCRIPT_CHARS * 2), lang }), ...(signal ? { signal } : {}) });
    } catch {
      throw new VoiceError("failed");
    }
    if (!res.ok) throw failure(res.status);
    const type = res.headers.get("content-type") ?? "";
    if (!/^audio\//i.test(type)) throw new VoiceError("failed");
    const blob = await res.blob();
    if (blob.size === 0 || blob.size > MAX_AUDIO_BYTES) throw new VoiceError("failed");
    return blob;
  },
};
