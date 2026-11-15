# Browser integration report (wave 2)

Date: 2026-11-14. Written for: the project owner and the frontend engineer. Status words: **Implemented, Integrated, Tested locally, Tested with real Chromium (local fixture), Blocked, Pending approval.** Nothing here was committed, pushed, deployed or run on any server. **The browser stays Blocked** for any shopper-facing or production use: it needs a fresh independent review of the wave-1 fixes, operating-system isolation of the browser process, and the owner's approval.

## 1. What was built

| Piece | Status |
|---|---|
| `src/browser-agent/` (config, intent rules, fixed templates, the agent that plans and executes, factory) | Implemented, Integrated into the Agent server, Tested locally (mock driver) and with real Chromium |
| Server wiring: explicit page requests in `/v1/chat` and `/v1/chat/stream`; `POST /v1/browser/confirm` and `/v1/browser/cancel` | Integrated; the routes **do not exist** (404) unless the browser agent is constructed |
| Contract **1.3**: optional `browser` panel in the chat response, optional `context.path` in the request, a `browser` stream event | Implemented; tested in both directions (1.0 to 1.2 clients receive nothing new) |
| Production entry `src/main.ts` (browser off) and browser build `src/main-browser.ts` (the only file that imports the real driver) | Implemented; standard bundle verified to contain **no** Playwright code |
| Real Chromium end-to-end test (`tests/real-browser/agent-e2e.real.ts`, 8 tests) | Tested with real Chromium against a **local fixture only** |
| Model-driven browsing (a model choosing browser tools) | **Not built, Blocked** (see 3) |
| Browser task UI and approval UI in the website | **Not built** (frontend wave; needs the website routes in 5) |

## 2. How it works (deterministic, no model in the loop)

1. **Detection** (`intent.ts`, pure text rules): only an explicit request about the page the shopper is on ("what is on this page", "me page eke monawada thiyenne", "මේ පිටුවේ මොනවද තියෙන්නේ") or to press a named control ("click the "Add to cart" button", ""Add to cart" button eka click karanna"). Ordinary shopping ("laptop for office work", "VOLTA website eke gaming laptop ekak hoyala denna", "add the second one to my cart") is **not** a browse request: it stays on the verified catalogue tools, which remain the only source of prices, stock and specifications. I put the detector in front of the pipeline (in the HTTP layer, only when the browser agent exists) instead of editing the router: no router, reasoning or frozen-benchmark behaviour changed.
2. **Plan**: fixed steps through the existing `BrowserToolService` (URL policy, ownership, step budget, element fingerprints, post-action verification): open the page, read it (or find the control), act, verify, close. The page is the one the website says the shopper is on (`context.path`, an untrusted hint re-checked by the URL policy), or `/` or `/products` from the coarse page kind.
3. **Reply**: fixed templates (English, and provisional Sinhala with `needsNativeReview`) around page strings the browser really observed. Every quoted part is checked against the observed text (`verifyBrowseText`); a reply that quotes anything else is not sent. Page text is always labelled "the page's own text; prices and stock shown there are not verified; ask me for verified details". The reply never contains a model's words, a price from the page presented as a fact, or a screenshot.
4. **Injection**: any injection signal (visible or hidden text aimed at the assistant, including hidden text the driver dropped) gives a fixed refusal, an audit entry (code only) and a metric; no page text appears in the reply.
5. **Sessions**: anonymous contexts only (no cookies or logins imported), one per shopper identity, owner = the signed identity and assistant session, closed at the end of every read task. A session stays open only while a proposal waits for approval (proposal time plus a margin).

## 3. What changes the page, and who decides

| Control kind | Behaviour |
|---|---|
| Read-only or reversible UI (compare, wishlist toggles) | performed, verified by comparing the real page before and after (unverified is reported as "I could not see the page change") |
| Cart change, account, address, message, sign-in, checkout links | **proposal only**: the Agent returns `browser.confirmation`; nothing happens until the shopper approves |
| Payment, order placement, coupons | **refused outright** (fixed reply, audit entry); no proposal can be created |
| Typing | not offered through this path at all (the tool layer would refuse secret, personal and discount fields in any case) |

**Approval** (`POST /v1/browser/confirm`): signed like chat; the body names the assistant session and the proposal id. The proposal is bound to the **session and identity that created it** and to the exact element and page (the tool layer re-derives the action hash and consumes a single-use token bound to the browser session and that hash), **expires** (default 120 s), and is removed on first use. A proposal of another session or identity, an unknown id, an expired or reused one all answer the same `expired`. The real-Chromium test proves the page's own network request fires **only** after approval and **exactly once**.

Model-driven browsing is **Blocked** because whether a model ignores a page-borne injection has not been evaluated; until that has been measured (and the 4B/9B models cannot be evaluated on the live host), the deterministic plan is the only safe integration. The existing `BrowserTaskRunner` (model loop) is untouched and unwired.

## 4. Switches and limits

| Setting | Default | Meaning |
|---|---|---|
| `AGENT_BROWSER_ENABLED` | off | Must be exactly `true`. Also requires a build that contains the driver (`npm run bundle:browser`); otherwise the start fails with a clear message |
| `AGENT_BROWSER_MAX_SESSIONS` | 2 (1 to 4) | concurrent contexts in the whole Agent |
| `AGENT_BROWSER_STEP_BUDGET` | 8 (2 to 20) | tool steps per session |
| `AGENT_BROWSER_TASK_TIMEOUT_MS` | 30,000 | wall-clock limit per task; on expiry the session is closed and a fixed reply sent |
| `AGENT_BROWSER_CONFIRM_TTL_SEC` | 120 (30 to 300) | how long a proposal waits |

When off: no driver, no session manager, no proxy, no routes, chat unchanged (a test sends "what is on this page?" with the feature off and gets the normal pipeline answer with no `browser` field).

## 4a. Contract 1.3 (what the frontend builds against)

**Request** (`POST /v1/chat`, `contractVersion: "1.3"`): new optional `context.path`: the page's path and query, e.g. `"/products/gaming-laptop-x1"` (max 200 characters, must start with a single `/`; anything else is a 422).

**Response**: optional `browser` (only for 1.3):
```json
{
  "reply": { "text": "I can do this on the page, but only if you approve it: Change your cart: \"Add to cart\". Please check the details and confirm.", "source": "template" },
  "needsNativeReview": false,
  "language": "en",
  "browser": {
    "source": "page",
    "progress": [
      { "step": "open", "status": "done", "label": "Opening the page" },
      { "step": "find", "status": "done", "label": "Looking for the control" },
      { "step": "act",  "status": "skipped", "label": "Pressing it" }
    ],
    "confirmation": { "proposalId": "bp_Ab3dEf6hIj9lMn0pQr", "description": "Change your cart: \"Add to cart\"", "page": "/products/gaming-laptop-x1", "actionClass": "reversible", "expiresInSec": 120 }
  }
}
```
`progress[].step` is one of `open | read | find | act | verify | close`, `status` one of `done | failed | skipped`; `label` is a fixed English phrase (translate from `step`). A read-only task has no `confirmation`. `source` is always `"page"`: the text came from the page and is not a verified price or stock.

**Approval**: `POST /v1/browser/confirm` or `/v1/browser/cancel`, signed like chat, body `{ "sessionId": "<the chat session id>", "proposalId": "bp_..." }` (strict: extra fields are a 422). Response:
```json
{ "requestId": "req_...", "sessionId": "sess_...", "outcome": "done", "reply": { "text": "Done. The page now shows \"Gaming Laptop X1\". This is the page's own text, so any price or stock shown there is not verified. Ask me for verified details.", "source": "template" }, "needsNativeReview": false, "browser": { "source": "page", "progress": [ { "step": "open", "status": "done", "label": "Opening the page" }, { "step": "find", "status": "done", "label": "Looking for the control" }, { "step": "act", "status": "done", "label": "Pressing it" }, { "step": "verify", "status": "done", "label": "Checking the result" }, { "step": "close", "status": "done", "label": "Closing the page" } ] } }
```
`outcome`: `done | failed | cancelled | expired`. **Streaming**: for `/v1/chat/stream` a 1.3 client additionally receives one `event: browser` with the `browser` object (before `done`).

**Older clients**: a 1.0 to 1.2 client never receives `browser`, and is never offered an action that needs an approval (a press request answers "I can't do that on the page from here" without opening a page); a read request works and returns text only.

## 5. What the website still needs (not built)

Because the Agent's browser routes are signed, the **browser** never calls them. The website must: (1) send `contractVersion: "1.3"` and `context.path` (`location.pathname + search`) from the widget, (2) add two routes, `/api/assistant/browser/confirm` and `/cancel`, that sign and forward the decision using the **same session id derivation and identity as the chat route** (the cookie token, never a browser-chosen id), validate the response with the 1.3 schemas, and rate limit them, (3) mirror the 1.3 schemas in `apps/web/src/lib/assistant/schema.ts` (the website's `AGENT_CONTRACT_VERSION` is deliberately still `"1.2"`, so nothing changed for the live site), (4) build the progress, approval and refusal UI. None of this exists yet; the Agent side is complete and tested.

## 6. Tests (executed, local)

| Suite | Result |
|---|---|
| Mock-driver integration through `createAgentServer` (`tests/integration/browser-agent.test.ts`) | 27 passed: intent rules, streaming, 1.3 and 1.2 behaviour, read, injection refusal, blocked pages, proposal binding to session and identity, expiry, cancel, replacement, financial refusal, unknown control, timeouts, templates and quote verification |
| Production entry (`tests/integration/main-entry.test.ts`) | 10 passed (browser off: 404 routes and unchanged chat; fail-fast messages without secrets) |
| **Real Chromium** end to end (`tests/real-browser/agent-e2e.real.ts`) | **8 passed**: read with hidden text ignored, Singlish with the review flag, injection refusal, hidden-attack refusal, proposal fires nothing until approved then exactly once, wrong identity and wrong session do nothing, replay does nothing, late approval and cancel do nothing, payment control never pressed, blocked page never requested |
| Full real-browser suite | 71 passed, 1 skipped (the opt-in real-site visit, not run) |

Mock-only, not real browsing: the whole mock-driver file. Real but local: the E2E file (a fixture site on 127.0.0.1; the address mapping is the only double). **Not tested:** the live shop's pages; Linux; a model's behaviour against injections; any phone or desktop UI.

## 7. Open items and risks

- Still **Blocked** for production: fresh independent review of the wave-1 browser fixes; OS-level isolation (no separate user, no firewall rule for the browser process: proposal in `VOLTA_BROWSER_SECURITY_REPORT.md`, not executed); Chromium on Linux unverified; website 1.3 routes and UI not built; owner approval.
- The proposal store, session store, rate counters and metrics are in memory: a restart forgets pending proposals (the shopper's approval then answers `expired`, which is safe).
- The read summary shows the first ~280 characters of visible text: a long page is summarised, not understood.
- `browser.extract_products` was not built on purpose (page prices must never be a price source; the catalogue tools stay the authority).
