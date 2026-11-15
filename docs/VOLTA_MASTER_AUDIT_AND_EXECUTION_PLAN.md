# VOLTA AI master mission: audit, execution plan and ownership

Date: 2026-11-14. Written for: the project owner. Phase 1 deliverable. **Everything in this mission is local.** No production operation, commit, push, merge, deployment, restart, DNS/firewall/proxy/tunnel change, credential rotation, migration or catalogue change is part of it. Labels used for every feature: **Implemented, Integrated, Tested locally, Tested in isolated staging, Production verified, Blocked, Pending approval.** "Production verified" appears only where something was actually checked on the live servers.

## 1. What already exists (verified in earlier work; not to be rebuilt)

| Area | State | Label |
|---|---|---|
| Router-first pipeline, scope guard, safety filter, fixed-template replies, response verifier, contract 1.0/1.1/1.2 | Live on the new AI server (commit 96db7c9 code) | Production verified (live bundle hash read on 2026-11-14) |
| Conversation memory, requirement profile, pending questions, ordinals, previous references, budget/usage extraction (Sinhala, Singlish, English) | Live; frozen sets untouched | Tested locally; live smoke only on a few messages |
| Reasoning/recommendation with verified `fit` codes | Live | Tested locally |
| Real catalogue through a signed read-only relay | Live; **7 placeholder-quality products** | Production verified (data), not meaningful for recommendations |
| Website chat route, cookie session, HMAC, tunnel container | Live | Production verified |
| Per-guest new-conversation limit (fix) | Local only; live still has the shared counter of 10/hour | Tested locally; Pending approval (Step B) |
| Browser tool layer (policy, ownership, confirmations, loop) + mock | Existing | Tested locally (mock) |
| Real Playwright driver + egress proxy | New this week | Implemented; tested locally with real Chromium; **Blocked** (independent review: BR-01 High) |
| Voice routes (Agent + website), audio validation, providers | New this week | Implemented; Integrated (Agent server wiring, off without an engine); tested locally with fakes and synthetic English |
| Voice UI in the widget | Existing (mic, preview, playback) | Implemented; routes behind flags |
| Metrics | Counters and latencies at `/v1/metrics` (signed) | Implemented; no tokens/cost, no alerts |

## 2. Gaps and weaknesses found (the audit result)

1. **The live Agent runs from a test entry point** (`tests/real/preview-agent.ts`); `src/main.ts` is a stub. Architectural weakness (deploys, config, review all depend on a "test" path).
2. **Browser tools are not wired into the pipeline**; no model or router path can call them; no confirmation endpoint; no progress events; no UI.
3. **Independent review of browser/voice (15 findings, 1 High):** BR-01 click target swap (High), VO-01 duration cap bypass, VO-02 unauthenticated body read, BR-02/PX-01 non-atomic caps, BR-03 hidden text in snapshots, TS-01 flaky test.
4. **Rate-limit and proxy trust (production audit):** live guests share one counter (confirmed); client address is spoofable only if port 8090 is reachable (unverified); IPv6 /64 rotation bypasses per-address limits by design; no limiter at nginx; shared-network (CGNAT) over-blocking.
5. **Logging:** a preview `?key=` is written to nginx access logs (exposure assessment in progress).
6. **Catalogue:** 7 products, duplicates, mis-filed categories, no specifications; no tooling that turns a catalogue dump into a repeatable audit report.
7. **Observability:** no token/cost tracking, no browser/voice metrics, no alert definitions, no external uptime check.
8. **Intelligence:** frozen EVAL first run intent 88.6%, recommendation 83.3%; the answers are fixed fragments (safe, less natural). Sinhala/Singlish quality has no native review.
9. **Infrastructure:** website disk 91% full; old rollback images; SSH on both servers is UFW rate limited; temporary migration keys still installed; credentials pasted in chat earlier are not rotated.

## 3. Wave plan and file ownership

Agents never edit the same file. Shared files are owned by exactly one agent per wave; others request changes through the report.

| Wave | Agent | Owns (may edit) | Task |
|---|---|---|---|
| 1 | Browser Automation | `apps/agent/src/browser/**`, `apps/agent/tests/browser/**`, `tests/real-browser/**` | Fix BR-01/02/03, PX-01, TS-01; add `browser.select`; keep the driver disabled by default |
| 1 | Voice AI | `apps/agent/src/voice/**`, voice tests, website voice routes | Fix VO-01, VO-02; limits and metrics hooks |
| 1 | Security and Infrastructure | `apps/web/src/lib/security/**` (client address hardening + tests), `tools/ops/prepared/**` (new: prepared, never executed) | Apply the clientIp patch locally with tests; prepare nginx log redaction, DOCKER-USER rule, alert definitions as reviewed files |
| 1 | Catalogue Intelligence | NEW `apps/agent/src/catalogue-intel/**`, tests, `docs/VOLTA_CATALOGUE_*` | Repeatable audit tool (duplicates, suspicious prices, category mismatches, spec coverage) producing reports and proposed corrections only |
| 2 | AI Architecture | `apps/agent/src/pipeline/**`, `src/http/server.ts`, `src/contract/**`, `src/main.ts` | Browser integration contract (progress events, confirmation endpoint), a real production entry point; browser stays disabled by default |
| 2 | AI Intelligence | `apps/agent/src/reasoning/**`, `src/router/**` | Gap analysis on DEV sets only; fixes with benchmark runs; frozen sets untouched |
| 2 | Frontend Experience | `apps/web/src/components/assistant/**` | Browser progress, confirmation prompt, comparison view checks, mobile states (behind flags) |
| 3 | Independent QA | new review files only | Re-verify everything, regression, E2E, final report |

## 4. Phases to waves

Phase 1 this document. Phase 2 (production remediation plan): the four-agent sequence (network, proxy, logging, QA) plus Security wave 1; **all production commands are prepared, none run**. Phase 3: Catalogue (wave 1). Phase 4: Intelligence (wave 2). Phase 5: Browser (wave 1 fixes, wave 2 integration). Phase 6: Voice (wave 1 fixes; Sinhala **blocked on native recordings**). Phase 7: Frontend (wave 2). Phases 8 to 10: QA wave 3, staging readiness, production readiness review.

## 5. Rules that stay in force

Frozen EVAL/HOLDOUT/TEST sets are not modified or tuned on; hashes are re-checked at the end. Mock tests are never reported as real integration tests. Sinhala is not called production-ready without native review. Browser automation stays off by default and off in production until the security review passes. Model experiments never run on the live shopper server.
