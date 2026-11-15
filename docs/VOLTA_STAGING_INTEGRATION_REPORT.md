# Staging integration report

Date: 2026-11-14. Written for: the project owner. **Scope: the LOCAL staging simulation.** Private staging on the servers is blocked (needs approval); nothing was connected to a server.

## 1. What was run (all executed)

| Suite | Result |
|---|---|
| Agent: unit and integration (`apps/agent`) | **1,299 passed, 3 skipped** (the skipped are manual recorders), 63 files |
| Website: unit and route (`apps/web`) | **387 passed**, 28 files |
| TypeScript (Agent and website) | clean |
| Playwright, real Agent (`playwright.real-agent.config.ts`) | **12/12 passed** (run three times; the last after all fixes) |
| Playwright, original fake-Agent assistant specs | **30 passed** (run after the contract 1.2 web changes; not re-run after the later Agent-only fixes, which do not touch the website) |
| Contract tests 1.0 / 1.1 / 1.2 over HTTP | 10 passed |
| Real-catalogue patterns (invented products shaped like the audit) | 10 passed |
| Frozen EVAL (72 scenarios, 108 turns) | file hash unchanged; regression run: hallucination 0%, intent 100%, relevance 98.8%, recommendation 95.8% (**contaminated** by later fixes; the held-out first run is 88.6% intent, 83.3% recommendation, 0% hallucination) |

## 2. API contract validation (requested list)

| Case | Result |
|---|---|
| 1.0, 1.1, 1.2 requests | Compatible; `fit` only to 1.2 |
| Unknown version | HTTP 422 `VALIDATION_FAILED`, no cards |
| Unknown reason code from the Agent | Website: refused as garbage (502), nothing reaches the browser. Agent: if its own pipeline produced one, the server answers a fixed `INTERNAL` error with no detail (a controlled JSON error; reviewer finding F-04 explains why that is not acceptable for merely long data, fixed locally by truncating) |
| Invalid requests (unknown field, identity or session in the body, control characters, empty, oversized, bad cart) | HTTP 422 `VALIDATION_FAILED`; non-JSON body HTTP 400 |
| Authentication failures (no signature, wrong secret, unknown key, stale, replayed, signature moved to another path or body) | HTTP 401 and the pipeline never runs |
| Timeout and retry | The website's timeout and retry-with-the-same-"Try again" behaviour are covered by the route tests and the browser error test (503, no internal code shown, retry works). The Agent's own deadline (45 s default) is covered by existing tests. **Not measured against a real slow model in staging** |

## 3. Frontend integration (real browser, real Agent code)

Passed: Sinhala, Singlish and English greetings; mixed-language shopping; product cards with live (non-demo) stock label; fit chips (English wording verified in the browser; Sinhala wording only by unit test); memory of the budget across turns; "the second one"; no-match alternatives with the over-budget chip; explicit language choice; error and retry; one phone-sized session.

Not covered: product **comparison** and the **cart-confirm** flow against the real Agent in the browser (they are covered with the fake Agent and by Agent integration tests); voice; visual review of layout (no screenshots were taken or judged); desktop and phone were each run through the same spec, mobile only for one test.

## 4. Real catalogue data

Validated by probing a snapshot of the 7 real records (see `AI_REAL_CATALOGUE_AUDIT.md`): four real defects found and fixed, three more found by the live smoke test on 2026-11-13 and fixed. **Not validated through a private staging website**, because none exists.

## 5. Blocked and why

| Item | Blocker |
|---|---|
| Staging Agent on the AI server | Needs owner approval to run the second-instance script |
| Website staging connected to the private Agent | Needs approval: tunnel rule, second tunnel, preview website |
| Model-backed conversations in staging (the Qwen chat lane) | Needs the staging Agent and a quiet window |
| Concurrency tests on the real hardware | Same, and they must not run while live traffic is served |

## 6. Exit criteria for Phase 7

Staging integration works locally: yes. Real catalogue validated: on a snapshot only. API compatibility: pass. Security checks: pass for what was tested (see the security report). E2E: pass on the local stack. Performance limits documented: yes (local and earlier server measurements, see the performance report). Production untouched: yes (the only server actions this phase were the approved deploys earlier in the day and read-only checks). **The phase is NOT complete as specified, because private staging on the servers is blocked.**
