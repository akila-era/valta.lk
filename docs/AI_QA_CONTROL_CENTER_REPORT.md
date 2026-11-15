# VOLTA AI QA control center: implementation report (stage 1)

Status: built and tested **locally**. Nothing committed, pushed or deployed; no server, DNS, firewall, model, credential or purchase touched; no real customer data. This report separates what was verified from what is still missing, and names the evidence type for each.

Written for: the project owner. The plan, capability inventory and gap report are in `AI_QA_CONTROL_CENTER_PLAN.md`.

## 1. What you can do now

Run one command, then open the dashboard in your browser (all local):

```
cd apps/web
set AGENT_DIR=E:\valta.lk\apps\agent        (optional: uses the REAL Agent code, router and tools, over the mock catalogue)
node scripts/qa-dev.mjs
```
It starts a mock store (invented products), a disposable in-memory database, an Agent and the web app in development mode on ports 3201/4111/4113/5599 (they do not clash with the automated tests), creates an admin account and prints the address. Open `http://localhost:3201/admin/login`, sign in as `admin@example.test` / `secret123`, then open `http://localhost:3201/admin/ai-qa`. The shopper-facing assistant is on the same site (button at the bottom left). Without `AGENT_DIR` it uses the repo's FAKE Agent (canned replies), which is only for testing the dashboard itself.

## 2. What was built

| Part | Where | What it does |
|---|---|---|
| QA control center page | `apps/web/src/app/(admin)/admin/(panel)/ai-qa/page.tsx`, `src/components/admin/ai-qa/qa-center.tsx` | Six tabs: Overview, Test console, Language QA, Browser QA, Voice QA, Results (with JSON export) |
| Status engine (pure, unit tested) | `src/lib/ai-qa/{types,capabilities,scenarios,flags}.ts` | Derives each capability's status from real probes and results; defines 27 scenarios and their checks |
| Signed Agent client | `src/lib/ai-qa/agent-client.ts` | Same signing, configuration and response validation as the public assistant; guest identity only |
| API (admin, development only) | `src/app/api/admin/ai-qa/{status,chat}/route.ts`, `src/lib/ai-qa/front.ts` | Real health probe of the Agent, probes of the voice routes, and one chat turn through the real path |
| Local launcher | `apps/web/scripts/qa-dev.mjs` | One command to run everything locally |
| Tests | `tests/unit/ai-qa.test.ts` (16), `tests/e2e/ai-qa.spec.ts` (Chromium, desktop and phone) | See section 4 |
| Support changes | `playwright.config.ts` (a dev web server on :3101 and QA projects), `tests/stubs/fake-agent.ts` (a signed health route, answering as an Agent with no model), `apps/agent/tests/real/dev-mock-agent.ts` (dev-only higher rate limits) | |
| Screenshots | `docs/screenshots/ai-qa/` | Eleven images: the dashboard on desktop and phone, the console, Language QA, Results, Browser, Voice, and three from a run against the real Agent code |

## 3. How honesty is enforced

- Statuses are exactly: Working, Limited, Mock only, Not connected, Failed, Not tested. Evidence labels are exactly: Unit tested, Integration tested, Mock tested, Real browser tested, Real model tested, Real voice tested, Not tested.
- **Working must be earned** with a connected model, a real (not mock) catalogue and at least 10 passing scenarios, and Sinhala and Singlish are **capped at Limited** (not native-reviewed). With today's setup nothing can reach Working, and the page says why.
- A result over the mock catalogue counts as **Mock only**, never as a real integration test (Results tab and export).
- A scenario's own result is PASS or FAIL, never "Working".
- Where something is not connected it says so: no model locally, no browser driver, no voice service, no RAG, no image or document service, no intent trace.

## 4. Test evidence

| Evidence | Result | Type |
|---|---|---|
| Web unit tests (whole suite) | **373 passed** (26 files) | Unit tested |
| QA control center unit tests | 16 passed: development-only rule, every status rule, totals, scenario checks | Unit tested |
| QA browser tests (real Chromium, desktop and Pixel 7), against a development web server and the FAKE Agent | **11 of 11 passed** (10 desktop, 1 phone) | Real browser tested (the dashboard itself); Mock tested (the Agent behind it) |
| Production gate | A production build serves no QA markup (only the site's "not found" screen) and its QA API answers 404, even with AI_QA_ENABLED set | Real browser tested |
| Admin gate | Signed-out: redirected to sign in; API 401. Signed-in non-staff: API 403, no QA content | Real browser tested |
| Accessibility basics | tablist and tab roles with `aria-selected`, labelled controls, keyboard send with Enter, keyboard tab selection, live regions | Real browser tested |
| Whole scenario set against the **real Agent code** (new router) over the mock catalogue, driven through the dashboard in Chromium | **27 scenarios: 26 pass, 1 fail, 0 skipped. All 27 counted Mock only, 0 real integration** (no model, mock data) | Integration tested + Mock tested; not Real model tested |
| Full existing browser suite | 172 of 173 passed on the first full run; the one failure (a homepage hero test) passed when run alone (a timing flake under load) | Real browser tested |

### What the real-Agent run found (genuine results, not test artefacts)

Passing: product search, budget limits (every returned price checked against the limit), two-product comparison, accessories, stock, **cart changes only as proposals** (never confirmed), a product with options asks which option, parcel questions lead to order tracking, Singlish, Sinhala and mixed shopping requests (Sinhala replies carry the native-review flag), general questions do not invoke shopping tools, **weather is declined instead of invented**, **Google is refused**, prompt injection is not obeyed, price changes are refused, payment is never taken, and "compare these two" after showing phones works.
**Failing (a real gap):** "Add the first one to my cart" after "Show me phones": the Agent answers "Which product do you mean?". It resolves "this one" from the last shown products but not ordinals such as "the first one". Conversation Memory therefore shows **Failed** on the dashboard.

## 5. Known limitations (stated on the dashboard too)

1. **Detected intent, extracted constraints, selected tools, the tool response and the verification result are not shown.** The Agent does not expose them to the website. Language QA compares the **observed outcome** (cards, proposals, reply text, language flag) instead. Showing the trace needs a development-only trace endpoint on the Agent (stage 2).
2. **No real model locally.** There is no Ollama on this computer, so General AI Chat is Not connected here. On the AI server the same dashboard would report the loaded model, but the QA center is development only and is never enabled there.
3. **Browser QA is MOCK ONLY.** No real Playwright driver exists. The ten required scenarios are listed as Not tested, and the page shows the mock benchmark figures labelled MOCK. Real Chromium control of `valta.hexalyte.com`, the activity panel (URL, title, elements, history, screenshots) and the ten live scenarios are stage 3.
4. **Voice QA is a microphone test only.** There is no speech-to-text or text-to-speech anywhere, so no transcription or spoken reply exists to test and none is faked. The microphone test uses the browser's real permission flow and releases the microphone at once; nothing is recorded. No Sinhala voice claim is made.
5. **Image and document QA, and the RAG, are Not connected** (nothing to test).
6. **Streaming responses, upload controls and the browser-activity indicator in the shopper modal are not built** (stage 2). The Agent already has a streaming endpoint; the website route does not use it.
7. The production-build gate returns the site's "not found" screen with HTTP 200 rather than a 404 status for the page (Next.js has already started streaming the admin layout); the QA API does answer 404. No QA content is served.
8. Scenario set: 27 prompts written by the engineering team; not native-reviewed; the frozen TEST and HOLDOUT language datasets were **not used or changed**.
9. Results live in the browser session (and the JSON export); there is no server-side history.

## 6. Remaining infrastructure requirements

| Need | For | State |
|---|---|---|
| Agent dev-only trace endpoint (a change on the Agent branch) | Intent, tools, verification display | Next stage, no purchase |
| Chromium on this computer (already installed for the tests) and a real `BrowserDriver` | Real browser demonstration | Next stages, no purchase |
| A speech service (separate host) | Real voice QA | Not approved |
| A vision model and document service | Image and document QA | Not approved |
| A larger inference host | A model beyond 1.7B to 4B | Not approved |

## 7. Final test counts

| Suite | Result |
|---|---|
| Web unit and integration | 373 passed (26 files); type check and lint clean on all new files |
| QA control center browser tests (Chromium, desktop and Pixel 7) | 11 passed. One earlier run failed once because the first page load on a cold development server exceeded 30 seconds; its API checks had passed. The test now allows for the cold compile |
| Full existing browser suite (first full run, before the last small fixes) | 172 passed, 1 failed: a homepage hero test that passed when re-run alone (timing under load). Not re-run in full after the final changes, which touched only the new QA files and the Playwright config |
| Agent unit and integration (unchanged by this stage except one dev-only launcher file) | 1184 passed at the last full run; type check clean |
| Real Agent code through the dashboard (27 scenarios, mock catalogue, no model) | 26 passed, 1 failed (the "first one" gap), 0 skipped; all Mock only |

## 8. Files (all uncommitted)

New: `apps/web/src/lib/ai-qa/*` (6 files), `apps/web/src/components/admin/ai-qa/qa-center.tsx`, `apps/web/src/app/(admin)/admin/(panel)/ai-qa/page.tsx`, `apps/web/src/app/api/admin/ai-qa/{status,chat}/route.ts`, `apps/web/scripts/qa-dev.mjs`, `apps/web/tests/unit/ai-qa.test.ts`, `apps/web/tests/e2e/ai-qa.spec.ts`, `docs/screenshots/ai-qa/*.png` (12), `docs/AI_QA_CONTROL_CENTER_PLAN.md`, this report.
Modified: `apps/web/playwright.config.ts`, `apps/web/tests/stubs/fake-agent.ts` (web branch); `apps/agent/tests/real/dev-mock-agent.ts` (Agent branch, dev only).
Not touched: the frozen language datasets, the live Agent, the production site, any server.

## 9. Recommended next stage

Stage 2: a development-only **trace endpoint on the Agent** (intent, entities, selected tools, tool outcomes, verification result), so the QA center can show them and compare expected against actual **intent**, plus wiring the Agent's streaming endpoint into the modal. Then stage 3 (a real Playwright driver on local fixtures and the visual browser panel). Also worth fixing from this run: ordinal references ("the first one") in the Agent.
