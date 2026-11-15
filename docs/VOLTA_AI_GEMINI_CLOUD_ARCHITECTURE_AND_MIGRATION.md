# VOLTA AI 2.0: Gemini cloud architecture and migration plan

Date: 2026-11-14. Written for: the project owner. **This is a planning document. Nothing was implemented, deployed, committed or pushed. No server (including the old AI server) was contacted, no account, key or billing was created, no Gemini API call was made, no customer data was used, and no source, test, configuration or other document was changed to produce it.** Evidence comes from the repository, the documents under `docs/`, the earlier read-only audit evidence (scratchpad `audit\` and `audit2\`), and three research notes written for this plan (`audit4\gemini-facts.md`, `infra-inventory.md`, `api-inventory.md`).

## 0. How to read this document

| Label | Meaning |
|---|---|
| **[V] VERIFIED** | A fact with evidence I can point to (file:line, an audit output, a vendor page as fetched). A vendor-page fact is [V] only "as reported by the fetch tool": see the caveat below |
| **[P] PROPOSED** | My design or recommendation. Nothing exists yet |
| **[A] ASSUMPTION** | A number or condition I had to assume; the basis is stated |
| **[U] UNKNOWN** | No evidence; what would establish it is stated |
| **[D] DECISION-NEEDED** | The owner must decide; a recommended option is given |

**Caveat on every Gemini fact.** The vendor pages were read through a fetch tool that passes each page through a small summarising model; the raw pages were not seen, several pages showed no "last updated" date, and the documentation site moved from `ai.google.dev` to `aistudio.google.com`. Prices, terms and billing rules **must be re-read by a person on the official pages before any spending decision** [V for the caveat itself, `gemini-facts.md` header].

**Caveat on dates.** Everything is as of 2026-11-14. Model names, prices and terms changed repeatedly in the months before this date and have scheduled changes ahead (section 14.1).

### 0.1 Reconciling this brief with the owner's earlier conditions

| Earlier condition (owner, this project) | This brief | How this plan treats it |
|---|---|---|
| "Do not select or connect a hosted provider until I approve the provider, privacy policy, cost and customer-data handling" | Makes Gemini the target provider and asks for the VPS to be eliminated | **[P] The brief is treated as approval of the DIRECTION only.** No key, account, billing, hosted call or customer-data flow is authorised by it. Each is a separate approval in section 22 |
| Hybrid target: local models for shopping, a hosted model for general questions, external search | Gemini only | **[P] Supersedes the hybrid plan** (section 0.3). Local models become unnecessary, but the deterministic router path stays as the degraded mode (section 6.6) |
| "No customer-message logging for shadow comparisons" | Phase 6 shadow mode | **[P] Shadow runs compare in memory and keep only aggregate counts** (section 16, phase 6) |
| Conversation history architecture prepared, not enabled | Short-term and long-term memory | **[P] Short-term history in server memory only; long-term memory stays disabled** until a privacy design and notice are approved (section 11) |
| "No external API purchases or paid calls" | No paid calls in this phase | Honoured: none made |

What each approval would unlock (none is given yet):

| Approval | Unlocks |
|---|---|
| A. Direction (given by this brief) | Provider-agnostic local work with fake providers: gateway skeleton, budget controller, function-calling framework, verifier, tests |
| B. Provider and privacy policy (Google paid tier, customer notice, DPA) | Creating a Google billing account and API key |
| C. Budget and billing method (prepaid, amount, who pays, currency) | Real-provider tests (sections 14, 18) |
| D. Customer-data flow approval | Any real customer message reaching Google (shadow on consented test traffic first, then canary) |
| E. Hosting decision for the gateway | Deploying anything |
| F. Per-stage rollout approvals | 1%, 10%, 50%, 100% |
| G. Decommission authorisation (including the old server) | Stopping or deleting anything on the AI VPS or the old server |

### 0.2 What this plan challenges in the brief (summary)

1. **"Eliminate the VPS" is only partly achievable.** The Agent/gateway is a small Node process (44 MB resident [V]); it must run somewhere. The 12 GB inference host, Ollama and the models can disappear; one small service cannot. The Playwright browser controller probably needs its own host (section 6.5).
2. **Spend control at Google is weak** (experimental spend caps with about 10 minutes of lag; the real hard stop is a prepaid balance). The application budget controller is essential, and it cannot guarantee exact billing (section 14.5).
3. **Voice is several times dearer than text**: a push-to-talk exchange (transcribe + chat turn + TTS) is about LKR 1.3 to 2.1, 5 to 7 times a text turn; the Live API is at most about 2.5 times the push-to-talk cost per audio-minute, but sessions are open-ended, so volume is the risk, and it should wait (section 14.3).
4. **Sinhala is claimed only partially**: listed for TTS and Live, not for the transcription model, not stated for text models. No quality evidence exists (section 12).
5. **Commerce functions are blocked by missing backend routes**, not by the model (10 gaps, section 9).
6. **The brief's "rule-based logic must not override valid LLM reasoning" conflicts with the verifier's job** unless the verifier is split into "ground store facts" and "never override wording": the LLM-first design already does this (section 8.4).
7. **Gemini-generated text proves nothing about business operations**; only verified backend results count (sections 8, 9, 13).

### 0.3 What changed since the earlier plans

| Earlier plan or work | Status after this brief |
|---|---|
| Hybrid: local Qwen for shopping + hosted model for general + search | **Superseded** by Gemini-only. The deterministic router remains as hints and degraded mode |
| Local benchmarks of Qwen3.5-4B (and 9B, Gemma 4 E4B) and an isolated real-model host | **No longer needed.** The local runtime setup was stopped with a partial 51 MB download [V]; nothing was installed or pulled. Real-model testing becomes Gemini API testing, which needs an approved key and budget |
| `ProviderKind = "ollama-local"` only, "no remote or paid provider kind" by design | **Must change** (`apps/agent/src/models/types.ts:10` [V]): a new provider kind with explicit policy fields; a deliberate policy change, not a refactor |
| LLM-first architecture (`VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md`) | **Reused as is**, adapted: Ollama client -> Gemini provider adapter; feasibility section (CPU latency) is replaced by cloud latency and cost |
| Foundations work (verifier v2, tool interfaces, search layer), **stopped part-way by the owner** | **Remains provider-agnostic and reusable** (section 8.6 lists exactly what exists and the one failing test) |
| R0 router fixes (corrections, negation, bare categories, wording variants) | **Kept** as hints and explicit session state, and as the degraded mode |
| Search: provider abstraction with Brave and Gemini-grounding adapter skeletons | Gemini grounding becomes the first-class option; display and caching terms are [U] until read (section 8.5) |

---

## 1. Executive summary

**Goal.** Replace local inference (Ollama, Qwen) with the Gemini API as the single AI provider, behind a VOLTA-owned **AI Gateway** that keeps all business rules, security, budget and verification in VOLTA's hands, and remove the dedicated 12 GB AI VPS.

**Verdict: feasible, with three conditions that the brief underestimates.**

1. **A host is still needed for the gateway** (and a different, isolated host for the browser controller if browsing is wanted). The saving is the 12 GB inference VPS (Ollama, 18 GB of models, one-slot CPU inference), not "all servers" [P].
2. **Budget works, with margin, for text; voice and search need guard rails.** At about 337 LKR/USD (unofficial, [A]), the LKR 2,700 hard limit is about US$8.0; a typical mixed workload costs roughly LKR 0.5 per turn, so about 5,000 turns a month fit (section 14.2). Observed traffic is about 99 chat requests in 24 hours at nginx [V, `traffic-agent.md`], roughly 3,000 a month if sustained [A], inside that budget, but thinking tokens, long Sinhala histories (token ratio [U]), Search grounding ($14 per 1,000 beyond 5,000 free queries) and Live voice can each break it, so the controller must meter all of them.
3. **Privacy and approval gates come first.** Customer text goes to Google. Paid tier only, never free tier ("Google uses the content you submit ... human reviewers may read" on the free tier [V as reported]); a customer notice; PII minimisation; owner approval of the data flow (section 13).

**Biggest findings that change the plan (top 10, detail in the sections cited).**

| # | Finding | Label | Section |
|---|---|---|---|
| 1 | The gateway process is tiny (44 MB) but needs a host; the website server has about 2.1 GB RAM free and 3.4 GB disk free (91% full), so co-location is possible only after disk is freed, and not for Chromium | [V]/[P] | 6.5 |
| 2 | Google's only hard stop is a prepaid balance (HTTP 402 at $0); spend caps are "experimental" with about 10 minutes of lag; minimum prepay $5 is about 62% of the LKR 2,700 hard limit | [V as reported] | 14.5 |
| 3 | Model names are volatile: two older models reroute on 2026-12-01 and one shuts down 2027-05-07; prices rise on 2026-12-01 and 2027-01-01 | [V as reported] | 14.1 |
| 4 | Sinhala: documented for TTS and Live, **not** for the transcription model; no quality evidence anywhere | [V as reported]/[U] | 12 |
| 5 | Cart is browser-only; checkout is one-step; order history has no JSON route; policies are starter text: the commerce functions need new signed internal routes | [V] | 9 |
| 6 | The existing relay (`/api/internal/ai/erp/*`, GET-only, HMAC, anonymous) is the right pattern to extend | [V] | 9 |
| 7 | A stopped foundations tree of about 3,900 lines exists: verifier v2 (1,702 lines, tests pass), tool layer (1,253 lines, one failing test), search layer (975 lines, **no tests**) | [V] | 8.6 |
| 8 | No SLA for the Developer API was found; the design needs an honest degraded mode, and the router-first path makes that possible without any model | [V as reported]/[P] | 6.6 |
| 9 | Live path today is website -> ssh tunnel container -> Agent -> Ollama; the website, database and ERP do not depend on the AI VPS, so it can be removed without touching them once the gateway is live | [V] | 3, 4, 15 |
| 10 | Production security items must be closed before any hosted traffic (shared guest counter, port 8090 unverified, preview key in logs, exposed credentials, temporary keys, 91% disk, no alerting) | [V] | 13 |

**Effort and cost headline (estimates, [A]):** about **100 to 125 engineer-days** for the first-release scope (read-only catalogue, search, push-to-talk voice, budget controller, gateway, tests, rollout), plus **25 to 30** for the deferred scope (checkout prepare/confirm, browser controller, Live voice); calendar time is dominated by approvals, native-Sinhala review and soak periods. Running cost: **LKR 3,000 a month cap** for Gemini plus whatever the gateway host costs ([U]; zero extra if co-located on the existing website server).

**Decisions needed now:** section 22 (22 items); the first six are gateway placement, privacy approval, the customer notice, billing account and method, budget confirmation, and whether to resume or restart the stopped foundations work.

---

## 2. Existing architecture

### 2.1 What the system is today [V]

| Layer | What | Evidence |
|---|---|---|
| Website | Next.js app in container `volta-web-1` (git `6898dff`), PostgreSQL `volta-db-1`, ERP at `api.shop.hexalyte.com` as the authority for price, stock and orders | `infra-inventory.md` W1, W3, W6 |
| Assistant routes | `/api/assistant/chat` (live, contract 1.2): same-origin, 20/min per client, identity only from the session cookie, conversation id = HMAC of a random cookie + identity, request HMAC-signed to the Agent, answer validated by a strict schema (`apps/web/src/lib/assistant/schema.ts:23`, `z.strictObject`) | `api-inventory.md` 1.4 |
| Agent | systemd `volta-agent` on the AI VPS, router-first pipeline: deterministic router, scope guard, safety filter, fixed-template replies (about 73 template keys after R0's wording variants; 46 at audit time), Qwen only as a narrow fallback, response verifier, 10 tools, in-memory sessions (300 sessions, 30 min idle, 8 h max: `apps/agent/src/session/store.ts:99`), contract 1.3 locally (live is 1.2) | `VOLTA_AI_COMPLETE_ARCHITECTURE_AUDIT.md`; `infra-inventory.md` A1 |
| Model | Ollama on the AI VPS: production `qwen3:1.7b-q4_K_M`, experimental 4B / E4B / 9B (installed per docs, `ollama list` never captured) | `infra-inventory.md` A4-A6 |
| Transport | `volta-ai-tunnel-new` container (ssh -L `127.0.0.1:18787` -> AI VPS `127.0.0.1:8787`) | W2 |
| Catalogue | Agent -> website `/api/internal/ai/erp/*` (HMAC, GET-only, anonymous) -> ERP; 7 placeholder-quality products at audit time | `api-inventory.md` 1.1 |
| Not live | R0 and M8 router work, browser real driver and browser-agent path, voice module and routes, verifier v2 / tool / search stubs, contract 1.3, client-address hardening, frontend 1.3 mirror: **local and uncommitted after commits `96db7c9` (Agent) and `6898dff` (web)** | `infra-inventory.md` D1 |

### 2.2 Design limitations (root cause, summary of the earlier audit) [V]

The assistant misunderstands customers mostly by design: a rule-based router picks one fixed template; a model is reached only in a narrow fallback, sees only the current message, and the verifier forbids digits, Sinhala letters, prices and most facts in model text; unrecognised input gets one generic reply; there is no general-knowledge path, no web search, no owner-instruction channel; the model client can select only two Qwen tags (`apps/agent/src/ollama/models.ts:9-20`; `models/types.ts:10`). R0 fixed rule-level defects (corrections, negation, bare categories, safety false positives, repetition) on the deterministic path; it cannot fix the structural limits. Source: `VOLTA_AI_COMPLETE_ARCHITECTURE_AUDIT.md`, `VOLTA_AI_R0_LOCAL_RULE_FIXES_REPORT.md`.

---

## 3. Infrastructure inventory

Full detail with evidence tags: `audit4\infra-inventory.md` (37 components). Summary by classification:

| Class | Count | Members |
|---|---|---|
| **ACTIVE PRODUCTION** | 16 | Website: `volta-web-1`, tunnel `volta-ai-tunnel-new`, `volta-db-1`, `volta-order-sync-1`, real ERP API, nginx, TLS certs, host firewall, `/opt/valta/.env`. AI VPS: `volta-agent`, Agent env file, Ollama, `qwen3:1.7b-q4_K_M`, sshd, UFW + Fail2ban, host basics |
| **EXPERIMENTAL** | 7-8 | Mock ERP (still referenced by nginx for `/demo-erp/uploads`: not unused), QA centre (not served in production), the 4B/E4B/9B models, never-created staging Agent, local browser driver, local voice module, local model runtime; prepared ops scripts (never run) |
| **UNUSED / OBSOLETE (rollback artefacts)** | 3 | Stopped compose containers (`ai-tunnel`, `ai-agent`), 14 old web image tags and backups, old Agent bundles |
| **OLD SERVER** | 3 | `2.29.97.114`: unreachable, untouched; whether it is powered, billed or still referenced is **[U]** |
| **UNKNOWN-NOT-VERIFIED** | 3 + sub-items | Monitoring and backups on the website host, `volta-health` timer, benchmark artefacts, exact `ollama list`, which process is on host `:3000`, DNS provider |
| **UNRELATED (preserve)** | 1 | The hexalyte reseller stack, host Postgres and the "EMS admin proxy" rule on the same website host |

### 3.1 Facts that drive the migration [V]

| Fact | Value | Source |
|---|---|---|
| Website host RAM | 3,814 MB total, 2,135 MB available, swap 754 of 2,047 MB used | `server-agent.md` / `network-agent.md` |
| Website host disk | `/` 38 GB, 91% used, **3.4 GB free**; 22 images, 16.69 GB reclaimable (old `volta/web:rollback-*` tags) | `network-agent.md`, `qa-agent2.md` |
| Agent footprint | `MemoryCurrent` 44 MB, `MemoryMax` 600 MB, bundle about 1 MB, Node 24 | `qa-agent.md` |
| AI VPS | 6 vCPU, 11.9 GB RAM, 193 GB disk (166 GB free), 28 GB used | `qa-agent.md` |
| Current live model path | `qwen3:1.7b-q4_K_M`, CPU, 2 to 7 tokens/s for models that fit | `VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md` section 8 |
| Traffic (last covered window) | 68 Agent chat requests in about 12 h; nginx 99 POST `/api/assistant/chat` in 24 h; peak 40 an hour at the Agent; 6 distinct client addresses | `traffic-agent.md` |
| The Agent holds no persistent state | sessions in memory only, lost on every restart | `store.ts:99`; `infra-inventory.md` dependency 6 |
| Old tunnel to the old server is stopped, not removed | compose service `ai-tunnel`, saved config copy | `infra-inventory.md` W10, O2 |

---

## 4. Current production traffic flow [V]

```
Browser
  | HTTPS valta.hexalyte.com
  v
nginx (host)  ---- overwrites X-Forwarded-For / X-Real-IP; logs query strings
  | 127.0.0.1:8090            (port 8090 also published 0.0.0.0: external reach UNVERIFIED)
  v
volta-web-1 (Next.js)  /api/assistant/chat
  |  same-origin, 20/min/client, identity from session cookie, HMAC sign (contract 1.2)
  v  http://127.0.0.1:18787   (inside the web container's network namespace)
volta-ai-tunnel-new (ssh -N -L, forward-only user)
  |  ssh
  v
AI VPS 109.199.108.76  sshd -> 127.0.0.1:8787  volta-agent (router-first)
  |                                   |  GET-only signed relay
  | 127.0.0.1:11434                    v
  v                               website /api/internal/ai/erp/*  ->  HEXALYTE ERP
Ollama (qwen3:1.7b, fallback lane only)
```

Orders and customer data never go to the Agent (`getOrder` is stubbed to null; the relay is anonymous-only) [V, `infra-inventory.md` section 3]. If the AI VPS disappears today, `/api/assistant/chat` answers 503 "assistant unavailable"; the site, database and ERP are unaffected [V, dependency map row 1].

---

## 5. Root cause and design limitations (what must not be carried into Gemini)

| # | Limitation | Carried into Gemini? | Label |
|---|---|---|---|
| 1 | Template-first replies: the model never writes factual answers | **No**: replaced by the LLM-first turn loop (section 8) | [P] |
| 2 | Model sees only the current message; no history | **No**: bounded server-side history (section 11) | [P] |
| 3 | Verifier rejects Sinhala, digits, prices and facts in model text | **No**: replaced by claim-grounding verifier v2; card/action checks stay (section 8.4) | [P] |
| 4 | Scope guard sends general questions to a generic template | **No**: scope verdicts become hints only | [P] |
| 5 | Router abstains below a score and collides on cue words | Partly fixed by R0; the router becomes hints and a prefetch layer | [P] |
| 6 | No owner-instruction channel at all | **Still missing**: a small authenticated policy record is a later design; the system prompt is configuration under review, not customer text | [P]/[D] |
| 7 | One model slot, queueing, 45 s deadline | **Disappears** (cloud concurrency); a per-conversation concurrency limit and budget replace it | [P] |
| 8 | Sessions in memory, lost on restart | **Kept for short-term context**; budget state must NOT be memory-only (section 14.5) | [P] |
| 9 | Safety rules, identity isolation, rate limits | **Kept**; they are deterministic and must not depend on the model | [V]/[P] |

---

## 6. Target Gemini architecture

### 6.1 Principles [P]

1. **Gemini is the intelligence; VOLTA is the authority.** Gemini understands, plans, selects tools and writes wording. VOLTA's backend and database stay authoritative for price, stock, accounts and orders; Gemini output is never proof that an operation succeeded.
2. **The key and every business rule stay server-side.** The browser never sees a Gemini key; identity comes from the website session, never from the model.
3. **Provider-agnostic gateway.** A small `LlmProvider` interface hides the wire format (Google documents both `generateContent` and a newer Interactions API [V as reported]); the Gemini adapter is one implementation, a fake is another.
4. **Deterministic pieces are kept** (identity, rate limits, safety gates, tool authorisation, card/action verification, confirmations, budget) and the router becomes hints plus the degraded mode.
5. **Model names, prices and limits are configuration**, with a fallback list and a daily availability check (section 14.1).

### 6.2 The VOLTA AI Gateway [P]

One service (the evolution of the Agent; `apps/agent` plus the LLM-first modules) with these responsibilities:

| Responsibility | Design | Existing code reused [V] |
|---|---|---|
| Authentication | HMAC-signed requests from the website (key id, timestamp, nonce, identity, client address, body hash), replay cache, auth-failure slow-down | `auth/hmac.ts`, `http/preauth.ts`, `http/server.ts` |
| Session management | Server-memory short-term context keyed by `(identity, sessionId)`; ownership check; TTL | `session/store.ts`, `security/sessions.ts` |
| Request validation | Strict schemas, size caps, pre-auth body limits | `contract/schemas.ts`, `http/preauth.ts` |
| Rate limiting | Per address, per session, per identity, new-session allowance (guest isolation fix), shop ceiling | `security/rate-limit.ts` |
| Model selection | Config-driven profiles (low-cost chat, reasoning, transcribe, TTS, live), automatic downgrade when the budget tightens | new; replaces `ollama/models.ts` allow-list |
| Token and budget management | Reservation before each call, settlement from `usage`, daily and monthly counters in a persistent store, soft/hard behaviours | new (section 14.5) |
| Retry, timeout, circuit breaker | Per-call deadline, bounded retries with jitter on 429/5xx only, breaker that opens after consecutive failures and routes to the degraded mode | new; scheduler deadlines reused |
| Provider normalisation | One internal result shape: text, tool calls, usage (input, output, thought, cached, tool-use), finish reason, sources | new |
| Usage accounting | Tokens, seconds, searches per model; reconciled against Google (section 14.5) | `observability/metrics.ts` extended |
| Function calling | Section 8.1 | `tools/**`, `tools/llm/**` |
| Verification | Verifier v2 | `verify/**`, `verify/v2/**` |
| Degraded mode | Router-first deterministic path, labelled (6.6) | existing pipeline (`off` lane) |

### 6.3 Model strategy [P] (no final hardcoded selection)

| Role | Candidate class (names from `gemini-facts.md`, [V as reported]) | Decision criteria (to be measured with an approved key) |
|---|---|---|
| Low-cost customer chat, tool selection, summaries | `gemini-3.5-flash-lite` (Stable; $0.30 in / $2.50 out per 1M); `gemini-2.5-flash-lite` ($0.10 / $0.40; "not deprecated" but older) | Sinhala/Singlish quality on native-reviewed sets, tool-call correctness, thinking-token behaviour, latency p95, cost per conversation |
| Harder reasoning, long comparisons, general questions | `gemini-3.8-flash` ($0.75/$3.75, **doubling 2027-01-01**) or `gemini-3.6-flash`; Pro class (`gemini-3.1-pro-preview`, Gemini 4) only if measured to be needed | Does the lower class fail on the held-out reasoning set? Cost at post-change prices |
| Speech to text | `gemini-3.5-transcribe` ($0.003/min; "85+ languages", **Sinhala not listed**); general audio understanding in a text model as a fallback | Native-speaker WER on Sinhala, Singlish, English; code-mixing |
| Text to speech | `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` (Sinhala listed for both; audio out $6/M tokens, **doubling 2027-01-01**) | Native-speaker intelligibility and naturalness |
| Real-time voice | `gemini-3.8-live` (99 languages incl. `si`; about $0.018/min audio out) | Cost per minute versus the budget (section 14.3); defer |

Configuration shape (illustrative): `GEMINI_MODEL_CHAT`, `GEMINI_MODEL_REASONING`, `GEMINI_MODEL_STT`, `GEMINI_MODEL_TTS`, a price table file keyed by model id (so a price change is a config change reviewed by a person), and an ordered fallback list per role. A daily job calls the model-list endpoint (no generation cost [A: listing is free; [U] to confirm]) and alerts if a configured model is missing or marked deprecated. Known dates: `gemini-2.5-flash` and `gemini-2.5-pro` reroute on 2026-12-01; `gemini-3.1-flash-lite` shuts down 2027-05-07; preview TTS models shut down 2026-12-18 [V as reported].

### 6.4 What stays deterministic and what becomes model-driven [P] (reuse of the LLM-first design)

| Deterministic (never delegated to the model) | Model-driven |
|---|---|
| Identity and session isolation; rate limits; budgets | Understanding the message, history, corrections, negations, instructions |
| Safety gates for secrets, injection, payment/checkout, cross-customer data | Deciding whether to answer, call tools, or search |
| Tool authorisation and argument validation | Tool arguments (validated) and the order of calls |
| Card and action construction and field-by-field verification (price, stock, variant, `fit`, cart, links) | The wording of every reply, including general knowledge and calculation explanations |
| Confirmations (cart, browser, checkout hand-off): bound to session, action hash, payload; single use; expiry | Follow-up questions and comparisons, grounded in tool results |
| System messages (busy, error, unverifiable, hand-off) as fixed templates | Choosing among tools; summarising conversation |

### 6.5 "Eliminate the AI VPS": what can go and what cannot [P], evidence [V]

**Can disappear:** the 12 GB inference host's role, Ollama, all model files (about 18 GB if the four models are installed [U: `ollama list` never captured]), the one-slot CPU queue, the tunnel container, the SSH forward-only user, host monitoring built for model load.
**Cannot disappear:** a running process for the gateway (router hints, verifier, tools, budget, circuit breaker), a persistent store for budget state, and (if browsing is wanted) an isolated browser host.

| Placement option | Evidence | Pros | Cons / risks | Label |
|---|---|---|---|---|
| **A. Separate container on the website host** (`volta-ai-gateway`, built from the Agent repo) | Agent uses 44 MB; host has about 2.1 GB RAM available, 3.4 GB disk free (91%), swap 754 MB used, 14 old image tags | No extra bill, no tunnel, loopback to the website, can use the website's Postgres for budget state | Disk must be freed first (build is unsafe at 91%: prune approved rollback images or build elsewhere and load); Gemini key lives on a host that also holds the ERP credential and database access (blast radius); shares CPU/RAM with the shop and an unrelated tenant; Chromium does not fit comfortably | **[P] recommended for the first release (text, tools, search, push-to-talk voice)**; [D] |
| B. Small separate VPS for the gateway | Current 12 GB host cost, contract and owner of the account are [U] | Isolation from the shop; room for the browser controller | It is a smaller VPS, not zero; another host to harden, monitor, back up; needs a TLS channel or tunnel again | [D] |
| C. Serverless / container platform | No evidence; pricing and account [U] | Elastic, no host to patch | New vendor and data processor, cold starts, WebSocket/streaming limits, egress control for the browser harder, account and billing [U] | [D] |
| D. Inside the Next.js app as internal routes | Web image is 1.9 GB; deploys need a full image build | One fewer process | Couples AI changes to website deploys (disk-blocked today); AI logic and the Gemini key inside the public-facing app; in-memory sessions lost per web recreation; heavier blast radius | **[P] not recommended** |
| **Browser controller (Chromium)** | Measured on Windows: 1 session about 170 to 205 MB, 3 sessions about 350 to 430 MB; about 150 MB of binaries; **Linux and sandbox unverified**; isolation (own user, no route to private networks, firewall) is a documented requirement and not built | n/a | Does not fit beside the shop on a 3.8 GB host with swap in use; needs OS-level isolation | **[P] separate small host (option B-type) or defer the browser to a later phase** |
| Speech | With Gemini there is no local engine | Nothing to host | Audio uploads transit the gateway (size caps, validation already built) | [P] |

### 6.6 Degraded mode (what happens when Gemini is unavailable) [P]

The router-first deterministic pipeline needs **no model** and is already built (`off` lane; R0 improved it). When the breaker is open, the budget is exhausted, or Gemini returns repeated errors:

| Message type | Behaviour | Honest label |
|---|---|---|
| Recognised shopping intent (search, compare, details, price) | Answer from the deterministic path with verified cards; `meta.degraded: true` | The reply is template-based, not AI-written; the widget may show a "basic mode" hint |
| General knowledge, search, conversation | A fixed system message: the AI service is busy, please try again; **never `clarify_what` and never a made-up answer** | System message, not AI |
| Voice | Voice features disabled with a plain message; text continues | System message |
| Website down-stream | The widget shows its plain error; the shop remains usable (unchanged today) | n/a |

The degraded mode never claims an AI response was generated. It is only available while the gateway host is up (a gateway-host outage still falls back to the website's plain "assistant unavailable" error) [P].

---

## 7. Component diagrams

### 7.1 Target flow [P]

```
Browser (widget: chat, mic, citations, confirmations)
   |  HTTPS, same-origin, session cookie
   v
Website (Next.js)  /api/assistant/*   ---- percentage flag (by session hash): gateway vs old Agent path (until decommission)
   |  HMAC-signed request: identity (anon | cust:id from the session), client address, contract version
   v
VOLTA AI GATEWAY  (container on the website host, or small separate host)
   |-- auth, replay, rate limits, session ownership
   |-- budget controller  <---->  persistent ledger (website Postgres table or local SQLite volume)
   |-- context assembly (history window, session facts, exclusions, router HINTS)
   |-- LlmProvider ---------------------------------------------> Gemini API (paid tier, server-side key)
   |       ^   decide -> function calls (validated)                 |  text / audio / search grounding
   |       |                                                        v
   |-- function layer (authorised handlers, timeouts, audit)    Google Search grounding (sources)
   |       |-- catalogue/stock/price  --signed GET-->  website internal routes  --> ERP (authoritative)
   |       |-- orders/policies        --signed GET-->  website internal routes  --> DB / ERP (minimised views)
   |       |-- calculator, fetch_page (SSRF-safe), recall
   |       '-- browser_*  ---------->  isolated Browser Controller host (Playwright, VOLTA-only egress)  [deferred]
   |-- verifier v2 (claim grounding, safety, honorific/repetition checks)
   '-- degraded mode (router-first, no model)
   |
   v  reply + cards + actions (+ sources, contract 1.4 optional)
Website validates strictly, widget renders plain text; cart changes are PROPOSALS applied by the browser after Confirm
```

### 7.2 One turn [P]

```
message --> [safety gates] --> [context assembly: history <=6 turns, session facts, exclusions, hints]
        --> [budget: reserve estimated cost]  --refuse--> degraded/system message
        --> Gemini decide  --tool calls--> [authorise + validate + run (timeouts)] --results (fenced)--> Gemini
        --> Gemini answer (streamed) --> [verifier v2: store facts == this turn's tool results;
                                           sources fetched this turn; refusal classes; honorifics]
              pass --> reply (+ verified cards/actions)      repairable --> regenerate once, else drop failing sentences
              fail --> "I could not verify that" (system message), never a shopping-menu fallback
        --> [budget: settle from usage metadata] --> response
```

---

## 8. API and function-calling design

### 8.1 Function-calling framework [P]

Every function is declared once in the gateway registry with: name, description (short, concrete: written for a small context), input schema (strict, bounded), output schema, **permission class** (`read`, `search`, `reversible-proposal`, `sensitive-needs-confirmation`, `financial-never`), handler, timeout, maximum result size, result fencing for untrusted content, audit event (ids and counts only, never message text), and stable failure codes. The model never executes anything: it **requests** a call; the gateway authorises, validates, executes through authorised backend routes and returns a fenced result. Failures are returned to the model honestly (it must not claim success).

Gemini specifics [V as reported, `gemini-facts.md` 5a-5b]: function-calling modes AUTO / ANY / NONE / validated; parallel and compositional calls; results returned to the model by the application; Gemini 3-series needs "thought signatures" round-tripped (the official SDK handles them; in stateless mode returned steps must be resent exactly as received); structured output uses a JSON-Schema subset where `minLength`, `maxLength`, `uniqueItems` and similar are **not enforced**, so every value must be validated in the application. [P] Use the stateless mode (`store=false`) so conversation state stays in VOLTA's memory, and put the stable prefix (system prompt, tool schemas) first to benefit from implicit caching (minimum sizes for Flash-Lite are [U]).

| Function | Class | Backend | Notes |
|---|---|---|---|
| `volta_search_products` | read | existing list route / relay (G1) | exclusions applied server-side |
| `volta_product_details` | read | new internal route (G1) | specs from ProductContent + ERP |
| `volta_compare_products` | read | composed from details | up to 4 products, existing card rules |
| `volta_categories` | read | new internal route (G1) | tree is a proposal today |
| `volta_stock_and_price` | read | new internal signed quote route (G2) | authoritative; the only source of prices in answers |
| `volta_get_policy` | read | policy route (G7) | versioned, owner-approved text only |
| `volta_cart_propose` / `volta_cart_explain` | reversible-proposal / read | browser-side cart (G3 Option A) | proposals applied by the widget after the shopper confirms; the cart sent by the widget is untrusted and re-priced |
| `volta_order_status`, `volta_order_history` | read, **customer-scoped** | new internal routes (G6, G8) | identity from the signed website claim; minimised views |
| `calculator` | read | local safe parser | no code execution |
| `web_search` (grounding) / `fetch_page` / `lookup_documentation` | search | Gemini grounding or a retrieval provider; SSRF-safe fetcher | results fenced as untrusted data |
| `recall_conversation` | read | session facts | no storage |
| `browser_*` | sensitive | isolated controller | **disabled** until the security review and isolation pass |
| `run_code` | financial-never (disabled) | none | no sandbox approved |

### 8.2 Gateway API surface [P]

Internal, signed, versioned: `POST /v1/chat` and `/v1/chat/stream` (existing, contract 1.0 to 1.3 unchanged; **1.4 optional**: `sources`, `reply.source:"llm"`, `meta.answerClass`, token counts), `GET /v1/health`, `GET /v1/metrics` (signed), voice routes (existing), browser confirm/cancel (existing, flag-gated). Deployment order stays: gateway first (serves old contracts too), website second; rollback website first [V lesson, `VOLTA_AI_OPERATIONS_RUNBOOK.md` section 5].

### 8.3 The turn loop [P]

Reuse `VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md` sections 3 and 6 with the Ollama client replaced by the Gemini provider: context assembly (verbatim message, history of at most 6 turns, explicit exclusions, corrections, instructions, router hints), a high-confidence router hint **prefetches** the tool so the model needs one call instead of two, at most N tool rounds, a deadline split between tool rounds and answer, streaming of tokens ("last text wins" in the widget). Cloud latency is [U] until measured; the old CPU arithmetic (25 to 80 s) no longer applies.

### 8.4 Verifier v2 and the "LLM must not be overridden" requirement [P]

The brief wants rule-based logic to stop overriding valid reasoning. The resolution: the verifier changes character from "model text may contain no facts" to "store facts must be traceable to this turn's tool results; search claims must cite sources fetched this turn; refusal classes stay". It **never rewrites good wording**: it either passes, asks for one regeneration with the verified facts, removes only the failing sentences, or shows an honest "I could not verify that" message. It also enforces the **respectful-communication policy** the owner added (honorific only when the customer's preference is known; at most one per reply; never inferred from names; neutral respectful forms otherwise; Sinhala wording flagged for native review). Source: `VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md` section 5; modules exist in `apps/agent/src/verify/v2/**`.

### 8.5 Search and knowledge [P]

Provider abstraction `SearchProvider` (exists, with a fake). Two shapes: **grounded generation** (Gemini with Google Search grounding: citations returned with the answer; $14 per 1,000 search queries after 5,000 free per month on Gemini 3 and newer, default cap 1,500 a day [V as reported]) and a **retrieval provider** (for example a search API returning URLs that VOLTA fetches itself through the SSRF-safe fetcher). Open items [U]: Google's display and storage rules for grounded results ("Full usage requirements are detailed in the Terms of Service" and the Search-suggestions HTML snippet rule: not read); whether Search is billable on every model (the pricing page shows contradictory "Not available" cells); 30-day Google-side storage of grounded prompts [V as reported]. Retrieved text is fenced as untrusted data; instructions inside it never authorise tools; the answer separates verified store facts, search-derived information with links, and general model knowledge; "I searched" is allowed only if a search ran this turn.

### 8.6 State of the stopped foundations work [V, inspected read-only on 2026-11-14]

| Part | Files / lines | Tests | State | Reuse for Gemini |
|---|---|---|---|---|
| `src/verify/v2/**` | 13 files, 1,702 lines | 3 test files + fixtures (grounding, citations, safety); 129 tests passing across v2 and the calculator file | Mostly complete; a stray-control-character defect (two backspace characters instead of `\b` at `safety.ts:108`) was found by R0's guard test and fixed; not wired into any pipeline | **Provider-agnostic: reuse as is** |
| `src/tools/llm/**` | 8 files, 1,253 lines (calculator, executor, parse-call, fence, tools, evidence, types) | Only `tools-llm-calculator.test.ts`; **1 failing test**: "the length and token caps keep every accepted expression far below the operation budget" expects `TOO_LONG` but gets `TOO_MANY_TOKENS` (an unfinished expectation mismatch); executor, parser, fence and tool definitions are **untested** | Unfinished | Calculator and executor reusable; `parse-call` targets the Ollama call format and needs a Gemini adapter |
| `src/search/**` | 11 files, 975 lines (cache, extract, fake provider, injection fence, quota, SSRF-safe fetcher, adapter skeletons `providers/brave.ts` and `providers/gemini-grounding.ts`) | **None** | Unfinished and unreviewed; default quotas zero; adapters disabled and key-less | Fetcher/extractor/fence reusable after tests; the Gemini adapter skeleton needs review against the real API |
| Turn loop, lane switch, history, honorific prompt, contract 1.4 | not started | none | Not started | New work |

Total about 3,930 lines of unwired, partly tested code. **Nothing here is enabled or deployed.**

---

## 9. Commerce integration

**Rules [P]:** (1) VOLTA's database and ERP stay authoritative; (2) identity comes from the website session claim signed to the gateway (`anon` or `cust:<id>`, `apps/agent/src/auth/hmac.ts:38` [V]), never from the model or the message; (3) a success statement is composed from a **verified backend result**, never from model text; (4) cart, checkout and cancel are proposals or hand-offs that need an explicit customer click bound to session + action hash + payload, single use, with expiry (the confirmation store pattern exists in `apps/agent/src/browser/confirmations.ts` [V]); (5) payment and final order placement are never model-callable.

| Function wanted | Existing capability [V] | Gap and work [P] | Release |
|---|---|---|---|
| Product search, list | `/api/store/products` (public, 120/min per client) and the relay | Gateway needs an internal signed variant with its own bucket (one shared IP bucket otherwise) | **First** |
| Product details, specifications | ERP product via relay; spec rows via relay `content` | **G1**: internal signed `product` route | **First** |
| Comparison | composed from details | none | **First** |
| Category discovery | category on each product; no tree route | **G1**: internal `categories` route; the proposed tree is only a document | **First** (simple) |
| Price and stock verification | `/api/store/availability` needs a browser `Origin` | **G2**: internal signed `quote` route; the only price source for answers | **First** |
| Accessories | `/api/store/accessories` | none | First |
| Delivery, warranty, return and refund information | static pages with **starter text** editable in admin | **G7**: a read route serving the published policy with version and date; the **owner must confirm the text is real** before an AI quotes it | After owner confirmation |
| Add/remove/update cart, explain cart | **none on the server** (browser `localStorage` key `volta.cart.v1`, `apps/web/src/store/cart.ts:10`) | **G3 Option A (recommended)**: keep the cart in the browser; the model returns structured proposals; the widget applies them after Confirm; "explain cart" sends the current cart with the message and re-prices it via the quote route. Option B (server cart) is a larger, later change | Second |
| Order status, tracking | `GET /api/store/orders/{ref}`: the reference is the only credential (about 49 bits) | **G8**: look up only references belonging to the verified customer's own list; never let the model guess or enumerate; per-ref and per-address limits | Second |
| Order history | no JSON route (server function only) | **G6**: internal signed route; customer id supplied by the website from the session; minimised `PublicOrder` fields (no name, phone, address, email) | Second |
| Prepare checkout | single-step `POST /api/store/orders` with `acceptTerms`, `expectedTotal`; COD or bank transfer only; no card gateway | **G4**: a server-side prepare step (validated, quoted, signed short-lived intent) and a confirm step only the customer's click can trigger; idempotent by `externalRef` | Later |
| Cancel order | public `DELETE` by reference | **G5**: owner-verified, confirmation-bound internal route | Later |
| Payment, final order placement | not model-callable | stays on the website checkout page | **Never by the model** |
| Server-side per-customer limits and budgets | in-memory per-address limiter, resets on restart | **G9**: shared store | With the budget ledger |
| Long-term customer memory | none | **G10**: consent + storage design | Disabled |

**PII exposed if a function returned database rows** (full table in `api-inventory.md` section 3): `Customer` (email, name, phone, password hash), `WebOrder` (name, phone, email, **delivery address**, payload), `PreOrderRequest`, `ChatMessage` (free text), newsletter and wholesale records, encrypted device and ERP secrets. **Rule [P]:** functions return minimised, pseudonymous views only; the customer-facing website shows full details itself; nothing in the last four classes is ever sent to a model.

---

## 10. Browser automation

### 10.1 Architecture [P]

`Gemini = reasoning and action planning`, `Browser Controller = execution`, `VOLTA backend = authoritative business operations`. **Prefer backend APIs for every commerce operation that has one** (section 9); the browser is for reading a page the shopper is looking at, inspecting content that has no API, and later for approved UI interactions. The browser never completes checkout, payment, login, account or address changes.

### 10.2 What exists [V] and what it is worth

| Piece | State | Label |
|---|---|---|
| Real Playwright driver and in-process egress-filtering proxy (DNS pinning, private/metadata/loopback/mapped-IPv6/numeric-IP blocking, redirect re-validation, atomic caps, hidden-text filtering, click-target re-verification, `browser.select`) | 71 real-Chromium tests passed on Windows with local fixtures; independent review found a High (click-target swap) that was then fixed; **no fresh independent review since** | Implemented; tested with a real browser **locally**; **not safe to enable** until re-reviewed |
| Tool layer: URL policy (VOLTA host only: `valta.hexalyte.com`), ownership, step budget, element classification (read / reversible / sensitive / financial), secret/personal field refusal, fenced untrusted page text, injection filter | Mock-tested; used by the real driver in tests | Implemented |
| Deterministic browse path in the Agent (regex intent, no model in the loop), confirmation endpoints bound to session + element + page, single use, expiry; contract 1.3 `browser` panel; website confirm/cancel routes behind `AI_ASSISTANT_BROWSER=1` | 8 real-Chromium end-to-end tests + route tests, all local; website still sends contract 1.2 | Implemented; tested locally; **disabled by default; not deployed** |
| OS-level isolation (dedicated unprivileged user, no route to private networks, firewall, resource limits) | Documented as a proposal; **never built or executed** | Requires infrastructure |
| Linux behaviour (Chromium sandbox on Ubuntu, real memory) | **Unmeasured** | [U] |

### 10.3 With Gemini [P]

1. Gemini **requests** `browser_*` functions; the gateway authorises each (session ownership, step budget, URL policy, element class) and relays to the controller host; the controller re-checks every URL and element itself (defence in depth: "the tool layer never trusts the driver", and the driver never trusts the tool layer).
2. **Page content is untrusted data** (fenced, size-capped, injection-flagged); it never authorises a tool and never reaches Gemini unfenced. Model-driven browsing must be **evaluated against a fixed prompt-injection attack set before it is enabled**; until then the deterministic regex path stays the only entry (`VOLTA_AI_LLM_FIRST_MIGRATION_ARCHITECTURE.md` item 18).
3. The controller exposes no cookie, storage, script or authenticated-session API to the model; sessions are anonymous and isolated (own context, cookies, storage); customer logins and passwords never enter the browser.
4. **Screenshots are not sent to Gemini in the first version** [D]: product pages are public, but a screenshot is page content leaving to a third party; text and structured element lists suffice.
5. **Egress:** the controller host allows only the VOLTA hostname; a Gemini-side feature must never widen it (adding an origin needs an explicit owner approval, as in the original rule).
6. **Placement:** a separate small host (section 6.5); co-location with the shop is not recommended (RAM, disk, blast radius).

**Release stage [P]:** deferred to after the first release; entry criteria: fresh independent review with zero High/Critical, OS-level isolation built and tested on Linux, measured memory, injection evaluation passed, owner approval.

---

## 11. Memory and knowledge architecture

### 11.1 Short-term memory [P] (first release, no persistence)

| Item | Design | Evidence / label |
|---|---|---|
| Content | Last 6 turns (bounded characters), requirement profile (category, brand, budget, usage), **exclusions** (negative preferences), corrections, conversation instructions (reply language, brevity, no more questions), products shown (ids), pending question | Built locally by R0/M8 for the deterministic path [V]; the history part is new |
| Location | Gateway process memory keyed by `(identity, sessionId)`; ownership enforced; TTL 30 min idle / 8 h absolute | `session/store.ts:99` [V] |
| What leaves the server | Each model call sends the bounded history to Google (paid tier logs prompts "for a limited period" [V as reported]); customers need a notice (section 13.3) | [D] |
| Logging | Counts and codes only; **no message text is stored or logged** | existing rule [V] |
| Loss on restart | Accepted (short-term only) | [V] today |
| Cost | History is the main input-token driver; the controller shortens it when the budget tightens | section 14 |

### 11.2 Long-term memory [P] (disabled)

Saved preferences (brand, budget range, language, usage) and support history would be **explicit, consented, minimal and deletable**: a separate table with a consent flag per customer, no raw chat, a deletion and export path, access limited to the gateway's customer-scoped functions, a retention limit, and an audit event on every read/write. **Not enabled until the owner approves a privacy design and notice** (decision 11 in section 22). Guests get no long-term memory.

### 11.3 Knowledge engine [P]

| Source | Approach | Notes |
|---|---|---|
| VOLTA policies, FAQs, delivery, warranty, returns | Structured, versioned documents served by a read route (G7); small enough (dozens of documents) to place the relevant ones directly in context, with the stable prefix cached; keyword retrieval first; embeddings (`gemini-embedding-001`, $0.15 per 1M tokens [V as reported]) and a vector store only if the corpus grows | **The current text is starter content** [V]: the owner must replace and approve it before the assistant quotes it |
| Product documentation and specifications | `ProductContent` published spec rows and ERP specs through the relay [V] | missing specs are stated as "not listed", never guessed |
| Website pages | Only through the policy/FAQ route, not by scraping | |
| External knowledge | The search lane (section 8.5), labelled and cited | kept visibly separate from website knowledge |

Answers carry labels: verified store data, website knowledge (with document title and version), search-derived (with links), general model knowledge. The verifier enforces that "website policy says" claims match the retrieved document text [P].

---

## 12. Voice architecture

### 12.1 Design [P]

```
Mic (push-to-talk) -> widget (existing recorder, preview, editable transcript)
   -> website route (same-origin, size/duration caps, rate limits)
   -> gateway voice route (existing: content sniffing, 5 MB / 30 s caps, pre-auth budgets, queue, metrics)
   -> Gemini transcription (config model) -> transcript back to the shopper (editable)
   -> the SHOPPER sends it through the normal chat route (the same pipeline as text; no second conversation system)
reply text -> optional TTS route -> Gemini TTS -> audio (WAV/PCM) -> widget player; fallback: browser speechSynthesis
```

The built-and-tested parts [V, local only]: audio validation (wav, ogg/opus, webm/opus, mp4/m4a by content sniffing), caps, pre-authentication read budgets, 504 on a hung provider, metrics hooks, the widget recorder/preview/player, website routes (off without an engine). Replace the HTTP provider for a local engine with a Gemini provider adapter; **no local engine is hosted**.

### 12.2 What the documentation claims versus what is known [V as reported / U]

| Capability | Documentation claim | Quality evidence |
|---|---|---|
| Transcription `gemini-3.5-transcribe` | "85+ languages", language auto-detection "including mid-session code-mixing", custom vocabulary up to 1,000 terms; **Sinhala not listed** | **None** |
| General audio understanding in text models | formats and limits only; no language list; Sinhala not mentioned | **None** |
| TTS `gemini-3.8-flash-tts` / `-lite-tts` | Sinhala listed (✔) for both | **None** |
| Live API `gemini-3.8-live` | 99 languages including `si`; sessions 15 min audio-only; ephemeral tokens for browser clients | **None**; concurrent-session limits [U] |
| Singlish (romanised Sinhala mixed with English) | not mentioned anywhere | **None** |

**Therefore: no Sinhala or Singlish voice claim may be made until native-speaker evaluation passes.** If Sinhala transcription fails the bar, voice input is offered in English only (honestly labelled) or Sinhala typing is used.

### 12.3 Native-speaker test plan [P]

| Element | Plan |
|---|---|
| Speakers | At least 12 native Sinhala speakers across age bands, regions/dialects and a balanced mix; at least 4 additionally speak Singlish code-mixed naturally; English-accent speakers for the English set |
| Devices | At least three phones (low-end Android, mid-range Android, iPhone) in the browser, plus a laptop microphone |
| Conditions | Quiet room, street noise, shop noise (several signal-to-noise bands), speakerphone distance |
| Material | About 150 phrases per speaker in the shopping domain: product and brand names, prices and budgets ("laksha dekak"), numbers and units, corrections and negations ("Samsung epa"), general questions, Singlish mixes; no real personal data in any phrase |
| Consent and privacy | Written consent, purpose and retention stated, no recording retained beyond the evaluation, right to withdraw, recordings kept off the application servers and out of the repository |
| Split | At least 30% of speakers held out entirely (never used to tune prompts, vocabulary or thresholds) |
| Metrics (kept separate, never blended) | Word and character error rate per condition and category; intent preserved after transcription; numbers/price accuracy; TTS intelligibility and naturalness rated 1 to 5 by at least 5 native raters; latency; cost per minute |
| Acceptance (starting thresholds, [A] to be agreed with reviewers) | Sinhala WER and number accuracy at levels reviewers judge usable for shopping; **zero** harmful misrecognitions of prices or product choices in the held-out set; TTS rated "clear and natural" by a majority |
| Cost | Transcription $0.003/min: 300 minutes of test audio is about $0.9; TTS and Live tests are similarly small; counted in a separate test budget (section 14.5) |

### 12.4 Live (real-time) voice [P], deferred

`gemini-3.8-live` input about $0.005 and output about $0.018 per audio-minute [V as reported]: at most about $0.023 a minute (LKR 7.8) when both sides talk throughout; a 2-minute session is at most about LKR 15.5, so the hard limit buys about 174 such sessions a month if nothing else is spent. Browser clients must use **ephemeral tokens**, never the key. Deferred until push-to-talk quality passes and the budget has headroom.

---

## 13. Security and privacy

### 13.1 Framework [P]

| Area | Design | State |
|---|---|---|
| Authentication | Website -> gateway: HMAC with key id, timestamp window, nonce replay cache, identity and client address in the signature; pre-auth header checks before reading bodies | Built [V] |
| Authorization and tenant isolation | Session id bound to one identity; customer-scoped functions take the identity from the signed claim only; no cross-customer data | Built for sessions [V]; customer functions new |
| API key protection | Key only in a root-only environment file on the gateway host (mode 640, service group), never in the browser, repository, logs, prompts, error messages or metrics; separate keys for test and production; rotation procedure; restrict the key to the Generative Language API if the console allows it [U] | New |
| Rate limiting and abuse | Per address (IPv6 as /64), session, identity, new-session allowance, shop ceiling, plus **token and cost quotas per session and per customer** because spend is now an attack surface (denial of wallet) | Request limits built [V]; cost quotas new |
| Request validation | Strict schemas, size caps, content sniffing for audio | Built [V] |
| Tool permission validation | Per-lane allow-list, per-tool class, argument schemas, round and call limits, fenced results | Built partly (tools layer) [V]; new tools untested |
| Prompt injection | System prompt kept separate from user content; all retrieved, product, page and search text fenced as untrusted data; instructions inside never authorise tools; outputs verified; model output cannot select identity. **Google prompt-injection guidance was not found** (the system-instructions page returned 404) [U] | Partly built; evaluation set to be written |
| Sensitive information protection | Redaction before any model call; secret/system-prompt leak check on output; protected-string list | New (verifier v2 has the leak check) |
| Payment security | No card data anywhere; only COD and bank transfer exist [V]; payment and final order placement never model-callable | Rule |
| Order confirmation | Confirmation bound to session + action hash + payload, single use, expiry; success comes only from the verified backend result | Pattern built [V] |
| Claim verification | Verifier v2 | Built, unwired |
| Audit logging | Event ids, tool names, outcome codes, token counts, cost; never message text, audio or addresses | Pattern [V] |

### 13.2 What must be closed before ANY hosted-model traffic [P]

| Finding (`VOLTA_SECURITY_AUDIT_REPORT.md`) | Why it matters for Gemini | Needed before first hosted traffic? |
|---|---|---|
| S-01 shared guest counter (live code) | New-conversation allowance; budget abuse | **Yes** (the fix exists locally; deploy approval pending) |
| S-02/S-03/S-04/S-05 client-address trust, port 8090 unverified, IPv6 /64 | Per-address cost and rate limits depend on the address being real | **Yes** (decide 8090; deploy the hardened `clientIp`) |
| S-12 exposed credentials not rotated (website server, AI panel and rescue, new-server root) | A hosted key on a host with exposed credentials is unacceptable | **Yes** |
| S-11 temporary SSH keys installed | Access path to the gateway host | **Yes** (remove) |
| S-13 website disk 91% | Blocks the gateway build/recreation | **Yes** if co-located |
| S-14 no alerting | Budget alerts need a delivery channel | **Yes** |
| S-16 live Agent runs from a test entry | The gateway needs a real production entry | **Yes** (entry prepared locally) |
| S-09 preview key in nginx logs | Harmless today (the key is empty); redact before customer text could appear in query strings | Recommended |
| S-15 no OS-level browser isolation | Only for the browser | Before browser only |
| S-10, S-17 | Operational | No |

### 13.3 Privacy and data flow to Google [P], facts [V as reported]

| Question | Answer from the Gemini API Additional Terms (effective 2026-03-23, read via the fetch tool) | Consequence |
|---|---|---|
| Free tier | Google uses submitted content and responses to "provide, improve, and develop" products; "human reviewers may read, annotate, and process"; "Do not submit sensitive, confidential, or personal information" | **Never use the free tier for customer text** |
| Paid tier | "Google doesn't use your prompts ... or responses to improve our products"; "logs prompts and responses for a limited period of time" (**period not stated**) | Acceptable only if the owner approves; legal review [U] |
| Search grounding | Google stores prompts, context and output for **30 days** | Treat grounded turns as stored for 30 days |
| Data processing | Processed under a Data Processing Addendum for products where Google is a data processor; how it is accepted [U] | Obtain and read it |
| Zero retention, regional processing | Not found | [U]; ask Google or choose a different product tier |
| Sri Lankan law | Sri Lanka's Personal Data Protection Act (2022) may apply to processing customers' data and cross-border transfer | **[U] legal advice needed; not assessed here** |

**Never sent to a model [P]:** names, phone numbers, emails, national ID numbers, delivery addresses, **order references** (they are bearer credentials), passwords, payment details, admin data, chat/pre-order/wholesale records, ERP or device secrets, and any image containing personal data. **Redaction layer:** detect and replace phone numbers (including `+94` and `07x` forms), emails, old and new NIC formats, order references (`VLK-yymmdd-` plus 10 characters), payment-card numbers (Luhn) before the call, with placeholders; typed personal data is not used by the model. **Customer notice** (text proposed, Sinhala wording needs native review): "Your messages are processed by Google's Gemini service to answer you. Please do not share personal or payment details in the chat." **Shadow mode** keeps comparisons in memory and aggregate counts only; no customer message is written anywhere (section 16).

---

## 14. Budget and pricing

All prices are from `gemini-facts.md` (fetched 2026-11-14, **[V as reported], to be re-read by a person**). Exchange rate: 337.05 LKR per USD, **an unofficial figure** extracted from a garbled CBSL daily-indicators PDF dated 2026-11-09 (the official rate pages did not load) [A]; the sensitivity of the whole section to the rate is in 14.4. Token shapes are my assumptions [A]; real shapes must be measured with `countTokens` and usage metadata once an approved key exists.

### 14.1 Models, prices, schedule [V as reported]

| Model (API id) | Input $/1M | Output $/1M (incl. thinking) | Notes |
|---|---|---|---|
| `gemini-3.5-flash-lite` | 0.30 | 2.50 | Stable; cached input $0.03; batch half price |
| `gemini-2.5-flash-lite` | 0.10 | 0.40 | "not deprecated"; older |
| `gemini-3.8-flash` / `3.6-flash` | 0.75 -> **1.50 on 2027-01-01** | 3.75 -> **7.50** | |
| `gemini-3.1-pro-preview` | 2.00 (<=200k) / 4.00 | 12 / 18 | no free tier |
| `gemini-3.5-transcribe` | $0.003 per minute audio in | $0.002 per minute text out | no Sinhala listed |
| `gemini-3.8-flash-lite-tts` | text in 0.50 -> 1.00 | audio out 6.00 -> **12.00 (2027-01-01)** | about $0.0015 per 10 s now |
| `gemini-3.8-live` | audio in about $0.005/min | audio out about $0.018/min | |
| Google Search grounding (Gemini 3+) | 5,000 free queries/month, then **$14 per 1,000** queries; default cap 1,500/day | | billed per query the model runs; pricing page has contradictory cells for some models [U] |

Schedule: deprecated models reroute on **2026-12-01** (`2.5-flash` -> `3.5-flash-lite`, `2.5-pro` -> `3.8-flash`); `3.1-flash-lite` shuts down **2027-05-07**; preview TTS shuts down **2026-12-18**. **Budgets must use the post-change prices.**

### 14.2 Cost model for LKR 3,000 / month [A, computed from the table at 337.05]

Budget in USD: soft LKR 2,400 = **$7.12**; hard LKR 2,700 = **$8.01**; total LKR 3,000 = **$8.90**; reserve LKR 300 = $0.89.

Per-turn shapes on `gemini-3.5-flash-lite` (no thinking, no cache, no Sinhala token inflation):

| Shape (assumed tokens) | USD | LKR | Turns at hard limit | At soft limit |
|---|---|---|---|---|
| S1 short answer (1,500 in / 150 out) | 0.000825 | 0.28 | 9,709 | 8,631 |
| S2 tool turn, 2 calls (5,600 in / 370 out over two model calls) | 0.002605 | 0.88 | 3,075 | 2,733 |
| S3 search-grounded (6,500 in / 400 out), searches inside the free 5,000 | 0.002950 | 0.99 | 2,715 | 2,413 |
| S3 with 2 paid searches | 0.03095 | **10.43** | 259 | 230 |
| S4 voice exchange (10 s transcribe + short answer + 15 s TTS), now | 0.003875 | 1.31 | 2,067 | |
| S4 after 2027-01-01 (TTS price doubles) | 0.006125 | 2.06 | 1,307 | |
| S5 long history (8,000 in / 200 out) | 0.002900 | 0.98 | 2,762 | 2,455 |

**Blended mix** (70% S1, 15% S2, 5% S3, 5% S4, 5% S5): **LKR 0.49 per turn** now (0.53 after January); about **5,500 turns a month at the hard limit** (5,100 after January), 4,900 at the soft limit. An average 6-turn conversation is about LKR 2.9. **Observed volume** is about 99 chat requests a day [V], roughly 3,000 a month if sustained [A, includes test traffic]: headroom about **1.85x** in the base mix.

### 14.3 Voice and search guard rails [P]

* **Search:** after the free 5,000 queries a month, each query is LKR 4.7; all of the hard limit buys only about **572** paid queries. [P] Default: the controller treats grounded search as billable from the first query (conservative, because the free allowance's billing preconditions are [U]), allows search only for turns the model justifies, caps searches per turn at 2 and per day, and **disables paid search** (free allowance only) unless the owner raises the budget.
* **Voice:** push-to-talk exchanges cost 5 to 7 times a text turn; Live sessions are at most about 2.5 times the push-to-talk cost per audio-minute but open-ended. Voice has its own sub-budget line (for example at most 15% of the monthly budget) so it cannot starve text.

### 14.4 Sensitivity [A]

| Case | Mix cost / turn | Turns at hard limit | Reading |
|---|---|---|---|
| Base | LKR 0.49 | 5,507 | |
| Exchange rate +10% (370.8) | same in USD; budget $7.28 | 5,006 | |
| Exchange rate -10% (303.3) | budget $8.90 | 6,119 | |
| **Sinhala-heavy** (assume Sinhala text costs 3x tokens: 40% of input and all output) | LKR 1.02 (2.1x) | **2,639** | **below observed volume**; Sinhala token ratio for Gemini is **[U]**, measure with `countTokens` |
| **Thinking tokens 1,000 per turn** (billed as output) | LKR 1.33 (2.7x) | **2,025** | the largest controllable risk: cap thinking (budget or level) per role |
| Thinking 300 per turn | LKR 0.74 | 3,633 | |
| Cheaper model `gemini-2.5-flash-lite` for the whole mix | LKR 0.17 (0.3x) | about 16,000 | quality and its future retirement are [U] |
| Hybrid 80% flash-lite + 20% `gemini-3.8-flash` (post-January prices) | LKR 0.75 | 3,586 | |

The **gap to a failure** is therefore modest: a Sinhala-heavy workload with thinking left on would exhaust the hard limit in the first third of a month at observed traffic. The controller's downgrade rules (14.5) exist for this case.

### 14.5 Budget controller [P]

**Persistent state.** Today the Agent is memory-only [V]; a restart must **not** reset spend. The ledger lives in a store that survives restarts and deploys: either a table in the website PostgreSQL (restricted role; simplest if the gateway is co-located) or a small SQLite file on a persistent volume (single instance) [D]. Counters: per day and per month, per model, per kind (text, audio, search), in micro-dollars, with a hash of the price table version used.

**Per-call protocol.** (1) *Reserve:* estimate the worst case = `countTokens(input) x input price + max output tokens + thinking budget) x output price` (plus search and audio components); if the estimate cannot use `countTokens` (its cost and limits are not stated [U]), use a conservative character-based estimate calibrated against real usage; atomically add it to `reserved` only if `spent + reserved + estimate <= cap` (a single transaction or a row lock, so concurrent turns cannot overshoot). (2) *Settle:* after the response, replace the reservation with the real cost from usage metadata (input, output, **thought**, cached, tool-use tokens). (3) *Failure rules:* 400/500 responses are not billed [V as reported] -> release; a timeout with unknown outcome -> keep the reservation as spent; (4) a crash between reserve and settle is repaired by a sweeper that converts stale reservations to spent after a timeout.

**Limits and behaviours.**

| Level | Trigger | Behaviour |
|---|---|---|
| Daily soft | spend above `remaining soft budget / remaining days x 2` (about LKR 160 in an average day) | cheaper model, shorter history, no search, no TTS until tomorrow |
| Monthly soft (LKR 2,400) | spend at 80% | downgrade chat model to the cheap class, disable search and TTS, shorten history, cap output; alert |
| Monthly hard (LKR 2,700) | reached | no Gemini calls; degraded deterministic mode with honest "AI service temporarily unavailable" for non-shopping messages; alert |
| Emergency reserve (LKR 300) | never spent by the application | absorbs billing lag, thinking overshoot and rate drift; a single worst-case call (20,000 in / 3,000 out on flash-lite) is about LKR 4.6, and 10 minutes of lagged spend at peak traffic is about LKR 3 |
| Per-session and per-customer quotas | token and cost caps | stop denial-of-wallet from one visitor |

**Alerts** (through the alert channel from S-14): 50%, 80%, 100% of soft/hard, daily spike, ledger-versus-billing variance above 10%, provider 402/429 events, model deprecation notices.

**Reconciliation.** Daily compare the ledger with Google's spend view (AI Studio spend page; Cloud Billing export if a Cloud project is linked [U]); cost breakdowns lag up to 24 hours and Cloud Billing data can lag more [V as reported]; correct the price table or the estimate factors when variance exceeds 10%.

**What application-side enforcement cannot do.** It cannot guarantee exact billing: prices and tokenisation can change, thinking tokens and tool-use tokens are only known after the call, usage metadata may differ from billing, FX and card fees are outside the ledger, batch/agent usage may exceed caps, and failed requests still count against quota. **Provider-side controls found [V as reported]:** project **spend caps exist but are labelled experimental with about 10 minutes of billing latency**; enforced **tier caps** (Tier 1 $250 a month, "service is paused" at the cap: far above this budget, so it does not protect it); a **spend-based rolling 10-minute limit** (Tier 1 $10); and **prepay**: minimum $5 ("or equivalent"), HTTP **402** when the balance reaches $0, applying to all linked projects. **[P] Use prepaid billing with a small balance as the only true hard stop** (for example top up in the amount of the hard limit; the minimum prepay is already about 62% of LKR 2,700), set the experimental spend cap as a second layer, and avoid postpay. Whether prepay is available in Sri Lanka and in LKR is **[U]** and decides the plan.

---

## 15. VPS decommission plan

**Authority:** nothing in this section may be executed without its own explicit approval (decision 20 in section 22). The old server (`2.29.97.114`) is a separate authorisation and is never contacted by this plan.

### 15.1 Preconditions (all must hold) [P]

| # | Precondition | How it is verified |
|---|---|---|
| 1 | Gateway live at 100% for at least 14 days with all go/no-go criteria met (section 21) | Gateway metrics, website flag history |
| 2 | **Zero requests to the old Agent path** for at least 14 days | Agent journal request counts, tunnel container byte counters, website route logs (counts only) |
| 3 | No other consumer of the AI VPS | Dependency map below, plus `ss` and journal checks on the VPS (read-only), owner check of any monitoring/billing/DNS referencing its IP |
| 4 | Rollback drill passed (section 17) and the rollback window ended | Drill record |
| 5 | Website database backup and restore verified (unrelated to the VPS but a gate for any infrastructure change) | Backup job and a restore test [U: currently unverified] |
| 6 | Credentials rotated and temporary keys removed (section 15.3) | Checklist |

### 15.2 Dependency checklist (from `infra-inventory.md` section 4, all [V] unless marked)

| # | Dependency on the AI VPS | Action in the Gemini architecture | Verified zero before removal? |
|---|---|---|---|
| 1 | Website `AI_AGENT_URL=http://127.0.0.1:18787`, container `volta-ai-tunnel-new`, `/opt/valta/ai-tunnel-new/{id_ed25519, known_hosts}` | Point to the gateway; remove container and key folder after the rollback window | Tunnel idle |
| 2 | HMAC pair `AI_AGENT_HMAC_KEY_ID/SECRET` (website) vs `AGENT_HMAC_KEYS` (Agent) | New pair for the gateway; retire the old | Rotated |
| 3 | Catalogue relay keys `AI_CATALOGUE_*` / `AGENT_CATALOGUE_*` | **Keep the relay pattern** (the gateway still calls signed read routes); rotate the secret when the gateway takes over | Gateway uses new secret |
| 4 | `AGENT_CATALOGUE_URL` (value [U]): Agent -> public website over HTTPS | Co-located gateway: loopback call; otherwise a stable allow-listed origin | Re-decided |
| 5 | Ollama and models (1.7B production; 4B, E4B, 9B experimental) | Drop; keep files until the window ends; benchmark results are already in documents | n/a |
| 6 | `volta-agent` unit, bundle, env file, Node, in-memory sessions | Port code to the gateway; no state to migrate | n/a |
| 7 | sshd users `voltaadmin`, `voltatunnel`; temporary keys; UFW `22 LIMIT`; Fail2ban | Remove with the server; **remove temporary keys first** | Keys gone |
| 8 | `volta-health` timer (installed; journal not readable by the audit user [U]) | Replace with gateway metrics and alerts | New alerts live |
| 9 | QA centre uses the Agent path (not served in production) | Re-point if kept | n/a |
| 10 | Scripts and runbooks naming the VPS (`deploy-agent.sh`, `install-agent-new-server.sh`, `switch-qwen-model.sh`, hardening/tunnel/ollama scripts, staging script) | Archive; new runbook | n/a |
| 11 | Website compose: stopped `ai-tunnel` and `ai-agent` services, old tunnel config copy `backup-ai-tunnel-20261113-155746/` | Remove in a controlled change **after** the window; never run a bare `docker compose up -d` (it would start them and collide on port 18787) | Window ended |
| 12 | Benchmark logs, `.bak-*` bundles, journald on the VPS | Archive what is needed first | Archived |
| 13 | Hosting/billing accounts (new server and old server) | Owner identifies contract, notice period, who pays [U] | Owner confirms |

**Must be preserved (website host, not AI):** `volta-web-1` and its image tags, `volta-db-1` and volume `db-data`, `volta-order-sync-1`, nginx vhosts (including the `/demo-erp/uploads` location while mock ERP remains referenced), TLS certificates and renewal, `/opt/valta/.env`, compose file, the unrelated hexalyte reseller stack and host Postgres, UFW rules for 80/443/8080, the backups folder. **Do not remove website hosting, the primary backend, PostgreSQL or any unrelated service.**

### 15.3 Credential rotation checklist (names only) [P]

Exposed earlier in chat sessions and **not yet rotated** [V]: the website server root password; the AI server hosting-panel and rescue passwords; the new-server root password; the old server's root password. Also rotate: the website-to-Agent HMAC pair, the catalogue relay pair, the tunnel key pair and its pinned host key file, the temporary migration key (`...REMOVE-AFTER-MIGRATION`) and the second temporary key (`...REMOVE-AFTER-USE`, authorisation status [U]) on every host they were installed on, and the preview key (empty today). New secrets: the Gemini API key and any gateway signing keys, created fresh, stored root-only, never pasted into chat.

### 15.4 Removal order [P]

1. Verify preconditions; snapshot and archive logs and artefacts to be kept.
2. Remove the website's tunnel container, key folder and stale compose services in one reviewed change (rollback artefacts kept until step 6).
3. **Stop** (not delete) `volta-agent` and `ollama` on the AI VPS; observe for 7 days for any error report.
4. Rotate and remove credentials and temporary keys.
5. Remove the VPS from monitoring and DNS references (if any).
6. After the retention period, cancel billing and delete the VPS through the hosting panel; confirm data-retention terms with the provider.
7. **Old server:** the owner views the hosting panel first (no SSH): state, billing, any references; then a separate decommission approval.

---

## 16. Migration phases

| Phase | Work | Entry criteria | Exit criteria (go/no-go in section 21) |
|---|---|---|---|
| **1 Infrastructure audit** | Read-only dependency mapping; close the [U] items in `infra-inventory.md` section 5 (e.g. `ollama list`, DNS provider, backups, which process is on `:3000`, old-server state via the hosting panel) | This plan reviewed | Inventory complete; unknowns resolved or accepted by the owner |
| **2 Gemini foundation** | Gateway skeleton, `LlmProvider` + Gemini adapter (fake first), model config and fallback list, budget ledger and controller, breaker/retries, usage accounting, production entry point | Approvals A (given), B, C for real calls | Fake-provider tests green; with an approved test key: adapter conformance tests, `countTokens` and usage calibration, spend within the test budget |
| **3 Intelligence migration** | Turn loop, context assembly, function-calling bridge, verifier v2 integration, history, honorific policy, lane switch `off/shadow/on` (default off), contract 1.4 | Phase 2 done | New LLM DEV set run against the real model; acceptance examples pass by assertions; regression guard unchanged |
| **4 Capability migration** | Internal routes G1/G2/G6/G7/G8; cart proposals; search; push-to-talk voice; (deferred: checkout prepare/confirm, browser controller, Live) | Phase 3 done; privacy approval D for any real data | Per-capability tests; owner-approved policy text; native Sinhala pass for voice |
| **5 Testing** | Functional, multilingual, security, load, latency and cost tests with a capped test budget | Phases 3 and 4 | Section 21 test thresholds |
| **6 Shadow mode** | Staging/replay with **consented test messages only**; the new lane runs next to the old one and **only aggregate comparison counts are kept in memory** | Phase 5 + approval D | Agreement and quality metrics; no message text stored |
| **7 Gradual cutover** | Website-side flag by session hash (see 16.1) | Phase 6 + approval F per stage | Stage criteria |
| **8 Rollback validation** | Drill: return 100% to the old path; measure recovery | A working old path (VPS intact) | Recovery within target |
| **9 VPS decommission** | Section 15 | Phase 8 + 14 days at 100% | Zero dependencies verified |

### 16.1 Rollout mechanism and the sample-size problem [P]

Mechanism: the website chooses the backend per conversation by `hash(session id) mod 100 < percent` (sticky; a conversation never switches), controlled by a server-side setting; the old Agent path (tunnel + AI VPS) remains reachable until phase 9; a kill switch returns everyone to the old path. Contracts: the website sends contract 1.2 to the live Agent and 1.3/1.4 to the gateway; **order of changes: gateway first, website second; rollback website first** (lesson from contract 1.2, `VOLTA_AI_OPERATIONS_RUNBOOK.md` section 5 [V]).

**Challenge to the brief's 1% -> 10% -> 50% -> 100% ladder:** observed volume is about 99 chat requests a day [V]. **1% is about one conversation a day** (no statistical signal; 150 turns would take months). [P] Gate stages on **turn counts and days, not percentages alone**: stage 0 = staff and invited testers (at least 300 turns, consented); 10% = at least 150 real turns and 14 days; 50% = at least 300 turns and 7 days; 100% = 14 days before any decommission step. At current traffic the whole ladder takes roughly **6 to 8 weeks** [A].

---

## 17. Rollback plan

| Situation | Action | Notes |
|---|---|---|
| Quality, safety or budget trigger at any stage | Set the percentage to 0 (website setting), no deploy | Old path must stay intact: **do not touch the AI VPS, tunnel, keys or Ollama until phase 9** |
| Gateway outage | Breaker opens: degraded mode inside the gateway; if the gateway host is down, set percentage to 0 | Website degrades to its plain "assistant unavailable" error if both paths fail |
| Website regression after the website change | Roll the website back first (image tag, then recreate the tunnel container: shares the web container's network namespace), gateway second | Do not use `deploy-web.sh` as written; never a bare `docker compose up -d` |
| Contract mismatch after rollback | A 1.3/1.4 website needs a gateway that speaks it; an old website works with the new gateway | Order rule above |
| Budget overrun | Hard limit stops Gemini calls automatically; percentage to 0 to return to the old path | Spend already incurred cannot be reversed |
| Privacy incident | Disable the gateway lane; preserve counts only; assess what Google retains (prompts logged for a limited period; grounded prompts 30 days [V as reported]) | Data sent to Google **cannot be recalled** |

**Phase 8 drill [P]:** at a quiet time with the owner present, move 100% to the old path and back, measure time to recover (target under 10 minutes, [A]), confirm the old path still answers live shopping turns, and record the result. A rollback has **not** been rehearsed end to end in any earlier work [V, `VOLTA_AI_OPERATIONS_RUNBOOK.md`].

---

## 18. Testing strategy

**Principles [P]:** frozen EVAL and HOLDOUT sets stay unmodified and are **regression guards only** (no longer held-out: the M4 holdout file was once printed with two failing messages visible, [V R0 report]); the **held-out evaluation for Gemini must be NEW**, written by someone who has not seen the development set, and never tuned on; development and held-out results are reported separately and never blended; **fake-provider and mock tests prove plumbing, not Gemini quality**, and must not be reported as real integration tests; production readiness cannot be claimed from them.

| Area | Tests | Type (what it proves) |
|---|---|---|
| Sinhala, Singlish, English, mixed | New DEV set (about 100 scenarios per language group) + new held-out set; native-speaker review of Sinhala outputs | Real model (needs approved key); fake model only for plumbing |
| General knowledge, calculation | The acceptance examples as assertions (capital of France, 15% of 2400, explain Python, current-information question that must trigger search, processor explanation) | Real model; assert tool use, correctness, citations, not fixed sentences |
| Multi-turn context, corrections, negation, instructions | R0/M8 scenarios reused as seeds; exclusions must **never** appear | Deterministic assertions on cards and text |
| Product recommendation, price and stock verification | Every number in an answer traced to this turn's tool results (verifier v2); hallucination count must be zero in the reviewed sample | Real model + fixture catalogue + real relay on staging |
| Browser navigation and domain restrictions | Existing real-Chromium suites on Linux with isolation; model-driven injection evaluation | Real browser; later |
| Tool permissions, prompt injection (products, web pages, search results) | Fixed attack set; tools must not be called on injected instructions | Real model + hostile fixtures |
| Payment confirmation, order operations | Confirmation binding, one-use, expiry; success text only from a verified backend result | Deterministic + staging |
| API failure handling | Provider 429/5xx/timeouts, partial streams, malformed tool calls, safety blocks (HTTP 400 `safety`) | Fake provider (plumbing) |
| Budget enforcement | Concurrency tests with parallel reservations, restart persistence, soft/hard behaviours, reconciliation | Deterministic + a small real run |
| Concurrent requests, latency, load | 20 concurrent sessions, bounded run, **cost cap on the test**; p50/p95, error rate, breaker behaviour | Real provider (capped) |
| Voice quality | Native-speaker plan (section 12.3) | Real audio, real people |
| Rollback behaviour | Phase 8 drill | Real |

**LLM-as-judge caveat [P]:** a judge model may screen large sets but must be calibrated against human labels on a sample, must not be the same model family under test without a stated bias check, and never replaces native-speaker review or numeric assertions.

**Test budget [A][D]:** a full 2,000-turn run at the base mix is about $3 (about LKR 1,000); set a separate test allowance (for example at most $10 for the whole evaluation campaign), tracked in its own ledger line and **not** taken from the production reserve.

---

## 19. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation | Label |
|---|---|---|---|---|
| 1 | Spend overrun (thinking tokens, Sinhala token inflation, long history, search, voice) | High / High | Reservation + settlement, thinking caps, soft downgrade, voice and search sub-budgets, prepaid balance as hard stop, daily reconciliation | [P] |
| 2 | Google-side hard stop is weak (experimental caps, 10-minute lag) | Certain / Medium | Prepaid billing, application ledger, reserve | [V as reported] |
| 3 | Privacy: customer text to a third party; unspecified paid-tier log period; legal exposure [U] | Medium / High | Paid tier only, redaction, notice, DPA, owner and legal approval before any customer traffic | [D] |
| 4 | Sinhala/Singlish quality unproven (text, transcription, TTS, Live) | High / High | Native-speaker evaluation; honest language scope per feature; English-only voice fallback | [P] |
| 5 | Model and price churn (reroutes 2026-12-01, shutdown 2027-05-07, price increases 2026-12-01 and 2027-01-01) | Certain / Medium | Configuration, fallback list, daily availability check, price table under review | [V as reported] |
| 6 | Provider outage; no SLA found for the Developer API | Medium / Medium | Circuit breaker, degraded deterministic mode, honest messages | [P] |
| 7 | Prompt injection through products, web pages, search results, browser | Medium / High | Fencing, no tool authorisation from content, verifier, evaluation set; Google guidance not found [U] | [P] |
| 8 | Denial of wallet: one visitor burns the budget | Medium / High | Per-session and per-customer token quotas, address limits (after S-01..S-05 fixes) | [P] |
| 9 | Gateway on the website host: disk 91%, 2.1 GB RAM, key next to ERP credentials | Medium / High | Prune approved images, resource limits, separate user, or a small separate host [D] | [V]/[P] |
| 10 | Exposed credentials and temporary keys still present | Certain / High | Rotate and remove before any hosted traffic | [V] |
| 11 | Commerce functions need new backend routes; policy text is starter content | Certain / Medium | Phase them (section 9); owner approves policy text | [V] |
| 12 | Browser controller isolation and Linux behaviour unproven | High / High | Defer; separate host; fresh independent review | [V] |
| 13 | Over-trust of model output (claims an order was placed) | Medium / High | Success only from verified backend results; verifier checks action claims | [P] |
| 14 | Sample size too small for the 1%/10% ladder | Certain / Medium | Gate on turn counts, staff testers, longer calendar | [V] |
| 15 | The stopped foundations code is partly untested | Certain / Medium | Finish tests before wiring; independent review | [V] |
| 16 | Old server state unknown; removing it blind could break something | Low / Medium | Owner checks the panel; separate approval | [U] |
| 17 | Billing from Sri Lanka (account, LKR, prepay availability, FX/card fees) unverified | Medium / High | Owner confirms with Google before phase 2 real calls | [U] |
| 18 | Vendor-page facts were read through a summariser | Certain / Medium | A person re-reads pricing, terms, billing | [V] |

---

## 20. Implementation roadmap

Effort in **engineer-days** [A]: one engineer who knows the codebase; includes tests and documentation; **excludes** waiting for approvals, native-speaker reviewers' calendar time, and rollout soak periods.

| Phase | Items | Days | Depends on |
|---|---|---|---|
| 1 | Close unknowns by read-only checks and owner questions | 2 | none |
| 2 | Gateway placement and setup 3-5; `LlmProvider` + Gemini adapter + model config 5-6; retries/breaker/normalisation 3-4; budget ledger and controller (store, reservation, settlement, alerts, reconciliation) 6-8; production entry and CI bundle 1-2 | 18-25 | Approvals B, C, E; security prerequisites (13.2) |
| 3 | Finish and test the stopped foundations (verifier v2 wiring, executor/parser/fence tests, calculator test fix, search tests) 6-8; turn loop + context assembly 8-10; Gemini function-calling bridge incl. thought signatures 3-4; history + honorific policy 4-5; lane switch + contract 1.4 + website mirror 5-6 | 26-33 | Phase 2 |
| 4 (first release) | Internal routes G1/G2/G6/G7/G8 with tests 8-10; cart proposals (widget) 3; policy knowledge and owner-approved text 4-5; search lane with citations UI 5-6; push-to-talk voice (Gemini provider, UI check) 4-5 | 24-29 | Phase 3; approval D |
| 4 (deferred) | Checkout prepare/confirm 8-10; browser controller (host, isolation, review, model-driven path) 8-10; Live voice 8-10 | 24-30 | Separate approvals |
| 5 | New DEV and held-out sets + judge calibration 8-10; load/latency 3; security and injection tests 4; native Sinhala evaluation 5 (people time extra) | 20-22 | Phases 3-4 |
| 6-8 | Shadow 3-4; cutover management 3-4; rollback drill 2 | 8-10 | Phase 5 |
| 9 | Decommission checklist execution | 3-4 | 14 days at 100% |
| **Total first release** | | **about 100 to 125** | |
| **Deferred scope** | | **about 25 to 30** | |

Critical path: security prerequisites and approvals -> gateway and budget -> turn loop -> held-out evaluation with native review -> staged cutover -> decommission. Parallelisable: internal commerce routes, policy text, UI work, test-set writing, native-speaker recruitment.

---

## 21. Go/no-go acceptance criteria (measurable; thresholds are proposals [A] to be agreed)

| Gate | Criterion | Threshold |
|---|---|---|
| **Before phase 2 real calls** | Approvals B, C and E; security prerequisites S-01..S-05, S-11..S-14, S-16 closed; billing method confirmed | all yes |
| **Phase 3 exit** | Acceptance examples pass by assertion; grounded-fact hallucinations in the reviewed development sample | 0; exclusions never shown: 0 violations; all existing deterministic tests green; frozen hashes unchanged |
| **Phase 5 exit (held-out, new set)** | Intent and answer relevance per language group; Sinhala native-reviewer "acceptable" rate | agreed numbers, Sinhala at least 90% acceptable in at least 200 reviewed turns [A]; **zero** unsafe or fabricated store facts |
| Latency | End-to-end p50 / p95 for text turns | p50 at most 4 s, p95 at most 10 s [A] |
| Reliability | Error and timeout rate over a rolling 24 h at each stage | below 2%; breaker events explained |
| Verifier | Rejection and repair rates; unverifiable-message rate | below 5% rejection; each rejection class explained |
| Cost | Cost per conversation (6-turn average) and per month vs ledger | at most LKR 4 per conversation p95 [A]; projected month inside the soft limit; **ledger-versus-billing variance** at most 10% |
| Budget safety | Concurrency reservation test, restart persistence, hard-limit behaviour | all pass |
| Security | Injection set, tool-permission tests, address limits, key exposure scan, logs contain no message text | all pass; independent review has no open High |
| Privacy | Approval D, customer notice live, redaction tests, DPA read | all yes |
| Stage 0 -> 10% | 300 consented turns, no safety incident, rollback tested in staging | yes |
| 10% -> 50% | at least 150 real turns and 14 days, criteria above held | yes |
| 50% -> 100% | at least 300 turns and 7 days, criteria above held, drill planned | yes |
| **100% -> decommission** | 14 days at 100% with zero old-path traffic, phase 8 drill passed, preconditions in 15.1 | yes |
| **Voice** | Native-speaker evaluation passed per language, or the language is excluded from voice | per language |
| **Browser** | Fresh independent review (no High/Critical), isolation on Linux, injection evaluation, approval | all yes, otherwise stays off |
| Any stage | Any security incident, any confirmed wrong price or stock, error rate above 5% for 15 minutes, budget alarm at hard limit | **automatic rollback** |

---

## 22. Outstanding decisions

| # | Decision | Recommended option | What it unlocks |
|---|---|---|---|
| 1 | Where the gateway runs | Container on the website host after disk is freed (option A) for the first release; browser on a separate small host later | Deployment plan |
| 2 | Approve sending customer text to Google (paid tier only) and obtain legal advice on Sri Lankan data-protection rules | Approve only after legal review and the DPA is read | Any real customer traffic |
| 3 | Customer notice wording (English, Sinhala with native review) | Show before the first message | Customer-facing launch |
| 4 | Billing account: owner, card, currency, prepay amount; whether Sri Lanka can open it and in LKR | Prepaid, balance about the monthly hard limit | Any real key |
| 5 | Budget numbers (LKR 3,000 total, 2,400 soft, 2,700 hard, 300 reserve) and the voice/search sub-budgets | Keep; re-check after measuring real token use | Controller configuration |
| 6 | Resume or restart the stopped foundations work | Resume: finish tests, fix the calculator test, then wire; independent review | Phase 3 start |
| 7 | Model selection per role | Choose only after a measured comparison with an approved key; start the comparison with the cheap class and one step up | Production model config |
| 8 | Thinking policy (off, low, capped) | Capped per role; measured | Cost control |
| 9 | Search provider and display rules | Gemini grounding after reading its Terms; retrieval-provider alternative kept behind the interface | Search lane |
| 10 | Browser host and whether browsing is in scope for the first release | Out of scope for the first release | Browser phase |
| 11 | Long-term memory | Stay disabled; separate privacy design later | Memory phase |
| 12 | Voice scope | Push-to-talk text-to-text first; TTS after listening tests; Live deferred; Sinhala voice only after native evaluation | Voice phase |
| 13 | Native Sinhala reviewers and speakers (who, how many, paid?) | At least 12 speakers, 5 raters | Sinhala claims |
| 14 | Policy text for delivery, warranty, returns | Owner replaces starter text and approves | Policy answers |
| 15 | Commerce scope per release (cart proposals, order status, checkout hand-off) | Catalogue read-only first; cart proposals second; order status third | Backend work |
| 16 | Cart design: browser cart with proposals (Option A) or server cart (B) | Option A | G3 |
| 17 | Gateway budget store: website PostgreSQL table or local SQLite volume | PostgreSQL if co-located | Ledger |
| 18 | Security prerequisites to close first (port 8090, deploy hardened client-address code and guest-counter fix, rotate credentials, remove temporary keys, alerting) | All of 13.2 | Any hosted traffic |
| 19 | Rollout ladder and gates (turn counts, not only percentages) | Section 16.1 | Cutover |
| 20 | Decommission authorisation (new VPS) and a separate authorisation for the old server (hosting-panel check first) | After 14 days at 100% | Cost saving |
| 21 | Owner-instruction channel (persona, forbidden brands) | A small authenticated policy record, designed later | "Follows the owner's instructions" |
| 22 | Whether to commit and merge the large uncommitted tree before building on it | Yes, in reviewed commits, before the gateway work starts | Clean base for phase 2 |

---

## Self-check (appendix; not one of the 22 sections)

**Numbers and their sources.** Gemini prices, limits, dates, terms: `gemini-facts.md` (fetched 2026-11-14 through a summariser; **re-read by a person before any spending decision**). Budget conversions and all cost figures: my computation in this document (scripts `cost.js` and `cost2.js` in the scratchpad, rate 337.05 LKR/USD, unofficial). Token shapes, the traffic mix, Sinhala token ratio, thinking tokens, thresholds, effort days: **assumptions**, labelled [A]. Infrastructure facts: `infra-inventory.md` and the audit evidence it cites. Backend API facts: `api-inventory.md`. Repo facts: file:line as cited (`apps/agent/src/models/types.ts:10`, `session/store.ts:99`, `auth/hmac.ts:38`, `apps/web/src/lib/assistant/schema.ts:23`, `apps/web/src/store/cart.ts:10`). State of the foundations code: read-only inspection on 2026-11-14 (file counts, line counts, one failing test).

**Unknowns, consolidated:** raw Google pages and several page dates; per-model request limits for text models; whether billing/prepay can be opened from Sri Lanka and in LKR; Cloud Billing budget alerts; zero-data-retention and the paid-tier log retention period; display/caching rules for Search grounding; billable status of Search on every model; any Google prompt-injection guidance; Sinhala quality of every model, Sinhala token ratio, Singlish; concurrent Live sessions; the official CBSL rate for 2026-11-14; the `@google/genai` version; Sri Lankan legal requirements; exact models installed on the AI VPS; `volta-health` state; DNS provider; website backup and restore; the old server's state, billing and references; the value of `AGENT_CATALOGUE_URL`; whether the host `:3000` process contains VOLTA code; port 8090 external reachability; Linux browser behaviour; real catalogue size ("about 7,000" unverified; 7 seen); real traffic mix (Sinhala share, search share, voice share).

**Not done on purpose:** no account, key, billing, API call, server contact (the old server never), customer data, commit, push or deploy; the only repo change is this document.
