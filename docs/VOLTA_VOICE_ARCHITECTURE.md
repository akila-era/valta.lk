# VOLTA AI voice architecture

Date: 2026-11-14. Written for: the project owner and the engineers who will wire and operate it. Status of everything below is in section 10 and in `VOLTA_VOICE_IMPLEMENTATION_REPORT.md`. **Nothing here was deployed, and no server was contacted.**

## 1. Principles

1. **One conversation system.** Voice is only an input and output *skin* on the existing text assistant. Speech becomes text; the text goes **back to the shopper** (preview, edit, confirm) and enters the assistant **only through the normal `POST /api/assistant/chat` route**, with the same HMAC signing, router, reasoning layer, verifier and safety filter as typed text. There is no voice-specific intent, memory, tool or conversation code path. Spoken replies are the verified text reply read aloud, never a different answer.
2. **Off by default, nothing fakes a result.** With no speech engine configured every voice route answers "not available" and the website keeps showing the existing "voice not available yet" notice. The microphone is never requested unless voice is enabled.
3. **Audio is never kept.** Audio lives in memory for the duration of one request, is overwritten after use, is never written to disk or logs, and transcripts are not logged. Logs hold route, status, byte count, latency class and error code only.
4. **Engines are replaceable and unproven for Sinhala.** The Agent talks to a *provider interface*; the engine is a loopback HTTP service chosen by configuration. No model is hard-wired and none is approved by this work. Sinhala quality is **unevaluated** (see the two evaluation documents).

## 2. Data flow

```
Browser (existing UI: components/assistant/voice/*, lib/assistant/voice-client.ts)
  | 1. MediaRecorder audio (webm/opus, ogg/opus, mp4/aac) -> POST /api/assistant/voice/transcribe?lang=auto|en|si   (raw audio body)
  v
Website route (this repo, apps/web)         same-origin (CSRF), per-client rate limit, assistant on + AI_ASSISTANT_VOICE has "stt"
  |  streams the body with a hard 5,000,000-byte cap (aborts early), cheap magic-byte pre-check
  |  signs the request as the customer or guest (same key and canonical string as /v1/chat; body = raw bytes)
  v  POST /v1/voice/transcribe  (loopback tunnel, as for chat)
Agent route                                 HMAC + replay cache + auth-failure slowdown (existing), then:
  |  strict content sniffing (real structure, not the header), duration cap, per-identity/IP voice limits,
  |  one audio worker with a short bounded queue (429/503 + Retry-After)
  v
SttProvider  (none | http loopback, OpenAI-style /v1/audio/transcriptions)       -> text
  ^ transcript sanitised (control/bidi/zero-width stripped, 800 chars) and returned as {text, language}
Website -> browser: text goes into the text box. The shopper edits and sends it as a normal chat message.
```

Speaking a reply: the browser sends `{text, lang}` to `/api/assistant/voice/speak`; the website signs it to `/v1/voice/speak`; the Agent validates the text (1,600 chars max), asks the `TtsProvider`, **validates the returned audio by sniffing** (wav or mp3 only, size and duration caps) and returns it. The website re-checks the type and size and returns it with `Cache-Control: no-store`.

## 3. Agent API (additive; contract 1.0, 1.1 and 1.2 unchanged)

| Route | Request | Success | Failure statuses |
|---|---|---|---|
| `POST /v1/voice/transcribe` | raw audio; optional header `x-volta-voice-lang: auto|en|si` (validated, default auto) | `200 {voiceVersion:"1", text, language: "si"|"en"|"mixed"|"unknown", durationMs, requestId}` | 401 (signature), 413, 415 (not a supported audio file), 422 (empty, truncated, malformed, too long, no speech), 429, 503, 504, 501 (no engine) |
| `POST /v1/voice/speak` | JSON `{text, lang:"en"|"si"}` | `200` audio (`audio/wav` or `audio/mpeg`) | 401, 413, 415, 422, 429, 501 (no engine or no voice for the language), 502, 503, 504 |

The routes are signed exactly like chat (key id, timestamp, nonce, identity, client IP, SHA-256 of the **raw bytes**). The voice routes are versioned separately (`voiceVersion`), so the chat contract versions and the existing website/Agent compatibility rules (Agent first on deploy, website first on rollback) are unaffected. A website without the voice routes keeps working against an Agent that has them, and the reverse.

## 4. Audio acceptance (implemented in `apps/agent/src/voice/audio.ts`)

Accepted containers, decided **only by parsing the bytes** (the browser's `Content-Type` is ignored):

| Format | What is verified | Duration |
|---|---|---|
| WAV | RIFF/WAVE, `fmt ` PCM or float, 1 to 2 channels, 8 to 48 kHz, `data` chunk inside the buffer, exact RIFF size (no trailing bytes) | exact, from the header |
| Ogg/Opus | every page: `OggS`, version 0, bounded segments, **CRC-32 of every page**, first packet `OpusHead`, pages tile the buffer exactly | from the last granule position (a claim by the sender: **not exact**) |
| WebM/Opus | EBML header with DocType `webm`, Segment, Tracks with a single audio track `A_OPUS`, at least one Cluster with a block, elements tile the buffer exactly, bounded element count | estimated from the last block timestamp (live recordings carry no duration) |
| MP4/M4A | `ftyp` with an audio brand, `moov` with a `soun` track and an `mp4a` or `Opus` sample entry, `mdat` or `moof`, boxes tile the buffer exactly | from `mdhd`; for fragmented files from `trun` sums where present, otherwise bounded by a size heuristic |

Refused: empty, shorter than a header, wrong or missing magic, video tracks, unsupported codecs, truncated structures, trailing bytes after the structure (polyglot files such as audio+zip), implausible values, and anything over the caps. Caps: **5,000,000 bytes** (matches the client, enforced while streaming, so an oversized upload is cut off early); **30 seconds** by default (`AGENT_VOICE_MAX_SECONDS`, at most 60). **Limitation:** when a compressed file's duration cannot be parsed (some fragmented mp4), the Agent falls back to a size ceiling of 720,000 bytes (30 s at 192 kb/s); a file that is small but compresses unusually could still be longer than 30 s, so the engine's own timeout is the final bound.

Not done (stated, not hidden): no decoding of the audio in the Agent (so no "is it really speech" test except a peak check on PCM WAV); malicious *codec-level* payloads are the engine's problem, so the engine runs as a separate unprivileged loopback service with its own memory limit (section 8).

## 5. Resource and abuse controls

- **One audio worker**, short bounded queue (default depth 3), per-job deadline (the job is raced against it, so an engine that ignores the abort signal cannot hold the slot: 504, and the slot returns). A full queue answers `503 QUEUE_FULL` with `Retry-After`; the queue never grows without bound and never holds more than the queued request bodies (each already capped).
- **Per-identity** (customer id) and **per-IP** limits for each route (defaults: 10 transcriptions per minute and 60 per hour per caller; 20 speech requests per minute), using the existing `MemoryRateStore`; a broken or full store refuses the request (fail closed), exactly as chat does.
- The website adds its own limit per client (10 per minute) and a body cap before anything reaches the Agent.
- STT and TTS are **never run concurrently with a large model switch** by design: they share one slot, and the operations documents say the speech service must not be started on the live server beside the 4B/9B experiments (see `VOLTA_VOICE_BROWSER_RESOURCE_REPORT.md`, written by the orchestrator).

## 6. Provider interfaces

```ts
interface SttProvider { readonly name: string; transcribe(a: {audio: Buffer; format: "wav"|"webm"|"ogg"|"mp4"; lang: "auto"|"en"|"si"; signal: AbortSignal}): Promise<{ text: string; language?: string }>; }
interface TtsProvider { readonly name: string; supports(lang: "en"|"si"): boolean; synthesize(a: {text: string; lang: "en"|"si"; signal: AbortSignal}): Promise<{ audio: Buffer; contentType: string }>; }
```

- `none` (default): routes answer 501.
- `http`: a loopback-only OpenAI-compatible server. STT: `POST {AGENT_STT_URL}/v1/audio/transcriptions` (multipart: file, optional model from `AGENT_STT_MODEL`, optional language, `response_format=verbose_json`, temperature 0). TTS: `POST {AGENT_TTS_URL}/v1/audio/speech` (JSON: model/voice from configuration, input, `response_format=wav`). URLs must be loopback http (validated like `OLLAMA_URL`), with no credentials; provider answers are size-capped, content-validated, and **treated as data, never as instructions**.

Configuration names (none contains a secret): `AGENT_STT_PROVIDER`, `AGENT_STT_URL`, `AGENT_STT_MODEL`, `AGENT_STT_TIMEOUT_MS`, `AGENT_TTS_PROVIDER`, `AGENT_TTS_URL`, `AGENT_TTS_MODEL`, `AGENT_TTS_VOICE_EN`, `AGENT_TTS_VOICE_SI`, `AGENT_TTS_TIMEOUT_MS`, `AGENT_VOICE_MAX_SECONDS`, `AGENT_VOICE_CONCURRENCY`, `AGENT_VOICE_QUEUE_DEPTH`. Website: the existing `AI_ASSISTANT_VOICE` (`stt`, `tts`, `stt,tts`).

## 7. Languages and the Sinhala caveat

The shopper may pick "auto". Language detection is whatever the engine reports, plus a script check on the text (Sinhala block U+0D80 to U+0DFF versus Latin). Singlish (Sinhala in Latin letters) is *Latin script that looks like English*: an English-oriented model will often mis-hear it, and detection by script cannot tell it from English. **No quality claim exists for Sinhala or Singlish speech recognition or speech output.** Both are blocked on native-speaker recordings (`VOLTA_SINHALA_AUDIO_EVALUATION.md` gives the protocol). Until then the right customer experience is: transcription is always shown for editing; the Sinhala voice button can be offered as "beta" or hidden by configuration.

## 8. Placement and sizing (design, not executed)

Speech engines run as their own systemd services on loopback (like Ollama), under an unprivileged user with `MemoryMax`, **not inside the Agent process**. CPU-only speech recognition on the 6-vCPU shared server competes with the language model; measured numbers and the recommendation to use separate infrastructure for anything beyond a small model are in the evaluation documents and the resource report.

## 9. Spoken replies in the browser (design for the frontend step)

If the Agent has no voice for a language, the website answers 501 and the client should fall back to the browser's own `speechSynthesis`: pick a voice whose `lang` starts with `si` if one exists, otherwise show the text without audio. Device Sinhala voices vary by phone and OS (many Android devices have one through Google's engine; desktop browsers frequently have none), so the fallback is a convenience, not a promise. This is described here only; the panel components were not edited by this workstream.

## 10. Wiring still needed (orchestrator)

The Agent's `server.ts` currently forces `application/json` for every POST and caps bodies at 20 kB; voice needs a per-route content type and cap. The exact lines are in `VOLTA_VOICE_IMPLEMENTATION_REPORT.md` (section "Wiring").

## 11. Changes after the independent review (2026-11-14)

- **Durations:** only WAV is exact. Compressed formats are bounded by bytes: at most 80 kB/s of the declared duration plus 32 kB, and a hard whole-file ceiling of the cap times 80 kB/s plus 32 kB. The speech engine's reported length is enforced against the cap too.
- **Before the signature:** the voice routes check the headers first (a request that cannot authenticate never has its body read), allow only `concurrency + queue depth + 2` bodies to be read at once (503 beyond that), and cut slow uploads (10 s overall, 3 s idle, 408). The slot is released on every path. The same class on `/v1/chat` belongs to `server.ts`.
- **Metrics:** `src/voice/metrics.ts` defines counters and latencies (codes and durations only) for the orchestrator to plug into `Metrics`.
- Details and evidence: `VOLTA_VOICE_IMPLEMENTATION_REPORT.md`, section 7.
