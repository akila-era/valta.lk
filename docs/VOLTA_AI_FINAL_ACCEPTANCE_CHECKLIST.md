# Final acceptance checklist

Date: 2026-11-14. Written for: the project owner. "Evidence" cites a document or a command that was run. An unticked box is not a failure of the engineering work; it is a condition still to be met or an approval still to be given.

## A. Engineering evidence (met)

- [x] Agent tests pass: 1,299 passed, 3 skipped (run 2026-11-14).
- [x] Website tests pass: 387 passed (unit and route).
- [x] TypeScript clean in both packages.
- [x] Real-Agent browser tests pass: 12/12 (three runs).
- [x] Contract 1.0, 1.1 and 1.2 compatible; `fit` only to 1.2; unknown versions refused with 422; unknown reason codes refused.
- [x] The verifier recomputes prices, names, stock and `fit`; all 16 reason and trade-off codes were forged one by one and refused; nested cards cannot carry `fit`.
- [x] Frozen HOLDOUT and EVAL files unchanged (hashes recorded, tests fail on change); never tuned on.
- [x] No credential in any document written in this work.
- [x] Independent security review done (`VOLTA_AI_SECURITY_FINAL_REVIEW.md`): no Critical, one High, nine Medium, seven Low, one Low/Info and one Info (counted from the review's own headings).

## B. Security (open items)

- [ ] **High F-A fixed in production**: the live Agent still caps new guest conversations at 10 per hour for the whole shop. Local code fix exists; the configuration change (`AGENT_NEW_SESSIONS_PER_HOUR=200`) and the code deploy both need approval.
- [ ] Medium findings F-01, F-03, F-06, F-07 closed or accepted in writing by the owner (F-02, F-04, F-05, F-08 body cap, F-09 doc fixed locally and not deployed).
- [ ] Real browser worker security tested (the browser layer is mock-only; there is no real driver in the assistant).
- [ ] Staging isolation script executed and reviewed on the server (never executed).
- [ ] Credentials exposed in chat rotated; temporary migration key removed.

## C. Data (all open)

- [ ] D1 real prices; D2 no duplicate conflicting records; D3 categories correct; D4 identifying names; D6 specification coverage; D7 accessory links; D8 real descriptions (`VOLTA_AI_DATA_READINESS_REPORT.md`).
- [ ] The decision on the specification source, and deployment of the content relay (built locally, not deployed).
- [ ] A re-audit on the full real catalogue (the audited catalogue had 7 products, not about 7,000).

## D. Models

- [ ] Quality evaluation of Qwen3.5-4B, Gemma 4 E4B and Qwen3.5-9B beyond tool choice, with native Sinhala review (not done; only RAM, speed and a partial tool-choice number exist).
- [x] Production model unchanged (Qwen3-1.7B); registry approvals unchanged.

## E. Customer experience

- [ ] Native Sinhala review signed off by named reviewers.
- [ ] Real-conversation trial with the team; an independent evaluation set from real, consented conversations.
- [ ] A decision on human escalation.
- [ ] Visual review of cards and chips on phone and desktop (no screenshots were reviewed).

## F. Operations

- [ ] Alerting and an external uptime check wired.
- [ ] Rollback rehearsed end to end in the correct order (website first, then Agent).
- [ ] Website database backup and restore verified.
- [ ] Production entry point moved into `src/` (the live Agent runs from the preview entry).
- [ ] Private staging built and a staging run completed (`VOLTA_PRIVATE_AGENT_RUNBOOK.md`; never run).

## G. Approvals still required from the owner

Committing and merging the uncommitted work; deploying the fixes; the live configuration change; running the staging script; tunnel, firewall or website changes for staging; each rollout stage; any database migration or catalogue change; any model change.

## Verdict

**Not accepted for a full customer launch.** Accepted for continued private work: staging, data repair, native review, and a limited feature scope (conversation, store information and name lookup), once the High finding is closed in production and the prices are real.
