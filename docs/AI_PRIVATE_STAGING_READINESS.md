# Private staging readiness

Date: 2026-11-14. Written for: the project owner.

Status: **prepared, nothing executed on any server.** No infrastructure was created, no DNS, firewall or sshd setting was changed, nothing is public, the old server, the website tunnel and live traffic were not touched, and nothing was deployed, committed, pushed or merged.

## 1. Is there an existing isolated staging environment?

**No.** What exists:

| Environment | What it is | Usable as staging? |
|---|---|---|
| Website server (46.62.143.151) | Production website, database, ERP connection | No: production |
| New AI server (109.199.108.76) | **Serves live shoppers today** through the website tunnel (the old AI server is unreachable). Runs the Agent bundle of 2026-11-13 (real catalogue through the website relay, before the conversation and reasoning layers) and Ollama with the 1.7B default, the 4B and Gemma/Qwen3.5 candidates installed | No: it is the live service, though a second private instance on it is possible (below) |
| Old AI server (2.29.97.114) | Unreachable; untouched | No |
| A developer machine | Runs the full stack locally (done in this phase) | It is where all tests ran |

Creating a separate staging server would be new infrastructure and needs your approval (not requested here).

## 2. What is verified locally (evidence)

- Agent: **1,278 tests passed**, 3 skipped (manual recorders); type-check clean. Website: **271 unit and route tests passed**, type-check clean.
- Browser: **12 of 12** real-Agent Playwright tests, and the 30 older assistant specs, passed.
- Contract 1.0, 1.1 and 1.2: compatible (`AI_CONTRACT_COMPATIBILITY_REPORT.md`).
- Frozen EVAL benchmark: file unchanged (SHA-256 `2148b65c…`, a test fails on any change); never tuned on. Held-out first run: hallucination 0%, intent 88.6%, recommendation 83.3%. Current regression run (contaminated, for regression only): intent 100%, relevance 98.8%, recommendation 95.8%, hallucination 0%.
- Real catalogue audit done (`AI_REAL_CATALOGUE_AUDIT.md`): four real defects found and fixed, with tests that use invented products.

## 3. What staging needs to answer, and the blockers

| Question | Status |
|---|---|
| Does the new Agent bundle start, answer health, and keep to its memory limit beside the live Agent on the 12 GB server? | Not measured. The server has about 11 GB free with the 1.7B model; a second Agent process is about 100 to 150 MB |
| Does the reasoning layer work on the **real** catalogue data? | Measured on a snapshot: it runs correctly, but the data has no specifications and unreliable categories, so recommendations by camera, battery or memory will honestly say they cannot rank. **This is a data blocker, not a code one** |
| Do the real prices look right? | They look like placeholders (1,000 to 1,200 for iPhones). Not a code issue |
| Is Sinhala wording acceptable? | Not reviewed by native speakers. Blocker for any claim of production Sinhala; the review flag stays on |
| Does it hold under concurrent shoppers on this CPU? | Not measured. The 4B/9B/Gemma benchmarks showed 3 to 7 tokens per second and 30 s median model calls; the router answers most messages without the model |

## 4. Prepared plan: agent-first validation (needs your approval to run)

Script prepared, syntax-checked and **not run**: `tools/ops/stage-agent-second-instance.sh`.

1. Build the new Agent bundle from the reviewed commit; record its SHA-256.
2. On the AI server, as root: `stage-agent-second-instance.sh start /tmp/agent.new.mjs <sha>`. It starts a **second** Agent on **127.0.0.1:8788 only**, with its own environment file (a new signing key, generated there and never printed), the live model and catalogue settings copied by name, `MemoryMax=400M`, low CPU priority, started but **not enabled at boot**. The live Agent, its bundle and unit, Ollama, the tunnel and DNS are not touched; no port is opened and no sshd or firewall rule changes.
3. Validate on the server itself with signed requests to 127.0.0.1:8788 (the repository's `apps/agent/tests/real/remote-smoke.ts` pattern): greetings in three languages, multi-turn shopping, budget retention, references, fit codes, contract 1.1 and 1.2 requests, and the live-information and off-site refusals. The website is not involved, so no shopper can reach it.
4. Check memory, CPU and the journal while it runs; compare answers with the live Agent for the same messages.
5. Stop it: `stage-agent-second-instance.sh stop` (or `remove` to delete only the staging folders).

To test through the website (the full path including the 1.2 cards) a private route is needed (a second tunnel port with its own forward permission on the AI server and a preview-only web container). That changes the AI server's sshd rules and the website server, so it is **a separate approval** and is not prepared as a runnable step here.

## 5. Go and no-go gates for a production rollout (all still open)

| Gate | State |
|---|---|
| Commit, push and deploy approval | **Not given** (nothing done) |
| Real catalogue has prices, categories and identifiable products | **Open (data)** |
| Specification source decided (website rows relayed to the Agent, or ERP fields) | **Open** |
| Native Sinhala review of templates, fit labels and usage words | **Open** |
| Staging run on the AI server (section 4) with no verifier rejections and acceptable memory | **Open** |
| Agent deployed first, website second, previous bundle and image kept for rollback | Plan agreed in the contract report; not executed |
| Production model unchanged (Qwen3 1.7B default; the 4B, Qwen3.5 and Gemma stay experimental) | Holds |

## 6. Recommendation

Run the agent-first staging validation (section 4) when you approve it, and in parallel have the shop owner **fix the catalogue data** (real prices, one record per product, a Phones category, real names, specification rows). Do not deploy the website 1.2 build or call the assistant's recommendations production-ready before both: the code is ready for staging, the data is not ready for recommendations.

## 7. What was not done

No staging run, no deployment, no change to any server, DNS, firewall, tunnel or model. No commit, push or merge. No deletion of data or backups. The frozen EVAL set was not modified and not tuned on.
