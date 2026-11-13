import "server-only";

/**
 * Which voice features the assistant modal may offer. Both are OFF unless the owner lists them in AI_ASSISTANT_VOICE ("stt", "tts" or
 * "stt,tts") AND the matching website routes exist (/api/assistant/voice/transcribe and /api/assistant/voice/speak). Neither route
 * exists yet, so by default the modal shows voice as "not available yet" and never asks the browser for the microphone.
 */
export interface VoiceCapabilities {
  /** Speech to text: the microphone button records and sends audio to /api/assistant/voice/transcribe. */
  stt: boolean;
  /** Text to speech: replies can be read aloud through /api/assistant/voice/speak. */
  tts: boolean;
}

export function readVoiceCapabilities(env: Readonly<Record<string, string | undefined>> = process.env): VoiceCapabilities {
  const set = new Set((env.AI_ASSISTANT_VOICE ?? "").toLowerCase().split(",").map((s) => s.trim()));
  return { stt: set.has("stt"), tts: set.has("tts") };
}
