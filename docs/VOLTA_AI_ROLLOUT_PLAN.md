# Controlled rollout plan (a proposal: nothing is executed)

Date: 2026-11-14. Written for: the project owner. **Today's state:** the assistant is already **public** on valta.hexalyte.com (the owner made the button public earlier) and the new AI server is serving it. This plan therefore starts by closing the gaps in what is already live, and then proposes stages for widening and for adding the recommendation features. Every stage needs the owner's explicit approval; the numbers are proposals to be confirmed.

## 0. Before any further widening (blocking items)

| Item | Why | Owner action |
|---|---|---|
| New-conversation cap: the live Agent allows **10 new guest conversations per hour for the whole shop** | Review finding F-A (High): normal traffic or one script exhausts it | Approve `AGENT_NEW_SESSIONS_PER_HOUR=200` in the live Agent environment now, and deploy the per-caller code fix |
| Data: placeholder prices, duplicate and mis-filed products, no specifications | The assistant would present them confidently | Fix the data (see the data readiness report) or hide spec/budget features |
| Native Sinhala review | The review flag is on; nothing may be called production Sinhala | Arrange reviewers |
| Alerting | Nothing pages anyone when the assistant is down | Wire an external uptime check and the volta-health WARN lines |

## 1. Stages

| Stage | Who | Entry gate | Success metrics (proposed) | Failure thresholds and rollback triggers |
|---|---|---|---|---|
| 1. Internal testing | The team, on private staging | Staging approved and built; staging security and E2E green | No verifier rejections; every scripted scenario passes; no unsafe answer found | Any wrong price or stock shown; any private data in a reply; unsafe refusal missed |
| 2. Private staging with real catalogue | Team plus 3 to 5 invited testers | Data thresholds D1 to D8 met for the categories under test | Hallucination 0 in reviewed transcripts; median reply under 2 s without the model, 95th percentile under 10 s with it; fewer than 2% error responses | Hallucination found; error rate above 5% over an hour; 95th percentile above 20 s |
| 3. Small controlled beta | 5% of visitors (or invited customers), recommendations limited to categories that pass the data gate | Native Sinhala review signed off for the wording in use; operations runbook rehearsed | Customer-facing "wrong answer" reports under 1 per 200 conversations; handoff to checkout works; no security incident | Any security incident; two confirmed wrong-price or wrong-stock answers; error rate above 5% for 15 minutes; CPU saturated or memory below 1 GB for 10 minutes |
| 4. Limited customer rollout | 25% | Stage 3 held for two weeks | Same, plus conversion not worse than the control | Same thresholds; or conversion worse than the control by more than the agreed margin |
| 5. Gradual expansion | 50%, then 100% | Stage 4 held for two weeks, an updated data audit, a fresh independent evaluation on real, anonymised conversations | Same | Same |

Each stage keeps the previous stage's rollback: reverting the website image and tunnel target, never the Agent first (see the operations runbook, section on rollback order).

## 2. Monitoring required at every stage

Agent health and error counts (`/v1/metrics`, journal), verifier rejection count, 429 and 503 counts, reply latency percentiles, host memory and swap (the volta-health timer), model queue depth, website 5xx on `/api/assistant/chat`, a daily sample review of transcripts (with consent and privacy rules), and the catalogue relay's 4xx and 5xx.

## 3. Owner approvals still required

Executing the staging script; the tunnel and website changes for staging; each rollout stage; the live configuration change for the cap; the deployment of the local fixes; any database migration or catalogue change; any model change; committing and merging the uncommitted work.
