# Multimodal integration report (voice, browser, models)

Date: 2026-11-14. Written for: the project owner. Status words are used strictly: **Implemented**, **Tested locally**, **Tested with real browser**, **Tested with real audio**, **Mock-only**, **Requires infrastructure**, **Blocked by approval**, **Not production-ready**. Nothing here was committed, pushed or deployed, and no server was contacted.

## 1. Voice and the existing conversation pipeline

| Item | Status |
|---|---|
| Voice is a skin on chat: audio goes to the STT route, the transcript returns to the shopper to preview and edit, and only the confirmed text enters the assistant through the existing `/api/assistant/chat` route (same HMAC, verifier, memory, requirement profile, router and safety filters). No second conversation system exists. | Implemented by design; the route tests prove the transcript is never forwarded to chat by the server |
| Agent routes `/v1/voice/transcribe` and `/v1/voice/speak`, HMAC-signed like chat, mounted in `src/http/server.ts` only when an operator configures an engine; otherwise 404 | Implemented. Tested locally through the real `createAgentServer` (5 tests: absent without engine, 401 unsigned, 200 signed, replay refused, chat unaffected) with a **fake** engine. **Mock-only** engine in those tests |
| Website routes `/api/assistant/voice/transcribe` and `/speak` (off unless `AI_ASSISTANT_VOICE` lists `stt`/`tts`; 501 until the Agent has an engine) | Implemented; tested locally against a fake signed Agent |
| Existing mic button, recording indicator, editable preview, playback, error and retry states (already in the website) | Existed before this work; not re-tested here; not mobile-browser-verified by me |
| Multi-turn voice conversation ("Mata laptop ekak hoyaganna oni" then "Laksha dekak wage") | **Not demonstrated end to end with audio.** The text path for those turns is covered by the earlier reasoning tests (pending question, budget in Sinhala/Singlish); the audio leg needs a real Sinhala engine and recordings |

## 2. Browser tools and the Agent pipeline

| Item | Status |
|---|---|
| Real Playwright driver and network-level egress proxy | Implemented; **tested with a real browser** (38 passed, 1 skipped, two runs) on Windows with local fixture servers |
| Tool layer (`browser.open_page`, `get_page_state`, `find_elements`, `search`, `click`, `type`, `scroll`, back/forward, `take_screenshot`, `close_session`), ownership, confirmation store, policy | Existed before this work and is **mock-tested**; the real driver is now plugged behind the same interface in tests only |
| Tool names requested by the brief (`browser_open`, `browser_read_page`, `browser_extract_products`, `browser_click`, `browser_fill`, `browser_select`, `browser_scroll`, `browser_screenshot`, `browser_get_state`, `browser_close`) | The existing `browser.*` names are the equivalents (brief: "use the existing names if equivalent tools exist"). **Missing:** `browser_select` (needs an interface, mock, schema and service change) and `browser_extract_products` (no structured product extractor; the catalogue tools already return verified products and should stay the source of prices) |
| Wiring of browser tools into the router / model tool selection / `ChatPipeline` | **Not done.** No pipeline route calls the browser service. The driver is built only in tests. Reason: wiring decides what the assistant does with page text, which has to be designed with the safety review below, and benchmarks (frozen sets must stay untouched) have to be re-run for it |
| Confirmation endpoint (user reviews action, page, payload; bound to session, action and payload; expires) | The backend store and binding exist (mock-tested). **No HTTP endpoint and no UI exist.** Not a fake UI: nothing was built |
| Browser task UI, activity indicator, screenshot preview | **Not built** |
| Sensitive actions (login, account, address, cart changes, checkout, payment, coupons) | Classified by the existing policy: payment and purchase are refused outright, the rest require confirmation. No real driver run exercised them on the live shop |

## 3. Models

The three experimental models and the production Qwen3-1.7B were **not** evaluated for browser tool calling, voice or multimodal input in this work, for these reasons:

- A browser or voice benchmark on the shared AI server would starve live shoppers (that already happened once with the 9B run); it needs a separate machine or an approved maintenance window.
- Capability flags in `ollama show` are metadata, not evidence. Audio and image input through these models has **not** been tried with real inputs. The one real speech test that exists used a separate CPU speech engine (faster-whisper) on English only, outside the Agent.
- The only earlier model numbers remain those in `VOLTA_AI_MODEL_SELECTION_REPORT.md`; no model was approved and the registry is unchanged.

## 4. Page content is untrusted (prompt injection)

Existing, mock-tested defences: page text is stripped of invisible characters, capped, fenced as `PAGE_DATA` and checked by an injection filter; the model gets elements and facts, not free page text. Real-browser tests show the driver executes nothing from page text. **Not tested:** whether any model, given fenced page text, ignores an injection (needs a model-level evaluation with a fixed attack set, not run).

## 5. What the owner must decide before the next phase

Whether browser tools are to be offered to shoppers at all in the first release (the catalogue tools already answer product questions with verified data and no browser), and if so which of the read-only actions; the speech engine and its licence; recording of native Sinhala speech; where the browser and speech workers run (the 12 GB shared AI server is not a safe place, see the resource report).
