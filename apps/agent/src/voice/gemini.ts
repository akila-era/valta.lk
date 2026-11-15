import { ProviderError, type SttLang, type SttProvider, type TtsLang, type TtsProvider } from "./providers";
import type { AudioFormat } from "./audio";

/**
 * DISABLED PLACEHOLDERS for Gemini speech (transcription and text-to-speech). They exist so the integration point is named and tested, and so nothing else has to
 * guess how a hosted speech engine would plug into the voice routes. They have NEVER made a call, read no environment variable and no file, and refuse to work
 * even when a fetch function and a key are injected, because:
 *
 *  - the request and response shapes for audio input and for speech output were NOT verified against the live documentation (the researcher read summarised pages,
 *    and Gemini's audio endpoints, model ids and limits change often); writing them from memory would be guessing;
 *  - hosted speech must be reserved and settled against the shared monthly budget BY AUDIO SECONDS (the gateway's budget controller has the category), which needs
 *    an adapter that takes a budget controller: not built, and not useful before the shapes are verified;
 *  - the owner has not approved sending customer voice to a third party (privacy design, customer notice, legal review), and Sinhala/Singlish recognition and
 *    Sinhala speech quality are unevaluated and need native-speaker recordings (docs/VOLTA_SINHALA_AUDIO_EVALUATION.md).
 *
 * To enable later: verify the shapes from the official pages, implement the call behind the gateway budget (category "voice"), add a provider kind to
 * loadVoiceConfig, run the native-speaker test plan with a capped real-call allowance, and obtain the owner's written approval. Until then the voice routes keep
 * answering "not available" for hosted engines.
 */
export interface GeminiSpeechOptions {
  /** Accepted only so tests can prove the placeholder ignores them. Never used. */
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
}

export class GeminiSttPlaceholder implements SttProvider {
  readonly name = "gemini-stt-placeholder";
  constructor(_opts: GeminiSpeechOptions = {}) {}

  async transcribe(_a: { audio: Buffer; format: AudioFormat; lang: SttLang; signal: AbortSignal }): Promise<{ text: string; language?: string; durationMs?: number }> {
    throw new ProviderError("unsupported");
  }
}

export class GeminiTtsPlaceholder implements TtsProvider {
  readonly name = "gemini-tts-placeholder";
  constructor(_opts: GeminiSpeechOptions = {}) {}

  supports(_lang: TtsLang): boolean {
    return false;
  }

  async synthesize(_a: { text: string; lang: TtsLang; signal: AbortSignal }): Promise<{ audio: Buffer; contentType: string }> {
    throw new ProviderError("unsupported");
  }
}
