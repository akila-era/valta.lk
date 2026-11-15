# Production readiness report (Phase 8)

Date: 2026-11-14. Written for: the project owner. This is a readiness assessment. **It is not a deployment and no production rollout was executed.** Metrics from different evidence types are kept apart and never merged into one score.

## 1. Verdict

**Not ready for a full customer-facing release. Ready to continue in private, and ready for a limited scope once one live defect and the price data are fixed.** The engineering is in good shape for what it does; the blockers are a live rate-limit defect, the shop's data, unreviewed Sinhala, no private staging run, and no alerting.

## 2. Readiness by area

| Area | Status | Evidence | Blocking? |
|---|---|---|---|
| Natural multilingual conversation | Good on author-written tests | Conversation sets (DEV 100% tuned; frozen HOLDOUT 95.8% first run); browser tests | No, but unproven on real shoppers |
| Intent and context | Good | 253 multi-turn turns; context retention 100% (held out: 31/31); intent 88.6% on first held-out run, regressions fixed | No |
| Product discovery on the real catalogue | Works mechanically; **results are not meaningful** | Real snapshot probe: duplicates, mis-filed products, placeholder prices | **Yes: data** |
| Recommendation by specification | **Not possible** | 0 of 7 products have RAM, camera, battery or processor | **Yes: data** |
| Verified price and stock | Mechanism verified (every card field re-derived); **price values themselves look like placeholders** | Verifier tests; audit | **Yes: data** |
| Comparison | Works on existing fields; duplicates force a question | Tests; probe | Partly |
| Follow-up questions | One at a time, capped, not repeated | Policy tests | No |
| Error recovery | Plain error and retry; fixed templates | Browser test | No |
| Human escalation | Hands off to Track order and checkout pages only; no live human channel | Code | Decision needed |
| Model readiness | **No candidate qualifies**; production stays Qwen3-1.7B | `VOLTA_AI_MODEL_SELECTION_REPORT.md` | No (the router carries the load) |
| Security | No Critical; **one High live**; Mediums partly fixed locally | `VOLTA_AI_SECURITY_FINAL_REVIEW.md`, `VOLTA_STAGING_SECURITY_REPORT.md` | **Yes: F-A in production** |
| Operations | Health checks and runbook exist; **no alerting**, no rehearsed rollback, backups of the website database unverified | `VOLTA_AI_OPERATIONS_RUNBOOK.md` | **Yes: alerting** |
| Customer experience (Sinhala) | **Unreviewed by natives** | `VOLTA_AI_CUSTOMER_EXPERIENCE_REPORT.md` | **Yes** |
| Private staging | Designed, script reviewed and corrected, **never executed** | `VOLTA_PRIVATE_AGENT_*` documents | **Yes** |

## 3. Evidence kept separate

| Kind | Result |
|---|---|
| Unit and integration tests (executed 2026-11-14) | Agent 1,299 passed / 3 skipped; website 387 passed; TypeScript clean |
| DEV scenario set (tuned on) | 108 scenarios, 145 turns: relevance 100%, recommendation 100%, hallucination 0%, intent 97.3% (one known miss) |
| Frozen EVAL (never tuned on) | **First run (the held-out number): intent 88.6%, context 100%, relevance 92.8%, follow-up 97.1%, recommendation 83.3%, tools 93.3%, language 99.1%, hallucination 0%.** Later regression runs are higher and contaminated; do not quote them as held-out |
| Real catalogue (7 records, snapshot) | Four defects found and fixed; behaviour on real data documented; not a quality score |
| Private staging results | **None exist** |
| Human review results | **None exist** |

## 4. Hard conditions before a limited customer scope

1. The live new-conversation cap is fixed (configuration now, code deploy next).
2. Real prices and no duplicate or mis-filed records for the products shown; spec-based and budget advice stay off until the data passes the thresholds.
3. An alert that reaches a person when the assistant is down, and a rehearsed rollback in the correct order.
4. A staging run of the exact bundle that will be deployed.
5. Native Sinhala review of every Sinhala string in use (or Sinhala switched off for customers).
6. The owner's explicit approval of each step.

## 5. What was not done

No production deployment in this assignment, no commit, push or merge, no staging execution, no server or service change, no database migration, no catalogue or model-registry change. The earlier approved deployments of 2026-11-13/14 are described in the master report.
