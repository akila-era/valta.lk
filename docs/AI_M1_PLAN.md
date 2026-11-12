# VOLTA.LK AI assistant: proposed M1 implementation plan (mock ERP only)

Date: 2026-11-12
Status: **PROPOSED. NOT APPROVED. No implementation has started.** Nothing in this document has been built, installed, deployed or connected. M0 is still open ([AI_M0_DECISION_RECORD.md](AI_M0_DECISION_RECORD.md)); this plan only becomes work after you approve it explicitly.

Related documents: [AI_AGENT_ARCHITECTURE.md](AI_AGENT_ARCHITECTURE.md) (design), [AI_M0_DECISION_RECORD.md](AI_M0_DECISION_RECORD.md) (decisions and blockers).

Evidence labels: **[repo]** read from this repository, **[verified]** checked on the dev machine or AI server during this project, **[proposed]** my proposal.

---

## 1. Scope and hard rules

### 1.1 What "M1" means here

The owner scoped M1 as everything that can be built and tested **with mock ERP data only**. In the earlier roadmap in the architecture document that is a superset of: old M1 (Agent skeleton), old M2 (tool backends, mock ERP only), old M3 (English path), the *pipeline* part of old M4 (Sinhala routing, **without** shadow mode on real traffic and **without** native review), and the rate-limiting and testing parts of old M6. It **excludes** old M5 (website integration and widget as a deployed feature), any real transport, staging, production, and any claim of Sinhala readiness.

**M1 "done" means: it works against the mock ERP in automated tests. It does not mean production-ready**, and its accuracy numbers say nothing about real shoppers or the real catalogue.

### 1.2 Rules (from the owner, applied to this plan)

1. No server configuration change, no additional package installation, no service deployment, no exposed port, no connection to the production ERP, and **no implementation until approved**.
2. No change to SSH `AllowUsers`, no tunnel user, no WireGuard, no public API.
3. Business facts only from backend tool results; checkout and payment stay explicit customer actions; no direct database access for the assistant.
4. Nothing is committed or pushed. Work would happen on a feature branch (for example `feature/ai-agent-m1`) only after approval.

### 1.3 What this plan itself changed

Only documentation in `docs/`. No server, config or package change was made to produce it. Facts below were read from the repo and from earlier verified work.

---

## 2. Environments and what each can do

| Env | State today | Used for |
|---|---|---|
| **E1: dev machine** (Windows) | Node **v24.12.0**, npm 11.6.2 [verified]. `node_modules` **absent** in the repo, so dependencies are not installed [verified]. No local Ollama [verified]. | All deterministic code, mock ERP, local database, unit/integration tests |
| **E2: AI server** | Node **24.22.3** at `/opt/node/current` [verified]; Ollama 0.40.16 (cloud disabled, localhost only) with Qwen3 1.7B and SinhalaLLM; **no dependencies, no Agent, no service** | Only tests that need a real model |
| Mock ERP | `apps/web/tests/mock-erp/server.ts`, 300 lines, port 4010 [repo]. 15 fictional products (brands Nova, Orbit, Pulse, Volt, Glide, Atlas, Echo; categories Mobile Phones, Audio, Accessories, Wearables, Tablets), variants, a sale price, out-of-stock items, ERP settings with delivery charge 450.00, orders, reservations, and a `/__control` endpoint to inject failures and change prices [repo] | Every tool backend in M1 |
| Local database | The repo has `dev-db` (PGlite, in-process Postgres) [repo]; needs repo dependencies installed | Accessory links, customer accounts and order ownership tests (the mock ERP has no database) |

**Important limit of the mock data:** brands and products are invented (Nova, Orbit, ...), there are no Sri Lankan market names (Samsung and so on), no warranty or spec depth, and no `AccessoryLink` rows. Pipelines can be proven on it; **vocabulary coverage, Sinhala entity extraction accuracy and recommendation quality cannot** (blocked by B2).

### 2.1 How LLM-dependent tests can run (decision D-M1-1)

Most M1 code can be tested with a **fake Ollama** server (deterministic replies, simulated 5 to 7 s model-switch delay, failures). Tests that need a real model:

| Option | Server change | Approval needed | Notes |
|---|---|---|---|
| **A. Fake Ollama + recorded fixtures** (recommended default) | none | none beyond M1 | Covers logic, not model behaviour |
| **B. Transient test run on the AI server** (recommended for the few real-model checks) | none to config. Code is bundled into one file on the dev machine, copied to `/tmp`, run with `/opt/node/current/bin/node`, then deleted. **No `npm install` on the server.** Uses the existing admin SSH key. | Yes: it is a deliberate run on the server, like my earlier test scripts | Used for TST-6, ENG-5, SIN-11 real checks |
| C. SSH local port-forward to Ollama from the dev machine, using the existing admin account | none to config | **Explicit approval**; it is a form of tunnelling and sits close to blocker B3, so I do **not** recommend it | |
| D. Install Ollama on the dev machine | none on server | Approval (package install and ~2.5 GB of models) | Only if you prefer local iteration |

---

## 3. Prerequisites that need approval before any M1 coding

None of these has been done.

| # | Approval | Why it is needed |
|---|---|---|
| P1 | Run `npm ci` in the repo on the dev machine | `node_modules` is absent [verified]. This installs the **existing locked** dependencies (Next, Prisma, Zod, Vitest, tsx, PGlite...) and is required to run even the existing mock ERP and tests. It is a package installation, so it needs your explicit yes |
| P2 | New workspace `apps/agent` (and its dependencies) | New code and, possibly, new dependencies. Proposal: keep runtime dependencies minimal (Zod, already used in the repo, plus `node:http` or one small HTTP framework). Choose by measured RSS, not preference |
| P3 | Permission to add the internal tool routes in `apps/web` on a feature branch | It changes website source code (not a running service). Needed for PRD-3 |
| P4 | Choice of LLM-test option (section 2.1) | |
| P5 | Commit policy | Default: **no commits** until you say so |

---

## 4. Task list

Legend for **Runs**: **L** = dev machine only, mock ERP / fake services, no network integration. **L+DB** = needs the local PGlite database (part of P1). **LLM-S** = needs a real model on the AI server (option B, transient run). **BLOCKED(Bx)** = cannot be finished or enabled until that blocker is resolved (the code may still be written). Effort is relative (S small, M medium, L large); I am not giving calendar estimates.

### 4.1 Agent API foundation (FND)

| ID | Task | Runs | Size |
|---|---|---|---|
| FND-1 | Scaffold `apps/agent`: strict TypeScript, ESM, Node 24 target, Vitest, lint, typecheck | L | S |
| FND-2 | Config loader: Zod env schema, fail-fast, **no defaults for secrets**, `.env.example` with names only | L | S |
| FND-3 | Shared contract module: Zod schemas for chat request/response, cards, client actions, errors, with a version field; JSON-schema export for docs and the later website side | L | M |
| FND-4 | Service auth: HMAC sign/verify, key-id rotation, nonce replay cache, 60 s clock skew, known-answer test vectors | L | M |
| FND-5 | HTTP server: `/v1/chat`, `/v1/chat/stream` (SSE), `/v1/health`; body and time limits; graceful shutdown; the repo's error envelope | L | M |
| FND-6 | Ollama client and model manager: allow-list of exactly the two model tags, fixed `num_ctx` 2048, `num_predict` caps, cloud/remote model names rejected | L (fake Ollama); real check LLM-S | M |
| FND-7 | Single-slot queue with model-affinity scheduling, deadlines, queue-full, degraded (template-only) mode | L (fake Ollama simulating the measured 5 to 7 s switch) | L |
| FND-8 | In-memory session state (LRU 300, TTL 30 min), keyed by (identity, sessionId); no persistence | L | S |
| FND-9 | Tool-runner framework: registry, `.strict()` Zod validation, permission matrix (guest / customer), per-call timeout, at most 3 calls per turn, parallel reads only | L | M |
| FND-10 | Flags: `AI_ASSISTANT_ENABLED` kill switch and `AI_CHALLENGE_MODE=off` hook | L | S |

### 4.2 Sinhala intent routing (SIN)

All of this is **deterministic code**. No model is used to decide a tool for Sinhala input.

| ID | Task | Runs | Size |
|---|---|---|---|
| SIN-1 | Normaliser: Unicode NFC, ZWJ/ZWNJ variants, digit mapping, repeated-character collapse, control and bidi-character stripping; amount parser (`100,000`, `100k`, `1.5 lakh`, Sinhala number words) | L | M |
| SIN-2 | Script/language detector: `si`, `si-latin` (Singlish), `mixed`, `en` | L | S |
| SIN-3 | Safety pre-filter (injection, instruction-override, price-manipulation patterns in Sinhala, Singlish and English) and **sensitive-input guard** (Luhn-valid card numbers, password/OTP/CVV cues, national ID formats): refuse, never retain | L | M |
| SIN-4 | Lexicon format and loader: versioned data files for intent words, negation, question forms, category words, colours, storage sizes, Singlish spellings. Initial content is **provisional**, drafted by engineers and flagged `needs-native-review` | L; content approval **BLOCKED(B5)** | M |
| SIN-5 | Intent scorer with margin and thresholds; abstain means a clarification, never a guess | L | M |
| SIN-6 | Entity extractor against the catalogue vocabulary (brand, model, category, budget, quantity, colour, storage; fuzzy Latin matching). In M1 the vocabulary is the **mock** one | L; real vocabulary **BLOCKED(B2)** | L |
| SIN-7 | Referent resolution (page context, last-shown product) and the clarification state machine | L | M |
| SIN-8 | Templated reply and clarification library (Sinhala, Singlish, English), wording **provisional**, flagged `needs-native-review` | L; wording approval **BLOCKED(B5)** | M |
| SIN-9 | Router evaluation harness: confusion matrix, abstain rate, per-script and per-tag breakdown, run on a **developer smoke set** that is explicitly *non-evaluative* and uses mock vocabulary | L | M |
| SIN-10 | Shadow-mode **interface only** (decision logging off by default, stub sink). No real traffic exists | L; activation **BLOCKED(B1, B6)** | S |
| SIN-11 | SinhalaLLM polish adapter: prompt shape, token caps, no system prompt (per its model card), verifier hook, skip-under-load | L (fake LLM); real check LLM-S | M |

### 4.3 English tool-calling (ENG)

| ID | Task | Runs | Size |
|---|---|---|---|
| ENG-1 | Generate the Qwen tool schemas from the Zod tool registry (single source of truth) | L | S |
| ENG-2 | English turn pipeline: call, parse `tool_calls`, strict validation, permission check, execute, build cards, write prose from a fact sheet | L (fake LLM) | L |
| ENG-3 | Guardrails: reject unknown tools and extra arguments, range clamps, at most 3 calls, repeated-call de-duplication, retry-once-then-clarify | L | M |
| ENG-4 | Injection test pack: direct and indirect (hostile text inside product names, descriptions and tool results) | L | M |
| ENG-5 | Real-Qwen evaluation: 100 English prompts on the mock catalogue (tool choice, arguments, timing). Only one tool call has been tested so far [verified] | LLM-S | M |
| ENG-6 | Language handoff rule: Sinhala-script input is never routed by Qwen | L | S |

### 4.4 Product search and comparison (PRD)

| ID | Task | Runs | Size |
|---|---|---|---|
| PRD-1 | `ToolBackend` interface and an in-process `MockBackend` over the mock-ERP fixtures | L | M |
| PRD-2 | `VoltaBackend` HTTP client (HMAC, timeouts, retries only for idempotent reads) | L against a local Next dev server and the mock ERP; real transport **BLOCKED(B1, B3)**, real ERP **BLOCKED(B2)** | M |
| PRD-3 | Website internal routes `/api/internal/ai/*` in `apps/web` (search, details, compare, check-stock, accessories, cart-quote, cart-validate, vocab, order-status): HMAC verified, 404 when the secret is unset, strict Zod, reuse the existing `lib/` functions. Requires reading `node_modules/next/dist/docs` first, as `apps/web/AGENTS.md` instructs [repo] | L (needs P1, P3) | L |
| PRD-4 | `search_products`: budget (min/max), in-stock, on-sale, brand, category, sort, limit up to 8 | L | M |
| PRD-5 | `get_product_details` (plain-text, only fields the backend provides) and `compare_products` (differences computed in code, 2 to 3 products) | L | M |
| PRD-6 | `check_stock` (live availability, can-fulfil for a quantity) and `get_accessories` (explicit links only) | L+DB | M |
| PRD-7 | `get_cart`: revalidate the browser snapshot, quote, delivery charge shown **only** when a live settings read succeeds | L | M |
| PRD-8 | Cart proposals (`add`, `update quantity`, `remove`) returning client actions with an `actionId`; variant-required rule, quantity 1 to 10, live availability | L | M |
| PRD-9 | `get_order_status`: **signed-in customer only**, own orders only, privacy-filtered; guests are pointed to `/track-order` | L+DB; real flows **BLOCKED(B2, B3)** | M |
| PRD-10 | Card builders and server-side money formatting | L | S |
| PRD-11 | Failure-mode suite through the mock ERP's `/__control`: ERP down, slow, price changed, out of stock, store disabled | L | M |

### 4.5 Response verification (VER)

| ID | Task | Runs | Size |
|---|---|---|---|
| VER-1 | Fact-sheet builder (labels only; no prices or specs ever reach a model) | L | S |
| VER-2 | Allow-list builder from tool results (numbers, currency, names, URLs) | L | M |
| VER-3 | Output verifier: unlisted numbers, prices, percentages, URLs and emails; unlisted product or brand names; deny-list words without a backing field; wrong script; repetition ratio; truncation; empty output. On any failure, fall back to the template | L | L |
| VER-4 | Negative corpus: the real bad outputs seen in the Sinhala evaluation (repetition loop, invented iPhone models, invented spec ranges, refusal-then-list) plus synthetic fabrications; fuzz and property tests ("no unlisted fact can pass") | L | M |
| VER-5 | Template renderer for facts (Sinhala, English) | L; wording approval **BLOCKED(B5)** | M |
| VER-6 | Degraded-mode path (template-only reply) tests | L | S |

### 4.6 Guest security and rate limiting (SEC)

| ID | Task | Runs | Size |
|---|---|---|---|
| SEC-1 | Rate limiter module (token bucket per IP+session, per customer, global in-flight), unit tests with a fake clock | L | M |
| SEC-2 | Guest policy: stricter limits, one in-flight request per session, message at most 800 characters, body at most 20 KB, cart at most 20 lines | L | S |
| SEC-3 | Cooldown and back-off after repeated rejected inputs; queue priority for signed-in traffic | L | M |
| SEC-4 | Provider-neutral `verifyChallenge` interface, `CHALLENGE_REQUIRED` path (mode `off`); **no provider, nothing purchased** | L | S |
| SEC-5 | Identity-claim handling (`anon` / `cust:<id>`): trust only the signed header; replay and skew tests | L | S |
| SEC-6 | Abuse suite: flood, oversized and malformed JSON, SSE disconnect mid-stream, replayed signatures, forged identity, header smuggling | L | M |
| SEC-7 | Never-log enforcement (property test over the log sink) and redaction utilities (phones, emails, order references, long digit runs, national IDs) | L | M |
| SEC-8 | Consent-claim plumbing (`retain=none|redacted`), **present but disabled**: no storage code path is active | L; activation **BLOCKED(B6)** | S |

### 4.7 Testing and observability (TST)

| ID | Task | Runs | Size |
|---|---|---|---|
| TST-1 | Conventions: Vitest for the agent, reuse the repo's pattern of spawning the mock ERP and resetting it per test [repo] | L | S |
| TST-2 | Fake Ollama server: configurable latency, switch delay, failures, malformed tool calls, oversized outputs | L | M |
| TST-3 | Contract tests: schemas shared by agent and website side; golden request/response fixtures | L | M |
| TST-4 | Queue and scheduler simulation tests (affinity, starvation bound, deadlines, overflow) | L | M |
| TST-5 | Local end-to-end: message to router to tools (mock ERP) to verified reply, for Sinhala, Singlish, English and mixed input | L | L |
| TST-6 | Server measurement runs (transient, option B): Agent bundle RSS (bare Node 24 was 47 MB idle and 88 MB after load [verified]; the real figure is unmeasured), real model-switch p95, 50-job mixed queue soak, OOM check | LLM-S | M |
| TST-7 | Observability: structured logs and an internal `/v1/metrics` JSON (queue depth, loaded model, switch count, latency percentiles, verifier-reject rate, degraded rate, rate-limit hits). No Prometheus or Grafana | L | M |
| TST-8 | Test-data policy: **developer smoke set** (non-evaluative, mock vocabulary) kept strictly apart from the real dev and test sets, which only the native-speaker process may create | L; real sets **BLOCKED(B5)** | S |

---

## 5. What can run locally without any network integration

Everything marked **L** or **L+DB** can be built and tested on the dev machine with the mock ERP, a fake Ollama and the local PGlite database, with **no AI-server involvement, no tunnel, no website host and no ERP of any kind beyond the local mock**. That is the whole of: FND-1 to FND-5, FND-7 to FND-10, FND-6 (fake Ollama), SIN-1 to SIN-3, SIN-5 to SIN-7, SIN-9, SIN-11 (fake LLM), ENG-1 to ENG-4 and ENG-6, PRD-1, PRD-3 to PRD-8, PRD-10, PRD-11, VER-1 to VER-4 and VER-6, SEC-1 to SEC-7, TST-1 to TST-5, TST-7, plus the code (not activation) of SIN-4, SIN-8, SIN-10, SEC-8 and VER-5.

Prerequisites for that: approvals P1 to P5 (section 3). Without P1 nothing can run, because dependencies are not installed.

Needs the AI server but **no network integration**: TST-6, ENG-5, the real-model parts of FND-6 and SIN-11, via option B only (needs your approval of the transient run).

Suggested order (dependencies): FND-1 to FND-5 and TST-1/TST-2, then FND-9 and PRD-1, then PRD-3 to PRD-8 with PRD-10, then VER-1 to VER-3, SEC-1 to SEC-5, then ENG-1 to ENG-3 and SIN-1 to SIN-3, SIN-5 to SIN-7, then FND-6/FND-7, VER-4 to VER-6, SEC-6 to SEC-7, TST-3 to TST-5 and TST-7, and last the LLM-S runs.

---

## 6. Tasks blocked by B1, B2, B3, B5 and B6

| Blocker | What it blocks (code may still be written where noted) |
|---|---|
| **B1** website host and egress IP not confirmed | The BFF-to-Agent transport (SSH tunnel for staging, WireGuard for production); the UFW source rule; PRD-2 over a real transport; the website BFF routes and widget as an integrated feature (old M5: the code can be drafted, not integrated); correct client-IP and `X-Forwarded-For` handling behind the real proxy chain (rate limits depend on it); the serverless-host fallback decision; SIN-10 shadow mode on real traffic |
| **B2** staging ERP not confirmed | Any real-ERP contract check (the integration has never run on a real ERP [repo]); the **real** catalogue vocabulary for SIN-4/SIN-6 (brands, models, categories, colloquial names); real specs and warranty fields; PRD-9 against real orders; real delivery-charge and promotion behaviour; any evaluation with realistic product data; staging end-to-end. Also: the production ERP is never used |
| **B3** network-change approvals not given | Tunnel user and `AllowUsers` change; WireGuard package, port and UFW rule; the production Agent bind address; secret generation and storage for the HMAC keys and tunnel key; any Agent service deployment that needs a user or unit file (separate approval); PRD-2 tests over real transport; TST-6 only needs option B and is **not** blocked by B3 |
| **B5** native Sinhala reviewers not named | Real dev and test datasets (SIN-9 can only use the developer smoke set, TST-8); approval of the lexicon (SIN-4) and of all Sinhala and Singlish wording (SIN-8, VER-5); the generation-review rubric and gates S1 to S6; any statement that Sinhala is production-ready. M1 outputs for Sinhala stay "provisional, mock vocabulary, staff-only" |
| **B6** legal and privacy review pending | Activating any storage of customer text (SEC-8, SIN-10 sinks), the consent UI text, retention and deletion jobs, real-traffic shadow mode, privacy-policy changes, and any production launch. In M1 the consent plumbing exists but no storage path is enabled |

Not blocking M1 coding but needed before real traffic: **B9** (root password reset, kernel `7.0.0-43` maintenance window). **B4, B7, B8** are resolved.

---

## 7. What M1 cannot prove

- Anything about real shoppers, real Sinhala usage or real catalogue vocabulary (mock data is invented and English-only).
- Sinhala routing accuracy. Smoke-set numbers are developer-authored and in-sample by construction, like the earlier 25-utterance experiment.
- Behaviour against a live ERP, real latency, or real freshness of stock and price.
- Production capacity: LLM turns are estimated at roughly 10 to 25 s each on this CPU, so about 2 to 6 LLM-bearing turns per minute for the whole server [estimate from measured speeds]. TST-6 measures it, it does not change it.
- Real-transport reliability (tunnel flaps, WireGuard), real proxy headers, or abuse patterns from the internet.

---

## 8. Proposed definition of done for M1 (mock only)

1. All **L**, **L+DB** and approved **LLM-S** tasks in section 4 are complete and their tests pass in one command on the dev machine (and the LLM-S tests on the AI server).
2. Contract: request, response, card and action schemas are versioned and covered by golden fixtures; unknown fields and tools are rejected.
3. Every tool has tests for the happy path, invalid arguments, a guest where a customer is required, and ERP failure (down, slow, price changed, out of stock).
4. **Zero** unlisted number, price, product name or promotion passes the verifier in the fuzz and negative-corpus tests; the Phase 4.1 bad outputs are all rejected.
5. Injection pack: no tool call, price, discount or order effect results from any of the tested attack prompts; the pre-filter rejects the Sinhala, Singlish and English cases in the pack.
6. Guest limits and the abuse suite behave as specified; logs contain no message text, PII or secrets by default (property test).
7. Queue simulation: model affinity works, no starvation beyond the bound, overflow returns `QUEUE_FULL` with `Retry-After`; degraded mode returns a correct template reply.
8. Transient server run (if approved): measured Agent RSS, model-switch p95, 50-job soak with **0 OOM events** and memory within the budget in the architecture document.
9. Every Sinhala string and lexicon entry is tagged `needs-native-review`, and the build refuses to mark Sinhala as "production" while any such tag remains.
10. A written M1 report listing what was proven, what is blocked, and that no real ERP, real traffic, port, tunnel or user was involved.

---

## 9. Proposed repository footprint (not created)

```
apps/agent/                      new workspace, Node 24, no Next.js dependency
  src/{server,auth,queue,ollama,router/{sinhala,english},tools,verify,templates,security,observability}/
  data/lexicon/                  provisional lexicon files, tagged needs-native-review
  tests/{unit,integration,fixtures,fake-ollama}/
apps/web/src/app/api/internal/ai/*   new internal tool routes (PRD-3), 404 when the secret is unset
apps/web/tests/...                   tests for those routes, using the existing mock ERP pattern
docs/                                this plan, plus an M1 report when done
```
Branch `feature/ai-agent-m1` (proposed). No commit, push or merge without your instruction.

---

## 10. What I need from you to start (nothing starts without it)

1. **Approve P1**: `npm ci` on the dev machine (locked, existing dependencies).
2. **Approve P2**: the `apps/agent` workspace and a minimal dependency policy.
3. **Approve P3**: adding the internal routes in `apps/web` on a feature branch.
4. **Choose D-M1-1**: fake Ollama only, or fake Ollama plus transient server test runs (option B, recommended). Option C is not recommended.
5. **Confirm P5**: no commits until you say so.
6. Optionally name the Sinhala reviewers (B5) and answer Q1 and Q2 (B1, B2) so the blocked groups can be scheduled.
