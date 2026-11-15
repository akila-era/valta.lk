# Frontend integration report (wave 2: Frontend Experience)

Date: 2026-11-14. Written for: the project owner and the engineer who wires the website. Scope: the website worktree `.worktrees/ai-widget/apps/web` (branch `feature/ai-widget`). **Nothing was committed, pushed, merged or deployed, no server was contacted, and the live website is unchanged**: the website still speaks contract **1.2** (`AGENT_CONTRACT_VERSION` is deliberately untouched) and the new browser-task code is behind a flag that is OFF by default.

Status words: **Implemented**, **Integrated** (reachable in the running site), **Tested locally**, **Tested in isolated staging** (none), **Production verified** (none), **Blocked**, **Pending approval**. Test kinds are kept apart: *unit* and *route* tests are mock-based; *real-Agent Playwright* runs the real Agent code on an invented fixture catalogue in a real browser; *markup-injection Playwright* measures real CSS in a real browser but does not run the flow.

## 1. Summary

| Area | Status |
|---|---|
| Contract 1.3 mirror in the website (strict schemas for the `browser` panel, the proposal, the decision request and answer, the 1.3 chat response, `context.path`) | **Implemented. Tested locally** (unit). Not used by the live chat route (it still sends 1.2) |
| `POST /api/assistant/browser/confirm` and `/cancel` | **Implemented. Tested locally** (15 route tests against a fake signed Agent: mock for the Agent side). Off (404) unless `AI_ASSISTANT_BROWSER=1`. **Not integrated** (nothing in the UI can reach them until the layout passes the flag) |
| Browser task UI: progress list, approval prompt (countdown, one use, disabled while sending, error and retry, expired, cancelled), Sinhala and English wording | **Implemented. Tested locally** (unit, static markup, handler tests; layout measured in a real browser). **Not integrated** (needs the layout flag, below). Sinhala text is provisional |
| Screenshot preview | **Not built, on purpose**: contract 1.3 has no image reference for a page screenshot, and none was invented |
| Cards and comparison: audit and fixes | **Implemented. Tested locally** (unit + real-Agent Playwright). Integrated (these components are live code paths) once deployed |
| Voice UI against the new voice routes | **Audited, one defect fixed, tests added. Tested locally**. Sinhala/Singlish voice is **unevaluated**; no claim is made |
| Voice routes: unidentifiable client address policy | **Implemented. Tested locally**. Pending deployment with the rest |
| Real browser-task flow end to end in a real browser | **Blocked** (three wiring changes outside this agent's files; section 6) |

## 2. What was built

### 2.1 Contract 1.3 mirror (`src/lib/assistant/schema.ts`)

- `AGENT_CONTRACT_VERSION` stays `"1.2"`; `AGENT_CONTRACT_VERSION_BROWSER = "1.3"` is new. The 1.2 response schema is **unchanged**: it still refuses a `browser` field and a 1.3 version (tested).
- New strict schemas, mirrored from `apps/agent/src/contract/schemas.ts`: `BrowserPanel` (progress of at most 8 steps, optional proposal, `source` always `"page"`), `BrowserProposal` (`bp_` id of 16 to 40 characters, description at most 200 and without control characters, **page must be a path on this site**: no host, scheme, `//` or backslash; `actionClass` only `reversible` or `sensitive` so a payment can never be offered for approval; expiry 1 to 600 s), `AgentChatResponse13`, `AgentDecisionResponse`, the browser's own strict `BrowserDecisionBody` (`{ proposalId }` and nothing else), and an optional `path` on the chat request.
- `toPublic()` keeps a 1.2 answer exactly as before (no `browser` key) and forwards the panel only when present.

### 2.2 Routes (`src/app/api/assistant/browser/{confirm,cancel}/route.ts`, shared `src/lib/assistant/browser-decision.ts`)

Same rules as the chat route: off (404) unless the assistant is configured, the shopper has access **and** `AI_ASSISTANT_BROWSER` is exactly `1`; same-origin only; rate limit 12 per minute per client; identity from the session cookie only; **the conversation id is derived on the server from the assistant cookie** (the browser sends only `{ proposalId }` and cannot name a conversation; without the cookie nothing is sent to the Agent); signed with the shared HMAC; the Agent's answer is validated against the strict schema and **must belong to the same conversation**; only the outcome, the Agent's fixed reply, the review flag and the progress steps reach the browser; Agent error text is never forwarded (fixed wording per code); an unusable client address is signed as the one reserved address `192.0.2.1`, never `0.0.0.0`.

### 2.3 Browser task UI (`src/components/assistant/browser-task.tsx`, `src/lib/assistant/browser-client.ts`)

- **Progress**: the steps in **our** fixed words chosen by the step name (the Agent's label text and anything from the page are never shown), the state as words and not colour alone, a note that page text is not a verified price or stock.
- **Approval prompt**: shows the action and the page, how long is left (visible countdown), exactly Approve and Cancel; both disabled while the decision is sent; a failed send shows an alert and a retry; after any answer it is gone (one use); an approval that expired on screen is never sent; a second click while one is in flight does nothing (tested as rules: `decisionGate`, `phaseAfter`). Page-derived text is rendered as plain text (markup in it is escaped: tested).
- **Accessibility**: the card is a labelled group, receives focus when it appears, progress is an ordered list with a name, statuses are read out, buttons are at least 44 px tall (measured in a real browser), reduced-motion respected by the existing styles.
- **Client validation**: `src/lib/assistant/browser-client.ts` ships to the browser without zod and re-checks everything it receives (enum values, sizes, control characters, page shape); extra fields are dropped.
- **Privacy**: when the feature is on, the widget may report the page path as `context.path`, but **never** for `/checkout`, `/account`, `/admin`, `/track-order`, `/api`, `/login`, `/order-confirmation` (`src/lib/assistant/page-path.ts`).
- **Flag**: `AssistantPanel` takes `browser?: boolean` (default `false`). With it off nothing renders, no path is sent, and a `browser` panel in an answer is ignored.

### 2.4 Cards and comparison audit (`src/components/assistant/cards.tsx`)

Concrete defects found and fixed, without redesign: the comparison's empty top-left cell had no name (now a screen-reader "Feature"); long product names and values did not wrap in the table; 3 and 4 products had the same minimum width as 2 (now wider, scrolling inside the card); rows with the same label produced duplicate React keys; a struck-through list price had no spoken meaning (now "Original price"); the fit chip list had no accessible name. A swipe hint was added after the visual review (section 4). Labels added in English and (provisional) Sinhala.

### 2.5 Voice UI audit

The mic, recorder, preview and player states were checked against the new routes' possible answers. One defect fixed: a playback failure was coloured text only (now announced as a status). Tests added. `guestOrCustomerIp` now returns the reserved address `192.0.2.1` instead of `0.0.0.0` (the one-line change requested), with route tests for transcribe and speak. **Not done**: a browser `speechSynthesis` fallback when the server has no voice for a language (the Agent returns 501 with a fallback hint; the player shows "Could not play audio"); Sinhala voice quality is unevaluated and blocked on native-speaker recordings.

## 3. Tests (executed 2026-11-14)

| Suite | Result | Kind |
|---|---|---|
| Website unit and route tests (`npx vitest run`) | **515 passed, 38 files** (was 447 in 31 files before this work: +68 tests in 7 new files, plus 3 added to existing files) | mock-based |
| `npx tsc --noEmit` | clean | n/a |
| New: contract 1.3 schema mirror (`assistant-browser-schema`) | 12 passed | unit |
| New: browser client, page path, flag (`assistant-browser-client`) | 12 passed | unit |
| New: browser task UI, rules and handlers (`assistant-browser-ui`) | 13 passed | unit, static markup, handler walking (no DOM library in this workspace) |
| New: cards and comparison audit (`assistant-cards-audit`) | 10 passed | unit, static markup |
| New: voice UI audit (`assistant-voice-ui-audit`) | 4 passed | unit, static markup |
| New: confirm and cancel routes (`assistant-browser-route`) | 15 passed | route tests against a FAKE signed Agent (**mock-only for the Agent side**) |
| Voice route tests (`assistant-voice-route`) | 18 passed (2 new: unidentifiable client address, transcribe and speak) | route tests against a fake Agent |
| Real-Agent Playwright (`playwright.real-agent.config.ts`) | **20 passed, run twice in a row (3.6 min, 2.7 min), 0 failed, 0 flaky**; the earlier 12 plus 8 new | real Agent code on an invented fixture catalogue in real Chromium (desktop and Pixel 7); 3 of the 8 new tests (comparison) use the real Agent end to end, 5 are markup-injection layout tests (labelled mock-only in the file) |
| Same suite, comparison tests only, after the swipe-hint fix | 3 passed | as above |

Not run: the other Playwright specs (they need other servers), any test on a real phone, any test against the live site. **There is no real-Agent test of the browser task and approval flow**; it is blocked (section 6).

## 4. Visual review

Reviewed by looking at real screenshots (saved in the scratchpad, `shots-frontend*`): approval prompt on a desktop page, on a phone, in Sinhala, while sending and expired; a real-Agent comparison on a phone; a four-product comparison on a phone. The component markup was injected into a real store page, so the site's real CSS, fonts and colours were used.

What was seen and what was done about it:
- **Approval prompt, desktop** (bottom-left panel over the home page): progress list with ticks and a dash, the page-text note, the approval card with action, page, "can be undone", the expiry line, a blue Approve and a white Cancel. Readable, nothing clipped. No change needed.
- **Approval prompt, phone**: the two buttons stack, fill the width and are tall enough to tap (measured at least 44 px). No change needed.
- **Sinhala**: the title wraps onto two lines and everything fits; the Sinhala font renders. (The screenshot also shows the store's loading splash behind the card: the page had not finished loading when it was taken. It does not affect the card.) The wording is provisional and needs native review.
- **Real-Agent comparison on a phone, 2 products**: fits completely, no sideways scrolling; the "Feature" cell is invisible by design (screen-reader name only).
- **Four-product comparison on a phone, BEFORE the fix**: the third and fourth columns were cut off at the card edge with **no sign that the table scrolls**. **Fixed**: a short swipe hint appears above the table on phones when there are 3 or 4 products (English and provisional Sinhala), tested; the screenshot after the fix shows it.
- **Not reviewed visually**: the real chat panel with an approval inside it (not possible, section 6); a real phone with its on-screen keyboard; dark mode (the site has none); a screen reader (roles and labels are tested as markup only); the screenshots of the older voice states under `docs/screenshots/assistant-voice/` (those files show as modified in git from earlier today, before this work; not touched by it).

## 5. Files

Changed: `src/lib/assistant/schema.ts`, `voice-agent.ts`, `src/components/assistant/{assistant-panel,cards,labels,types}.tsx|ts`, `voice/voice-ui.tsx`, `tests/e2e/assistant-real-agent.spec.ts`, `tests/integration/assistant-voice-route.test.ts`. New: `src/lib/assistant/{browser-flag,browser-client,browser-decision,page-path}.ts`, `src/app/api/assistant/browser/{confirm,cancel}/route.ts`, `src/components/assistant/browser-task.tsx`, `tests/unit/assistant-{browser-schema,browser-client,browser-ui,cards-audit,voice-ui-audit}.test.ts`, `tests/integration/assistant-browser-route.test.ts`.

## 6. What the owner or orchestrator must still do (outside this agent's files)

1. **Layout** (`src/components/layout/store-shell.tsx` line 39): pass the flag, `<AssistantPanel demo={...} voice={readVoiceCapabilities()} browser={browserEnabled()} />`, importing `browserEnabled` from `@/lib/assistant/browser-flag`. Until then no browser UI can render.
2. **Chat route** (`src/app/api/assistant/chat/route.ts`, owned by the Architecture agent): when `browserEnabled()`, send `contractVersion: "1.3"` and `context: { page, path }` (use `input.path`), parse the answer with `AgentChatResponse13`, and pass it to `toPublic` (already accepts both). **Deploy the Agent first**: a 1.3 website needs a 1.3 Agent; roll the website back first.
3. **Agent e2e entry** (`apps/agent/tests/real/e2e-agent.ts`): start the Agent with the browser feature and a fixture driver (see how `tests/real-browser/agent-e2e.real.ts` builds it) so a real-Agent Playwright test of the whole task and approval flow can run. That test does not exist yet and is the main remaining test gap.
4. Native Sinhala review of the new labels (`labels.ts`, Sinhala column) before they are shown to shoppers; the existing review mechanism is unchanged.
5. Decisions and approvals: raising the website's contract version, turning on `AI_ASSISTANT_BROWSER`, and everything that needs the Agent's browser driver (which is itself blocked: fresh independent review, OS-level isolation, Linux check).

## 7. Known limits

- The approval countdown runs in the browser from the time the prompt appeared; the Agent's own expiry is the authority (a late approval is refused there).
- A restart of the Agent forgets pending proposals; the approval then answers `expired`, which the UI shows.
- The progress list shows steps, not a live stream: the 1.3 stream event `browser` is not consumed (the widget uses the non-streaming chat route).
- No screenshot preview exists in the contract; none was built.
- Only layout and tap-target size were measured visually, by injecting component markup into a real store page; the real flow was not run in a browser. Real phone keyboard and screen-reader behaviour were not tested.
