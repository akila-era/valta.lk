# VOLTA AI QA Control Center: inventory, gap report, design and stages

Status: plan plus stage 1 implemented locally (uncommitted). Nothing deployed, nothing pushed, no server touched, no purchase. Every statement of "works" below is about what was verified, and the evidence type is always named.

Written for: the project owner and the engineers extending the assistant.

## 1. Evidence types (used everywhere on screen and in this document)

| Label | Meaning |
|---|---|
| Unit tested | A pure function tested in isolation |
| Integration tested | Real components together, no real model, mock catalogue |
| Mock tested | A test double stands in for something real. **Never counted as a real integration** |
| Real browser tested | Real Chromium driven by Playwright against the real UI |
| Real model tested | The real Qwen model answered (only on the AI server) |
| Real voice tested | Real audio through a real speech service |
| Not tested | No evidence |

A capability's **status** is one of Working, Limited, Mock only, Not connected, Failed, Not tested. Rule: Working needs real evidence and no mock data in the path. A button or an endpoint that exists proves nothing.

## 2. Capability inventory (verified from the repository and the live site, 2026-11-13)

| Capability | What actually exists | Real status |
|---|---|---|
| General AI chat | Qwen3 1.7B (`qwen3:1.7b-q4_K_M`) on the AI server writes short, verified replies for messages with no tool. Not connected in local development (no Ollama) | **Limited** on the AI server; **Not connected** locally |
| Sinhala understanding | Deterministic router with hand-written rules. Measured on author-written sets only: about 60% to 78% on unseen messages. Not native-reviewed | **Limited** |
| Singlish understanding | Same router. About 71% (holdout) | **Limited** |
| English understanding | Same router plus Qwen fallback planner | **Limited** to **Working** depending on the live test run |
| Shopping intelligence, product search, comparison | Real code, real tools, 4-product comparison, verified cards. **Backed by a mock catalogue** (Nova X1, Orbit Pro) | **Mock only** (data), logic Integration tested |
| Website knowledge / RAG | Contract only (`knowledge/types.ts`). No index | **Not connected** |
| Browser automation | Typed tools, sessions, confirmation tokens, loop: **mock driver only**. No real Playwright driver exists | **Mock only** |
| Voice input (STT) and output (TTS) | UI exists. The voice routes do not exist. Both were switched off | **Not connected** |
| Image understanding, document analysis | Nothing built | **Not connected** |
| Conversation memory | Short-term: the Agent keeps the last shown products and the cart snapshot for follow-ups ("this one"). Nothing stored long-term | **Limited** |
| Streaming | The Agent has `/v1/chat/stream`; the website chat route does not use it yet | **Not connected** (website side) |
| Confirmation dialogs | Cart changes are proposals confirmed by the shopper (existing) | Integration tested |

## 3. Gap report against the brief

| Brief item | Gap | Stage |
|---|---|---|
| Capability status from real checks | No such area existed | **1 (done)** |
| `/admin/ai-qa` | Did not exist | **1 (done)** |
| Interactive console with the real assistant | Needs an admin-only path to the Agent | **1 (done)** |
| Detected intent, extracted constraints, selected tools, tool response, verification | **The Agent does not expose them.** Needs a dev-only trace endpoint on the Agent | 2 |
| Language QA with expected versus actual intent | Without the trace, only the **observed outcome** (cards, proposal, refusal, text) can be compared. Stage 1 does this and says so | 1 (outcome) and 2 (intent) |
| Real browser demonstration (Playwright) | No real driver exists. It must be built (a `BrowserDriver` for Chromium with request interception) and tested on local fixtures first | 3 |
| Browser activity panel (URL, title, elements, history, screenshot) | Needs the real driver | 3 |
| Real voice | Needs a speech service (a separate host) | 4 (blocked on approval) |
| Image and document QA | Needs vision and parsing services | 4 (blocked) |
| Streaming responses in the modal | Agent side exists; the website route and modal need wiring | 2 |
| File and image upload controls in the modal | UI only until services exist; must show "not available" | 2 |
| Advanced modal upgrades | Mostly present (history, language, chips, cards, comparison, clear, errors). Gaps: streaming, browser activity indicator, tool status | 2 |

## 4. What is reused (nothing duplicated)

`requireAdmin()` and the admin layout; `readAssistantConfig()` and `signAgentRequest()` for signed calls; the existing assistant response schema (`AgentChatResponse`, `toPublic`); the Agent's `/v1/health` and `/v1/metrics`; the dev mock Agent and the Playwright fake Agent for tests; the existing admin e2e sign-in; the mock browser benchmark results (labelled MOCK).

## 5. Design of the QA control center (stage 1 as built)

Route: `/admin/ai-qa`, inside the admin layout and behind `requireAdmin()`. **Development only:** it returns 404 unless `AI_QA_ENABLED=true` **and** `NODE_ENV` is not `production`, so a production build never serves it even if the variable leaks. API routes under `/api/admin/ai-qa/*` use the same gate and the same admin check, plus the existing same-origin and rate-limit guard.

Tabs:
- **Overview:** current model, Agent health, API reachability, session status; the capability grid with status chips, the evidence types, and the reason for each status.
- **Test console:** type a prompt, choose the language, converse (the session persists), see the reply, cards, suggestions, latency and the observed outcome. Intent and tool trace show "Not available: needs the Agent trace endpoint (stage 2)".
- **Language QA:** runs a sample set per language group through the real Agent API with pacing (the Agent rate-limits), shows expected outcome versus observed outcome, pass or fail, and latency.
- **Browser QA:** honest state (MOCK ONLY), the ten scenarios listed as Not tested, and the mock benchmark figures labelled MOCK. Real runs arrive in stage 3.
- **Voice QA:** microphone test in the browser (permission, level), and the real state of the speech routes (Not connected). No fake audio.
- **Results:** totals (passed, failed, skipped, mock only, real integration), average latency, failure details, and **JSON export**.

Safety: no secrets or environment values are ever returned; the Agent's error text is never forwarded; tests use sandbox data and the mock catalogue; no scenario can create an order or payment (cart changes are proposals and the QA console never confirms one).

## 6. Stages

| Stage | Content | Needs | State |
|---|---|---|---|
| 0 | This plan, inventory, gap report | none | done |
| 1 | QA centre skeleton with real status probes, console, outcome-based language QA, results export, Playwright UI tests, screenshots | none | **built (local)** |
| 2 | Agent dev-only trace endpoint (intent, entities, tools, verification); QA intent comparison; streaming in the modal; tool-status and browser-activity indicators; upload controls shown as unavailable | Agent change on its own branch | next |
| 3 | A real Playwright `BrowserDriver` with request interception and the exact-host allowlist; the ten scenarios on local fixtures; the visual browser panel with screenshots | Chromium locally | after 2 |
| 4 | Voice, image and document QA | Separate services (not approved) | blocked |

## 7. How to run it locally

The QA centre needs the admin sign-in, so run the web app with the e2e-style environment (the Playwright config starts a disposable database and a fake Agent). For the real Agent API over the mock catalogue, run the dev Agent (`apps/agent/tests/real/dev-mock-agent.ts`) and point `AI_AGENT_URL` at it, with `AI_QA_ENABLED=true`. The page then shows the Agent as healthy, the model as Not connected (no Ollama locally), and every mock-backed capability as Mock only. On the AI server the model status would be real, but the QA page is never enabled there.
