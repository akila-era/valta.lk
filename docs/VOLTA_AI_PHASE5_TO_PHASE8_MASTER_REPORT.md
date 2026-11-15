# VOLTA AI: Phase 5 to Phase 8 master report

Date: 2026-11-14. Written for: the project owner. Evidence over assumption: every number below was produced by a command run in this work, or is attributed to the document that holds it. **Nothing in this assignment was committed, pushed, merged or deployed**, and no server, service, tunnel, DNS, firewall, model or catalogue record was changed by it.

## 1. Executive summary

The conversation and reasoning layers work and are well tested, but **the assistant is not ready for a full customer release**, for reasons that are mostly outside the code: the shop's catalogue (7 products, placeholder-looking prices, a duplicate record, mis-filed products, no specifications), unreviewed Sinhala, no private staging run, and no alerting. An independent review also found **one High defect that is live today**: the Agent allows only **10 new guest conversations per hour for the whole shop**. A code fix exists locally; the immediate mitigation (one environment setting) needs your approval.

Scope honesty: the brief describes about 7,000 products; the real catalogue read through the relay holds **7**. Phase 7 (private website staging) and parts of Phase 8 (human review, model quality, native Sinhala) **could not be completed** because they need servers changes or people; this report says so rather than marking them done.

## 2. Initial repository state

Branch `feature/ai-agent-m1`, last commit before this work `96db7c9` (the earlier approved commits and deploys of 2026-11-13/14: conversation layer, reasoning layer with contract 1.2, real-catalogue fixes, and the live smoke-test fixes). Website worktree branch `feature/ai-widget` at `6898dff`, pushed and deployed that day. Pre-existing uncommitted files kept untouched: the QA control centre (website), `docs/AI_QA_*`, `docs/migration-raw/`, `apps/agent/tests/real/dev-mock-agent.ts`. Test counts supplied in the brief were treated as old evidence and re-run (section 11).

## 3. Phase 5: catalogue data quality

Read-only audit (relay dump plus three database counts): 7 products; categories "apple", "jhhj", "Cables" (a watch), "Mobile Phones", "watch"; prices 1,000 to 1,200 for iPhones; a duplicate "11 pro" with conflicting variants; RAM, camera, battery, processor, compatibility absent; descriptions placeholder; ProductContent: 57 rows but only 1 for a current product, with empty specs; 0 accessory links, 0 promotions. Sub-agent A (Catalogue Data Architect) scored each product (23 to 49.5 of 100, mean 32.2), proposed a category tree and specification schema, and documented the duplicate pair with evidence. Local improvement: the website's published specification rows can now reach the Agent (read-only relay route plus background refresh), which closed the gap that **the real-data Agent had no website content at all**. Documents: `VOLTA_CATALOGUE_QUALITY_REPORT.md`, `VOLTA_CATEGORY_NORMALIZATION_PROPOSAL.md`, `VOLTA_PRODUCT_SPECIFICATION_SCHEMA.md`, `VOLTA_DUPLICATE_VARIANT_AUDIT.md`, `VOLTA_AI_CATALOGUE_INTEGRATION_PLAN.md`, `VOLTA_AI_DATA_READINESS_REPORT.md`, plus `AI_REAL_CATALOGUE_AUDIT.md`. Exit criteria: issues quantified (yes), schema reviewed (proposed, awaiting owner), category mapping documented (yes, human decisions listed), duplicate rules documented (yes), recommendation data contract verified (yes), destructive changes unexecuted (yes).

## 4. Phase 6: private Agent isolation

Sub-agent D reviewed `tools/ops/stage-agent-second-instance.sh` line by line (14 findings; two High: it ran as the **live** user and could read live secrets and signal the live Agent, and it shares Ollama and CPU with live shoppers). The corrected script (separate user `voltastage`, hidden live paths, start-limit, failed-start cleanup, memory and swap caps, preconditions) was adopted into the repository file and syntax-checked with `bash -n`; **it was never executed**. Documents: `VOLTA_PRIVATE_AGENT_ARCHITECTURE.md`, `_SECURITY_REVIEW.md`, `_RESOURCE_PLAN.md`, `_RUNBOOK.md`, `_ROLLBACK.md`. The runbook's signing helper uses the same canonical string as the signer used successfully against the relay today; a first dry run is still step one of the runbook. Execution stays blocked pending your approval.

## 5. Phase 7: private website staging

Built and run as a **local staging simulation**: the real Agent code and the website's real code in a browser on an invented fixture catalogue (12 of 12 browser tests, three runs). **Private staging on the servers was not created** (it needs an AI-server tunnel rule change, a second tunnel and a preview website: all separate approvals). Security tests (8 new, real Agent HTTP surface), contract tests (10), performance (local code path and earlier server measurements). The security tests found one real gap, fixed locally: a message containing a URL or IP address (including the cloud metadata address) started a product search instead of the fixed refusal. Documents: `VOLTA_PRIVATE_STAGING_ARCHITECTURE.md`, `VOLTA_STAGING_INTEGRATION_REPORT.md`, `_SECURITY_REPORT.md`, `_PERFORMANCE_REPORT.md`, `_E2E_REPORT.md`. **Exit criteria not met in full** (staging integration with servers, real catalogue through staging).

## 6. Phase 8: controlled production readiness

Documents: `VOLTA_AI_PRODUCTION_READINESS_REPORT.md`, `VOLTA_AI_SECURITY_FINAL_REVIEW.md` (independent), `VOLTA_AI_MODEL_SELECTION_REPORT.md`, `VOLTA_AI_CUSTOMER_EXPERIENCE_REPORT.md`, `VOLTA_AI_ROLLOUT_PLAN.md`, `VOLTA_AI_OPERATIONS_RUNBOOK.md`, `VOLTA_AI_FINAL_ACCEPTANCE_CHECKLIST.md`. Verdict: not ready for a full release; limited scope only after the live defect and the prices are fixed.

## 7. Architecture changes made in this assignment (all local, uncommitted)

- Per-caller (guest address or customer id) allowance for new conversations plus a shop-wide ceiling.
- Card fields cut to the contract's limits; products that cannot make a valid link are skipped; text is bounded before any pattern runs; the website answer size is capped at 3 MB.
- The verifier refuses `fit` on nested (comparison, accessory) cards, and compares truncated names consistently.
- Messages with a web or IP address get the fixed "only this website" refusal.
- Website content relay route and live site data (specification rows).
- The reviewed staging script.

## 8. Files modified in this assignment

Agent: `src/backend/{cards,catalogue,site-transport}.ts`, `src/backend/live-site-data.ts` (new), `src/http/server.ts`, `src/router/router.ts`, `src/security/rate-limit.ts`, `src/verify/verifier.ts`, `tests/real/preview-agent.ts`; new tests `tests/integration/m7-{live-site-data,review-fixes,staging-security}.test.ts`. Website (`apps/web`): `src/lib/erp/content-overlay.ts`, `src/app/api/internal/ai/erp/[...path]/route.ts`, `tests/unit/ai-catalogue-relay.test.ts`. Tools: `tools/ops/stage-agent-second-instance.sh`. Docs: 25 new documents under `docs/` (the VOLTA_* set listed above) and a correction to `AI_CONTRACT_COMPATIBILITY_REPORT.md`. Earlier in the same day, and already committed: `7b85c7c`, `6898dff` (website) and `6fb4dce`, `9253b78`, `babc75c`, `96db7c9` (Agent and docs). No frozen benchmark file was touched.

## 9. Database and migration impact

None. No migration was written or run; no database was written to. Three read-only counts were taken on the website database earlier in the day (ProductContent rows, accessory links, promotions). The specification schema and category proposals are proposals only.

## 10. Security review (summary)

Independent reviewer (Agent F) read the code: **0 Critical, 1 High, 9 Medium, 7 Low, 1 Low/Info, 1 Info**. Isolation holds (session keys use the signed identity; the relay cannot reach orders or writes). Fixed locally: F-A (High), F-02, F-04, F-05, F-08 (body cap), F-09 (documentation). Open: F-01 and F-03 (the `fit` recomputation reuses the engine's ranking and cannot know a parsed fact is wrong), F-06 (the chat lane's filter is pattern based), F-07 (no maximum staleness, refresh stampede), the Low findings. The review also corrected a false statement in my earlier compatibility report (rollback in both directions). The browser layer is mock-only and was **not** tested as real browser security.

## 11. Test results (executed 2026-11-14)

| Suite | Result |
|---|---|
| Agent unit and integration | **1,299 passed, 3 skipped** (manual recorders), 63 files |
| Website unit and route | **387 passed**, 28 files |
| TypeScript, both packages | clean |
| Playwright, real Agent (local stack) | 12/12, three runs |
| Playwright, original fake-Agent assistant specs | 30 passed (before the later Agent-only fixes) |
| Contract 1.0/1.1/1.2 over HTTP | 10 passed |
| Staging security (real Agent HTTP) | 8 passed |
| Review-fix regressions | 7 passed |
| Frozen EVAL | file hash unchanged; held-out first run recorded (intent 88.6%, recommendation 83.3%, hallucination 0%) |
| Not run | Server-side load or concurrency tests; model quality tests; anything against private staging; native review |

## 12. Model comparison

No candidate qualifies. Qwen3.5-4B: about 3.5 GB RAM, 4.4 to 6.8 tokens/s, tool-choice 54.3% on a simplified harness with a **32-second median call**; Gemma 4 E4B stopped early by the safety limit; Qwen3.5-9B incomplete and stopped to protect live traffic; none tested for Sinhala quality, reasoning, coding, vision or audio. Production stays Qwen3-1.7B; registry approvals unchanged (`VOLTA_AI_MODEL_SELECTION_REPORT.md`).

## 13. Catalogue quality

Section 3 and `VOLTA_CATALOGUE_QUALITY_REPORT.md`: 7 products, mean quality score 32.2 of 100 under a six-part rubric, none ready for AI recommendations. Re-audit the full catalogue with the same method.

## 14. Customer experience evaluation

Behaviour is sound on author-written scenarios (253 turns, 0 hallucinations, context retention 100%). **No native Sinhala review exists**, so no quality claim for Sinhala or Singlish; no real-shopper data; no visual review; no human escalation channel (`VOLTA_AI_CUSTOMER_EXPERIENCE_REPORT.md`).

## 15. Known limitations

The assistant composes replies from fixed fragments (safe, less conversational); specification ranking depends on data that does not exist; the verifier's `fit` check is not an independent second implementation; the ranking considers up to 30 matches; context is in memory for 30 minutes; the production entry point is the preview entry; the pre-existing normalisation rule that joins "puluwan da" into "puluwanda" contains stray control characters and never fires (found while fixing another file; left unchanged because changing it alters routing of previously measured sets).

## 16. Unresolved blockers

1. The live new-conversation cap (High, F-A).
2. Placeholder prices and mis-filed or duplicate products.
3. No specification data and no accessory links.
4. No private staging run; the staging script has never been executed.
5. No native Sinhala review.
6. No alerting; website database backup unverified.
7. Credentials pasted in chat earlier are not rotated; the temporary migration key is still installed on both servers.

## 17. Rollback readiness

Documented in `VOLTA_AI_OPERATIONS_RUNBOOK.md` and corrected for order: **website first, then Agent.** Rollback artefacts exist (website images `volta/web:rollback-20261113-1619` and `-1911`; Agent bundles `.bak-before-real-catalogue` and `.bak-before-m5`). A full rollback was **not rehearsed**.

## 18. Production-readiness recommendation

Do not release to customers broadly. In order: (1) approve the live cap setting and then the deploy of the local fixes; (2) repair the catalogue data and decide where specifications live; (3) approve the staging run and the native Sinhala review; (4) add alerting; (5) then a small controlled beta limited to what the data supports (`VOLTA_AI_ROLLOUT_PLAN.md`).

## 19. Explicit approvals still required

Commit and merge of the uncommitted work; deploying the local fixes and the content relay; the live `AGENT_NEW_SESSIONS_PER_HOUR` change; executing the staging script; tunnel, sshd or firewall changes and a staging website; any rollout stage; any database migration or catalogue edit; any model or registry change; rotating the exposed credentials and removing the temporary migration key.
