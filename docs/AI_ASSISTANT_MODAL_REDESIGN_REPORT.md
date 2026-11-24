# VOLTA AI modal redesign and voice experience: implementation report

Status: implemented in the working tree of branch `feature/ai-widget`. **Nothing is committed, pushed or deployed** (as instructed). Voice is **not active** anywhere: the voice routes it needs do not exist yet, so the modal ships with voice switched off and showing "not available yet".

## 1. What was inspected first

The existing assistant is a single modal, `apps/web/src/components/assistant/assistant-panel.tsx`, built in the earlier milestones (launcher bottom left, cards, confirm-gated cart, tap-to-send chips, `volta_ai_preview` gate, chat only through `POST /api/assistant/chat`, which signs requests to the Agent with HMAC and validates every answer). I upgraded **that** component. There is one conversation state (in `assistant-panel.tsx`), one chat route and one Agent pipeline; no second assistant was created.

**Finding about the voice APIs:** the brief refers to "the existing voice transcription API" and "the existing TTS API". **They do not exist.** No STT or TTS was ever implemented (earlier milestones explicitly excluded voice), and the website has no `/api/assistant/voice/*` route. Following the brief's rule, the UI calls two **named routes of this website** (`/api/assistant/voice/transcribe`, `/api/assistant/voice/speak`) and, until they exist and are enabled, shows a clear "not available yet" state. Nothing fakes a result in product code.

## 2. What the modal now does (requirement by requirement)

| # | Requirement | Result |
|---|---|---|
| 1 | Modern premium modal | White surface, rounded corners, blue `#2563EB` actions, gradient brand mark, soft shadows, light motion |
| 2 | Responsive | Desktop: 26 rem card, bottom left, up to 42 rem tall. Phone: full-screen sheet with safe-area padding (tested: it fills the viewport) |
| 3 | VOLTA AI branding and welcome | Header "VOLTA AI" with brand mark, tagline and a Beta label ("demo data" while on mock data); welcome title, text, demo note and starter chips |
| 4 | Conversation history | User and assistant bubbles with an assistant avatar; in memory only (nothing stored) |
| 5 | Product cards and comparison | Unchanged components, shown inside the history |
| 6 | Typing and processing indicators | Bouncing dots plus a status line that gets more honest with time ("is thinking", after 6 s "Still working on it", after 20 s "Taking longer than usual") |
| 7 | Microphone button | Next to the text box; when voice input is off it stays visible, dimmed, and says "Voice input is not available yet" (no permission prompt, no recording) |
| 8 | Recording state with animated waveform | Red recording dot, `m:ss` timer, 24-bar waveform driven by the real microphone level (static with reduced-motion) |
| 9 | Stop and cancel | Stop (sends the audio for transcription) and Cancel (discards it; no request); Escape cancels a recording before it closes the modal |
| 10 | Transcription preview with editable text | Recognised text in an editable box with Send, Discard and Record again; Send is disabled when empty. Nothing reaches the assistant until the shopper confirms |
| 11 | Voice response playback | After a reply, when "voice replies" is on, the reply is read aloud through the speech route; otherwise a Listen button loads it on demand |
| 12 | Play, pause, replay, mute | Per-reply player with progress; each control really drives the audio element |
| 13 | Text input and send | Unchanged behaviour (Enter sends, Shift+Enter newline, 800 characters) |
| 14 | Sinhala / English selection | Auto, English, සිංහල choice. It is sent to the assistant (`locale`) and switches the words on screen; Sinhala labels are provisional and need native review |
| 15 | Clear conversation with confirmation | Trash button; an in-modal confirmation ("Your cart is not affected"); Keep chatting or Clear |
| 16 | Loading, empty, error and retry | Typing indicator, welcome (empty) state, error bubbles with Try again, voice errors with plain advice |

## 3. Voice flow (as built)

1. The shopper presses the microphone. **Only then** does the browser ask for the microphone (`getUserMedia`); every track is stopped on stop, cancel, error and unmount.
2. Recording shows the timer and waveform (max 60 s, minimum 0.6 s).
3. Stop sends the audio, as it is, to `POST /api/assistant/voice/transcribe` (same origin, no extra credentials). The reply `{ text }` is bounded (800 characters) and shown as plain text.
4. The shopper checks and edits the text, then Sends. The text goes through the **existing chat route**: HMAC signing, the Agent's safety filter, tools, the response verifier and `needsNativeReview` are all unchanged and cannot be bypassed by voice.
5. Spoken replies: `POST /api/assistant/voice/speak` with `{ text, lang }`; the answer must be real audio (checked by content type and size). It plays in the page; the audio is held in memory only and released afterwards.

Errors have specific wording: unsupported browser, microphone blocked, no microphone, too short, not available yet (route missing, 404/501), too long, rate limited, failed.

## 4. Security and policy points

- **Microphone permission policy.** The site sends `Permissions-Policy: microphone=()` on every page, which makes the browser refuse any microphone request. The first browser test failed exactly because of that. `next.config.ts` now allows `microphone=(self)` **only when** `AI_ASSISTANT_VOICE` contains `stt`; otherwise the header is unchanged (microphone blocked). The header is fixed at build time, so the variable must also be present at build time (Docker build argument). Camera and geolocation stay blocked.
- Voice input and output are separate, off-by-default switches (`AI_ASSISTANT_VOICE=stt,tts`), documented in `.env.example`.
- No audio or transcript is stored or logged by this code. Audio is size-checked (5 MB) in the browser before sending.
- Voice cannot bypass the assistant's controls: it only fills the text box.
- Not done, by instruction: no voice routes were created, nothing was deployed, committed or pushed.

## 5. Tests

| Suite | Result |
|---|---|
| Web unit and integration (vitest) | 24 files, **344 passed** (new: `assistant-voice.test.ts` for the recording state machine, the voice client and capability parsing; `assistant-modal-ui.test.ts` for every voice and modal state rendered to markup) |
| Typecheck, ESLint (changed files) | 0 errors, clean |
| New browser spec `tests/e2e/assistant-voice.spec.ts` (real Chromium with a fake microphone) | **18 passed** (16 desktop, 2 phone) |
| Existing assistant widget spec | 9 passed |
| Full Playwright suite (storefront, admin, WhatsApp chat, widget, voice), real Chromium, desktop and phone projects | **159 passed, 0 failed, 0 skipped** (13.4 min) |

The browser spec covers: branding and welcome; language choice (Sinhala labels, `locale` sent); typing indicator; clear conversation (Keep / Clear / cart untouched); recording with timer and 24-bar waveform; stop then editable transcription then Send (the assistant receives only the **edited** text, and nothing before confirmation); Discard; Cancel (no request); Escape; blocked microphone; too short (no request); route not found shows "not available yet" and typing still works; spoken replies with play, pause, replay and mute checked against the real audio element; Listen on demand with nothing fetched while voice replies are off; a missing speech route shows a short note without breaking the reply; text-only chat unchanged; phone layout fills the screen.

**What these tests do NOT prove (important).** The two voice routes do not exist, so in these tests Playwright route interception is a clearly labelled **test double** for them, and Chromium supplies a fake microphone. They prove the user interface and its error handling. They do **not** prove that speech recognition or speech synthesis works, and **voice support must not be described as active** until real routes exist and pass their own end-to-end tests.

## 6. Screenshot evidence

`docs/screenshots/assistant-voice/` (desktop 1280x800 and phone, Pixel 7): welcome, Sinhala labels, comparison, products with the spoken-reply player, recording, transcribing, transcription preview, clear confirmation. These show demo data from the fake Agent used by the tests, not store data.

## 7. Changed files (exact)

Modified:
- `apps/web/src/components/assistant/assistant-panel.tsx` (the modal: layout, state, voice wiring, language, clear)
- `apps/web/src/components/assistant/labels.ts` (about 55 new English and provisional Sinhala labels)
- `apps/web/src/components/layout/store-shell.tsx` (passes the voice capabilities)
- `apps/web/next.config.ts` (microphone permission only when voice input is enabled)
- `apps/web/.env.example` (documents `AI_ASSISTANT_VOICE`)
- `apps/web/playwright.config.ts` (voice flag for the browser tests)
- `apps/web/tests/e2e/assistant-widget.spec.ts`, `apps/web/tests/unit/assistant-cards.test.ts` (updated for the new starters and for brand and language names that read the same in every language)

New:
- `apps/web/src/components/assistant/panel-parts.tsx` (header, language choice, welcome, typing indicator, clear confirmation, spoken reply)
- `apps/web/src/components/assistant/voice/recorder-state.ts` (pure state machine)
- `apps/web/src/components/assistant/voice/use-voice-recorder.ts` (microphone, waveform levels, timer, stop, cancel)
- `apps/web/src/components/assistant/voice/use-audio-player.ts` (playback hook)
- `apps/web/src/components/assistant/voice/voice-ui.tsx` (waveform, composer states, microphone button, player view)
- `apps/web/src/lib/assistant/voice-client.ts` (browser client for the two routes)
- `apps/web/src/lib/assistant/voice-config.ts` (server: which voice features are enabled)
- `apps/web/tests/unit/assistant-voice.test.ts`, `apps/web/tests/unit/assistant-modal-ui.test.ts`, `apps/web/tests/e2e/assistant-voice.spec.ts`
- `docs/screenshots/assistant-voice/*.png` (16 images), `docs/AI_ASSISTANT_MODAL_REDESIGN_REPORT.md`

## 8. Known limitations and what is needed before voice can be switched on

1. **The voice routes do not exist.** To enable voice someone must build `/api/assistant/voice/transcribe` (speech to text) and `/api/assistant/voice/speak` (text to speech), behind the same controls as the chat route (same-origin check, rate limits, signed identity, size limits, no storage of audio or text), and run them on suitable engines. This was explicitly out of earlier scope and needs your decision and approval: the AI server has 4 GB RAM and 2 CPUs and already runs Qwen, so speech models would compete with it for memory (earlier milestones forbade STT/TTS there).
2. **Sinhala speech** (recognition and synthesis) is a separate, harder problem; Sinhala labels and texts here are provisional and need native review.
3. The permission-policy header is build-time (section 4): enabling voice on the live site means rebuilding with the variable set.
4. The conversation is not persisted by design; "clear" only empties the window.
5. Spoken replies read the verified reply text only (not card contents).
6. Browser support: needs `getUserMedia` and `MediaRecorder` and HTTPS; otherwise the modal says the browser cannot record and offers typing.
7. The existing production preview on the live site still runs the previous panel; this redesign is not deployed.
