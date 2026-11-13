# Playwright end-to-end report

Date: 2026-11-14. Written for: the project owner and the reviewers.

Everything below was **executed**. Nothing was deployed.

## 1. Setup (what "real" means here)

A new configuration, `apps/web/playwright.real-agent.config.ts`, starts: the storefront on a Next.js development server (port 3102), a mock ERP for the storefront, a mock WhatsApp service, a disposable in-memory database, and the **real Agent code** (`apps/agent/tests/real/e2e-agent.ts`: HMAC verification, rate limits, router, reasoning layer, tools, verifier, version shaping) listening on 127.0.0.1:4014. The browser talks to the website, the website signs and calls that Agent, and the Agent answers from the **invented fixture catalogue** (not VOLTA.LK data, no model, no network). Nothing is canned. The fake-Agent specs that existed before are untouched and still run under the original configuration.

New spec: `apps/web/tests/e2e/assistant-real-agent.spec.ts`. The original configuration now ignores it (it needs the real Agent).

## 2. Results

**Real Agent: 12 passed (1.6 minutes), run twice** (the second time after the last code change). Existing assistant specs on the fake Agent (`assistant-widget`, `assistant-voice`, `assistant-mobile-keyboard`, desktop and phone): **30 passed (3.7 minutes)**, run after the web changes (contract 1.2, review note, labels).

| Area asked for | Test | Result |
|---|---|---|
| Sinhala greeting | "ආයුබෝවන්" is answered in Sinhala, no product cards, the internal review flag is on the message | Pass |
| Singlish conversation | "kohomada oyata" is answered conversationally (Sinhala-style text), no search | Pass |
| English conversation | "hi" gets the English welcome; no review flag | Pass |
| Multi-turn shopping | "show me phones" (asks the budget, shows cards) then "150000" (asks what matters, every card within budget) then "camera" (no further question; recommends) | Pass |
| Budget retention | "phones under 100000" then "show me the cheapest": every card still within budget, cheapest first | Pass |
| Product references | "tell me about the second one" shows exactly the second card of the previous reply | Pass |
| Product cards | real price text, live (not demo) stock label, the out-of-stock item never shown | Pass |
| Fit reason chips | the top camera recommendation shows "Highest camera spec listed among the matches" and "Within your budget"; a no-match answer shows close alternatives marked "Above your budget" | Pass |
| Language switching | choosing Sinhala makes "hello" answer in Sinhala; choosing English makes "kohomada oyata" answer in English | Pass |
| Singlish follow-up | "laptop ekak pennanna" then "150000 ta adu": the reply stays Sinhala-style and every card is within budget | Pass |
| Error handling | a failed request shows a plain message and "Try again"; no internal error code is shown; retrying works once the service is back | Pass |
| Phone | a Pixel 7 session opens the assistant, takes a message and shows a card with fit chips | Pass |

## 3. What the first runs showed

Two rounds of failures were **test-helper mistakes, not product defects**: card counts included earlier turns still on the screen, and a price parser tripped over the "." in "Rs.". Both were fixed in the spec. No product defect was found by the browser tests; the product defects found in this phase came from the real-catalogue audit (see `AI_REAL_CATALOGUE_AUDIT.md`).

## 4. Product changes made for these tests

A `data-testid="assistant-reply"` on the reply bubble. The internal "provisional Sinhala" note is no longer shown to shoppers in a production build (kept as a `data-native-review` attribute and as a visible note only in development builds); the two older specs that looked for the visible note now check the attribute.

## 5. Limits

- The storefront ran on `next dev`, not a production build; no production-build run of the new spec was made.
- One phone-sized test. No screenshots were taken or reviewed, so **visual layout of the fit chips on a real phone and desktop was not judged**.
- The catalogue is an invented fixture: this proves the wiring and the behaviour, not how the real shop's data looks in the widget.
- Voice, the checkout, and the store chat were not part of this run (the older voice spec still passes).
- The Agent for these tests runs from the main checkout's `apps/agent` (the website worktree does not carry it); the path is configurable with `AGENT_REPO_DIR`.

## 6. How to run

```
cd apps/web
npx playwright test -c playwright.real-agent.config.ts          # real Agent, 12 tests
npx playwright test tests/e2e/assistant-widget.spec.ts          # original fake-Agent specs
```
