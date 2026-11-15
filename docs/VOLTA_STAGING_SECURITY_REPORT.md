# Staging security report

Date: 2026-11-14. Written for: the project owner. Companion to the independent review `VOLTA_AI_SECURITY_FINAL_REVIEW.md` (read that for the full findings). Everything marked "tested" was executed locally against the real Agent and website code on an invented catalogue.

## 1. Tested (executed, passing)

| Area | What was tested | Where |
|---|---|---|
| Unauthorized Agent access | No signature, wrong secret, unknown key id, stale timestamp, replayed nonce, a signature moved to another body or path: all 401, pipeline not run | `m7-staging-security.test.ts` |
| Session isolation | One conversation's budget and subject do not shape another's, even from the same address | same |
| Identity isolation | A guest conversation id cannot be taken over by a customer (422); a customer's cannot be read by another customer; a guest never receives order cards | same |
| Input validation | Unknown fields, identity or session in the body, control characters, empty, oversized, bad cart quantity: 422; non-JSON: 400 | same |
| Prompt injection and price manipulation | Fixed refusal, no cards, no tool run | same, plus existing `m1d-injection`, `m1d-sensitive` |
| Addresses in messages | A URL, a web address, localhost or an IP address (including the cloud metadata address) in a message is answered with the fixed "only this website" text; the Agent has no tool that fetches addresses. **New: this was a real gap found by this test** (the sentence around the address started a product search); fixed in the router | same, `router.ts` |
| Relay (website side) | Four GET routes only; orders, customers, writes unreachable; unsigned, replayed, customer-identity and disabled all 404; odd ids, extra query keys and out-of-range limits refused; ERP failures mapped to fixed codes; no secret in any response | `ai-catalogue-relay.test.ts` (9) |
| Contract fail-safe | Unknown version 422; unknown fit codes refused by both the website (502) and the contract; forged reason or trade-off codes (all 16) and forged price or name refused by the verifier; `fit` refused on comparison and accessory cards | `m6-contract-compat.test.ts`, `m7-review-fixes.test.ts` |
| Hostile or oversized website data | A 200,000-character "<" description handled in milliseconds; an endless or oversized relay answer refused; a 300-character name cut to the contract; a product whose id cannot make a valid link is left out | `m7-review-fixes.test.ts` |
| New-conversation limit | The hourly allowance of new conversations is per caller (guest: signed client IP), with a shop-wide ceiling | same |

## 2. Not tested, or not applicable (stated plainly)

| Area | Status |
|---|---|
| **Browser actions and SSRF in the browser worker** | The browser layer is **mock-only** (typed tools, a URL policy with an exact-host allowlist, and a mock driver). No real Playwright driver is integrated for the assistant. The tests that exist prove the policy logic, **not real browser security**. They must not be cited as such |
| File uploads | There is no upload feature in the assistant; nothing to test |
| Tenant isolation | The store is single-tenant (one ERP credential). The relay and Agent keys are per deployment; a cross-tenant test is not meaningful until a second store exists |
| Prompt injection against a **model** | No model ran in these tests. The model chat lane's output filter is pattern-based (finding F-06: some fabricated store claims can pass) |
| Rate-limit behaviour under a real flood, and the website-side limits | Covered by existing unit tests, not by a load test |
| Secrets handling on the servers, logging on the servers | Reviewed in the documents (`VOLTA_PRIVATE_AGENT_SECURITY_REVIEW.md`), not tested. Logs were checked read-only today: they hold request ids, routes, statuses and error codes, not message text |
| Staging isolation (second Agent) | Designed and reviewed; **the script was never executed** |

## 3. Open findings from the independent review that affect a release

| ID | Severity | Status |
|---|---|---|
| F-A: shop-wide cap of **10 new guest conversations per hour** (**live now**: the live Agent's environment does not set `AGENT_NEW_SESSIONS_PER_HOUR`, so the default of 10 applies to all guests together) | **High** | **Fixed locally in code (per caller). The live Agent still has the old behaviour.** Immediate mitigation needs approval: set `AGENT_NEW_SESSIONS_PER_HOUR=200` in the live environment file and restart the Agent; the code fix needs a deploy. Live log so far (24 h): 64 chat answers, 3 timeouts, **0 rate-limit hits** (mostly test traffic) |
| F-04 / F-05: long catalogue fields caused HTTP 500; quadratic regex | Medium | Fixed locally, with regression tests |
| F-02: nested cards never checked for `fit` | Medium | Fixed locally (refused) |
| F-08: unbounded website answer | Medium | Body cap added locally; schema bombs bounded by the strict schemas; **silent truncation of product lists** still open |
| F-09: rollback claim was false | Medium | Documentation corrected (roll the website back first) |
| F-01 / F-03: `fit` recomputation reuses the engine's ranking; facts parsed from descriptions can be wrong | Medium | Open (by design: documented limits) |
| F-06: chat lane and polisher are pattern checks | Medium | Open |
| F-07: no maximum staleness, refresh stampede | Medium | Open |
| F-10 to F-17 | Low / Info | Open, listed in the review |

No Critical finding. **One High finding is live in production until the configuration change or the code deploy is approved.**
