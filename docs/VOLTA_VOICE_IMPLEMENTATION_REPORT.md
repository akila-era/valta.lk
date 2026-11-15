# Voice implementation report

Date: 2026-11-14. Written for: the project owner and the orchestrating engineer. Companion documents: `VOLTA_VOICE_ARCHITECTURE.md` (design), `VOLTA_SINHALA_AUDIO_EVALUATION.md`, `VOLTA_TTS_EVALUATION.md`. **Nothing was committed, pushed, deployed or run on any server.** The Agent's `server.ts` was **not** edited (orchestrator-owned); the wiring is in section 6.

## 1. Status at a glance

| Capability | Implemented | Tested locally | Tested with real audio | Mock-only | Needs infrastructure | Blocked | Production-ready |
|---|---|---|---|---|---|---|---|
| Audio validation (wav, ogg/opus, webm/opus, mp4/m4a, caps, polyglot, truncation) | yes | yes (unit + 1,200 fuzz inputs) | WAV structure check on 10 real synthetic-English files; **no real webm/ogg/mp4 recorded by a browser yet** | no | no | no | **no** (browser-produced files untested) |
| Agent voice routes (`/v1/voice/*`) with HMAC, replay, limits, queue | yes (handlers + `serveVoice`) | yes, over real HTTP with a harness server | no | engine is a fake | wiring into `server.ts` | wiring approval | no |
| Website routes (`/api/assistant/voice/*`) | yes | yes (route tests against a fake signed Agent) | no | Agent is a fake | none | none | no |
| STT engine integration (OpenAI-compatible loopback) | yes (provider) | fake engine only | real engine tried **outside** the Agent (section 3) | no | engine service must be installed on a server | server approval | no |
| TTS engine integration | yes (provider) | fake engine only | **no** | yes | engine + voices | none exist for Sinhala | no |
| English speech recognition quality | n/a | n/a | measured on **synthetic** English, 10 clips, two Windows voices (clean) | n/a | n/a | n/a | not evidence of real-world quality |
| Sinhala / Singlish speech recognition quality | n/a | n/a | **none** | n/a | n/a | **native recordings** | **unevaluated** |
| Spoken replies (any language) | provider only | fakes | none | yes | engine | Sinhala voice not identified | no |
| Frontend (mic UI, player) | **already existed** (not touched) | existing tests | no | n/a | n/a | frontend step | not part of this work |

## 2. Files

Agent (`apps/agent`): `src/voice/audio.ts` (container parsers and checks), `text.ts` (cleaning, script detection), `providers.ts` (interfaces, `none`, HTTP providers, loopback validation), `config.ts` (`loadVoiceConfig`), `queue.ts`, `service.ts` (pure handlers, limiter, `registerVoiceRoutes`), `http.ts` (`serveVoice`), `index.ts`. Tests: `tests/unit/voice-audio.test.ts` (20), `voice-service.test.ts` (26), `voice-fixtures.ts` (builders), `tests/integration/voice-http.test.ts` (14).
Website (`apps/web`): `src/app/api/assistant/voice/transcribe/route.ts`, `speak/route.ts`, `src/lib/assistant/voice-agent.ts`; comment-only updates in `voice-config.ts` and `voice-client.ts` (they said the routes did not exist). Tests: `tests/integration/assistant-voice-route.test.ts`, `tests/unit/assistant-voice-agent.test.ts`.
Docs: the four named in the brief for this workstream.

## 2a. Test results (executed 2026-11-14; see section 7 for the review follow-up counts)

Agent full suite: **1,359 passed, 3 skipped** (66 files; was 1,299 before this work: +60 voice tests = 20 audio, 26 service, 14 HTTP). Website full suite: **408 passed** (was 387: +21 voice route and helper tests). TypeScript clean in the website; in the Agent clean for the voice files. No existing test changed; no frozen benchmark file touched.

## 3. Real-audio checks that were actually run

See `VOLTA_SINHALA_AUDIO_EVALUATION.md`, section 2, for the English speech-recognition smoke test (engine, model sizes, latency, peak memory, error rate) and its limits: **synthetic English, 10 short clips, a desktop machine**, so it shows that the pipeline and a CPU engine work, nothing about Sinhala and little about real shoppers.

## 4. Security properties (all tested)

- Format decided from bytes only; header ignored. Exact tiling of every container (no appended data), Ogg page checksums, bounded parsing steps and sizes, truncated and mutated files refused, video tracks and unsupported codecs refused, PCM silence refused before the engine is asked (an engine would invent words).
- 5,000,000-byte cap enforced while streaming at both the website and the Agent (declared length checked first; the rest of an oversized upload is discarded, never buffered); 30 s default duration cap. **Only WAV is `exact`** (its length is computed from the data size, which the container tiles exactly). For ogg, webm and mp4 the duration is a claim written by the sender, so it is never labelled exact; it is bounded two ways that do not trust it: the bytes must be believable for the declared duration (at most 80 kB/s plus 32 kB of container overhead) and the whole file must fit a hard ceiling tied to the cap (30 s allows about 2.4 MB). A documented size ceiling still applies when a duration cannot be read.
- Same HMAC scheme as chat over the raw bytes; replay refused; sockets that keep failing authentication are slowed down; identity and client IP only from the signature.
- Per-IP and per-customer limits (10 transcriptions a minute, 60 an hour; 20 speech requests a minute), fail closed; one audio worker with a bounded queue (503 with `Retry-After`); website limit of 10 and 30 a minute per client in front.
- The request `Buffer` is overwritten with zeros after use (**only that original buffer: copies made by `Buffer.concat`, the website's `Uint8Array`, and the `FormData`/`Blob` sent to the engine wait for garbage collection, so do not rely on this for privacy**); audit records hold codes and counts only (tested: transcript text never appears); responses `no-store`; engine output cleaned (control, bidi, zero-width characters), capped, treated as data; engine URLs loopback only, no redirects followed, fixed upload file names; TTS output re-validated by content before it is sent to a browser.
- Voice is a skin on chat: no voice-specific conversation, memory or tool path exists; the transcript goes back to the shopper to edit and is sent only through `/api/assistant/chat`.

## 5. Known limits and open items

- Browser-recorded **webm/ogg/mp4 from real phones and desktops were not available**; the parsers were built from the format specifications and synthetic builders, and the first real recordings will probably expose gaps (for example Chrome's mp4 variants). Collect them in the first staging test.
- Compressed-format durations are claims, never exact; the bounds in section 7 limit what a lying header can make the engine decode, but no decoding is done here, so the engine CPU time for a hostile file is **unmeasured** (no engine was run on one). The engine's own reported length (verbose_json `duration`) is also enforced when it is given.
- No decoding means no voice-activity check beyond PCM silence; "background noise only" recordings reach the engine and engines tend to hallucinate short phrases on noise. The editable preview is the safeguard.
- `AbortSignal.timeout` bounds each engine call (25 s) and the queue now also races each job against that deadline plus 1 s (VO-04): a provider that ignores the signal gets a 504 and the worker slot comes back, but its abandoned call may keep running inside the engine process, which must still carry its own memory and CPU limits.
- Sinhala and Singlish quality: unknown (see evaluation).
- No rate-limit state survives a restart (in memory), as with chat.

## 6. Wiring for `apps/agent/src/http/server.ts` (orchestrator)

The voice routes bypass the chat pipeline's "JSON only, 20 kB" rules, so they are served by `serveVoice` before the route table. Add:

```ts
import { isVoiceRoute, serveVoice, VOICE_ROUTES, type VoiceService } from "../voice";   // 1. import

voice?: VoiceService;                                                                    // 2. in ServerDeps

const ROUTES: Record<string, string> = { /* existing */, ...Object.fromEntries(Object.entries(VOICE_ROUTES).map(([k, v]) => [k, v.method])) };  // 3. so the log names the route

// 4. inside the request handler's async block, immediately BEFORE `const expected = ROUTES[route];`
if (deps.voice && isVoiceRoute(route)) {
  const v = await serveVoice({ req, res, route, requestId, voice: deps.voice, keys: config.hmacKeys, replay, guard, now });
  status = v.status; errorCode = v.errorCode; authReason = v.authReason; identityKind = v.identityKind;
  return;
}
```
(`return` inside the existing `try` still runs the `finally` that decrements `inFlight` and logs.) Then in the entry point (`tests/real/preview-agent.ts`, same lines for any future `src/main.ts`):

```ts
import { loadVoiceConfig, VoiceService } from "../../src/voice";
const voiceCfg = loadVoiceConfig(process.env);            // throws VoiceConfigError naming the variable (never a value) on a bad setting
const voice = voiceCfg.stt.name !== "none" || voiceCfg.tts.name !== "none" ? new VoiceService(voiceCfg) : undefined;   // pass `voice` to createAgentServer
```
Without `voice`, the routes do not exist (404 as any unknown path), so deploying this code changes nothing until an operator configures an engine. `registerVoiceRoutes(config)` is also exported if a single call is preferred. Website: nothing to wire; `AI_ASSISTANT_VOICE=stt` or `stt,tts` switches the routes on, and they answer 501 until the Agent has an engine.

## 7. Review follow-up (independent review findings VO-01 to VO-06), executed 2026-11-14

Source: `docs/VOLTA_VOICE_BROWSER_INDEPENDENT_REVIEW.md`. All local; nothing was deployed, committed or contacted.

| Finding | Status | What changed | Evidence |
|---|---|---|---|
| VO-01 duration cap bypass (Medium) | **Fixed, tested locally** | Compressed files must fit `80 kB/s x declared duration + 32 kB`, and a hard ceiling `cap x 80 kB/s + 32 kB` (about 2.4 MB at 30 s) that no header moves; WebM takes the larger of the Duration element and the last block time; only WAV is `exact`; the engine's reported `duration` is also enforced against the cap (result dropped with 422 `AUDIO_TOO_LONG`). | The reviewer's three crafted 4.9 MB files are now refused (their `it.fails` tests became normal tests); new tests in `voice-metrics.test.ts` |
| VO-02 bodies read before authentication (Medium) | **Fixed for the voice routes, tested locally; the same class on `/v1/chat` remains (orchestrator, `server.ts`)** | Headers are checked first (known key id, fresh timestamp, formats): a request that fails never has its body read (401, connection dropped). Only `concurrency + queueDepth + 2` bodies may be read at once (the rest get 503 immediately); a whole-body deadline (10 s) and an idle timeout (3 s) answer 408; the slot is released on every path. | The review test (four stalled unauthenticated uploads no longer make chat answer 503) now passes; `voice-preauth.test.ts`, 5 tests over real sockets (early 401, a budget of 3 with 7 of 10 refused at once, idle 408, overall-deadline 408, release on abort / 413 / success, a valid upload still works), passed 3 of 3 runs |
| VO-03 invisible characters in transcripts (Low) | **Fixed** | `cleanText` also strips Unicode TAG characters, U+061C, U+180E and variation selectors. The browser tool's `INVISIBLE` list in `policy.ts` (not a voice file) has the same gap: for the browser owner. | Review test now passes |
| VO-04 provider that ignores the abort signal (Low) | **Fixed** | `VoiceQueue.run(job, deadlineMs)` races the job against the deadline: 504 `TIMEOUT`, slot released, a late rejection is swallowed. | Review test now passes; metrics test |
| VO-05 route probing reveals voice configuration (Info) | **Accepted, not changed** | An unauthenticated `GET` gives 405 when an engine is configured and 404 when not (same pattern as the other routes). The Agent is loopback-only behind the tunnel. | recorded in the review |
| VO-06 "audio zeroed" overstated (Info) | **Documentation corrected** | See section 4: only the original buffer is zeroed. | this document |

**Not mine, still open for the orchestrator:** `server.ts` increments its in-flight counter before `serveVoice` runs, so well-formed stalled uploads still count against `AGENT_MAX_IN_FLIGHT` (default 16) for up to the 3 s idle timeout. At the default the voice budget (6) cannot starve chat; with a very small `AGENT_MAX_IN_FLIGHT` it can. The same pre-authentication read exists on `/v1/chat`. WB-01 (client-address trust) is covered by the production proxy audit.

**New: voice metrics hooks** (`src/voice/metrics.ts`, pure, not yet plugged into `Metrics`): `VoiceMetrics` with `request(route, status, errorCode)`, `engineLatency(stt|tts, ms)`, `queueWait(ms)` and `rejected(reason)`; `InMemoryVoiceMetrics` keeps the last 500 samples per series and at most 100 keys. Only codes and durations are recorded (a test proves that a transcript marker, an address and an identity never appear). Pass `{ metrics }` in `VoiceServiceOptions`.

**Counts (executed 2026-11-14 after the changes):** Agent `npm test`: **74 files passed, 3 skipped; 1,550 tests passed, 7 expected failures (open defects outside voice), 3 skipped**. Agent `tsc --noEmit` clean. Voice files: the six existing ones plus `voice-preauth.test.ts` (5) and `voice-metrics.test.ts` (10), all green. Website (`apps/web`): **31 files, 444 tests passed**, `tsc --noEmit` clean, voice route tests 21 passed.

**Still true:** no real browser-recorded webm/ogg/mp4 file has been parsed; no speech engine was run on hostile input; Sinhala and Singlish recognition and speech output remain **unevaluated and blocked on native-speaker recordings** (see `VOLTA_SINHALA_AUDIO_EVALUATION.md`).
