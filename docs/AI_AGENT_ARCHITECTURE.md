# VOLTA.LK Hybrid AI Shopping Assistant: architecture and implementation plan

Status: **design only. Nothing in this document is implemented or deployed.** No code, migration, port, model setting or production service was changed to produce it.

**Owner decisions of 2026-11-12 are recorded in [AI_M0_DECISION_RECORD.md](AI_M0_DECISION_RECORD.md). Where this document and the record differ, the record wins.** M0 is still open (website host and egress IP unconfirmed).

How to read the evidence in this document:

- **[measured]** was run on the AI server (Hetzner CX23, 2 vCPU, 4 GB RAM, 2 GB swap, CPU only) during phases 1 to 5.
- **[repo]** was read from this repository at the time of writing.
- **[estimate]** is reasoning that has *not* been measured. It must be validated in the milestone named next to it.

---

## 1. Summary of the design

One assistant, one API, two language paths. The user never sees two bots.

1. A **Node.js Agent API** on the AI server is the only component that talks to Ollama. Ollama stays on `127.0.0.1:11434`.
2. **The website backend (Next.js) is the only caller of the Agent API.** Browsers never reach the AI server. The browser talks to a same-origin Next.js route, which authenticates the shopper and forwards a signed request.
3. **Models never hold facts or authority.** Every product name, price, stock level, specification, warranty, promotion, delivery charge and order status comes from VOLTA backend responses, and is rendered as structured *cards* plus templated text. A model may write connective prose only, and an output verifier rejects any prose that contains a number, price or product name that is not in the tool results.
4. **Sinhala and English take different paths** because the evaluation showed the two models are complementary and each is unsafe on the other's job:
   - English: Qwen3 1.7B selects tools and writes the reply; every tool call is validated against a Zod schema.
   - Sinhala / Singlish / mixed: a deterministic router (normalisation, lexicon, rules, catalogue entity extraction) selects the tool; SinhalaLLM writes prose only; nothing is trusted from the model except wording.
5. **No order is ever created by the assistant in v1.** It hands the customer to the existing `/checkout` page, which already enforces price re-check, terms acceptance, COD rules and ERP idempotency.
6. **Cart is client-side today** [repo], so cart tools return *proposed client actions* that the browser applies. No server cart or migration is needed.

### Owner decisions (resolved 2026-11-12; details and blockers in the M0 decision record)

| # | Decision | Resolution |
|---|---|---|
| D1 | Website host and egress IP | **Still unknown; blocker B1.** Not guessed. Network integration stays blocked; no `AllowUsers`, tunnel user, WireGuard, port or public API change is approved. |
| D2 | Network path | SSH tunnel for staging, WireGuard for production, Ollama never public. |
| D3 | Node version on the AI server | **Node 24 LTS (v24.22.3), installed 2026-11-12** under `/opt/node` from the official tarball after GPG and SHA-256 verification; run as `/opt/node/current/bin/node`. No dependencies installed, system Node untouched. |
| D4 | Customer messages | Not stored by default, never used for training by default; explicit opt-in for redacted retention; retention and deletion policy documented. |
| D5 | Guests | **Approved:** product details and specifications, current prices and promotions, stock, compatible accessories, comparisons, and the delivery charge when verifiable from live backend data; browser-side cart proposals only; **authentication required for account- and order-specific information** (no guest order lookup through the assistant; guests are sent to `/track-order`). Abuse protection is built-in limits first, CAPTCHA-ready, nothing purchased. |
| D6 | Sinhala quality | Native-speaker review and a Sinhala/Singlish/mixed test dataset are required before any production claim. |

---

## 2. Architecture

### 2.1 Components and trust boundaries

```
 Browser (customer)                                        UNTRUSTED
   │  same-origin fetch, session cookie (httpOnly), localStorage cart
   ▼
 ┌───────────────────────────── WEBSITE HOST (Next.js 16) ─────────────────────────────┐
 │ POST /api/ai/chat, /api/ai/chat/stream   (BFF)                                       │
 │   guard(): same-host Origin + per-IP rate limit        [existing helper]             │
 │   getCurrentCustomer(): identity from session cookie   [existing helper]             │
 │   signs request (HMAC) with identity claim ──────────────┐                           │
 │                                                           │                          │
 │ /api/internal/ai/*  (NEW, tool backends, HMAC-verified) ◄─┼──────────┐               │
 │   reuse lib: listProducts, checkAvailability,             │          │               │
 │   offersForSources, loadOrderView, orderRefsFor           │          │               │
 └───────────────────────────────────────────────────────────┼──────────┼───────────────┘
                 private link (section 2.3), TLS/HMAC        │          │
 ┌───────────────────────────── AI SERVER (CX23) ───────────▼──────────┴───────────────┐
 │ Agent API (Node, unprivileged user, binds loopback or tunnel interface only)         │
 │  ┌──────────┐ ┌────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐   │
 │  │ Auth+rate│→│ Language   │→│ Router      │→│ Tool runner │→│ Response composer│   │
 │  │ limit    │ │ detect+norm│ │ (si: rules, │ │ (Zod, perms,│ │ (cards+templates │   │
 │  │          │ │            │ │  en: Qwen)  │ │  timeouts)  │ │  +prose+verifier)│   │
 │  └──────────┘ └────────────┘ └─────────────┘ └─────────────┘ └──────────────────┘   │
 │        │              Model manager + single-slot queue (section 4)  │               │
 │        ▼                                                              ▼              │
 │   audit log (JSONL)                                    Ollama 127.0.0.1:11434        │
 │                                                        (one model loaded at a time)  │
 └──────────────────────────────────────────────────────────────────────────────────────┘
        VOLTA ERP (HEXALYTE) and PostgreSQL are reachable ONLY from the website backend.
        The Agent API has no database access and no ERP credential.
```

Trust boundaries: (1) browser to BFF, (2) BFF to Agent API, (3) Agent API to tool backends, (4) Agent API to Ollama (loopback). All text from the browser, from product content, and from model output is **untrusted data**, never instructions.

### 2.2 Why the Agent API is separate from Next.js

The task requires a Node AI Agent API on the AI server. The alternative (run the orchestrator inside Next.js and call Ollama remotely) would give direct access to the `lib/` functions but would require Ollama itself to be network-reachable, which we must not do. The chosen design keeps the model host closed and needs only ten small internal tool endpoints on the website.

### 2.3 Network path (decision D2)

**Decided:** option A (SSH tunnel) for staging, option B (WireGuard) for production; option C is rejected. The production half cannot be configured until the website egress IP is confirmed (blocker B1). Details, including the tunnel account and the `AllowUsers` change that needs approval, are in the M0 decision record.

| Option | New exposure on AI server | Notes |
|---|---|---|
| A. SSH reverse/forward tunnel from website host to AI server (`autossh` under systemd) | **none** (port 22 only, already open and key-only) | Good for staging and small production. Agent listens on `127.0.0.1:8787`. Tunnel flaps must be handled with retry and a health check. |
| B. WireGuard | one UDP port, allowed only from the website host IP | Cleanest for production. Agent binds the wg address. |
| C. HTTPS reverse proxy with allow-list | TCP 443 from website IP only | Needs a domain and certificate; largest attack surface. Not recommended. |

Whatever is chosen, UFW changes need explicit approval; none are made in this phase. The HMAC layer (section 7.1) applies on top of every option.

---

## 3. Request lifecycle

### 3.1 Common steps

1. BFF validates the request, resolves the customer from the session cookie, signs and forwards it.
2. Agent verifies the signature, rate limits, and creates a `requestId`.
3. **Language detection** (deterministic): ratio of Sinhala-block characters (U+0D80 to U+0DFF) among letters; Latin-only text that matches the Singlish lexicon is `si-latin`; otherwise `en`. Mixed = Sinhala characters plus Latin product words, which is the *normal* case in Sri Lankan shopping language and is treated as Sinhala path.
4. Route (section 5 for Sinhala, section 4.4 for English), run tools, compose the reply, verify, return.

### 3.2 English turn

```
message ─► Qwen (tools=[10 schemas], think=false, temp≈0.2) ─► tool_calls
        ─► Zod validate each call; reject unknown tool / extra args / out-of-range
        ─► permission check (anon vs customer) ─► execute (parallel reads only)
        ─► cards built from tool results
        ─► Qwen writes ≤60-token prose given a *redacted fact sheet* (no prices needed in prose)
        ─► verifier ─► reply
```
Two Qwen calls per turn. Estimated 15 to 40 s on this CPU [estimate, validate in M3].

### 3.3 Sinhala / Singlish / mixed turn

```
message ─► normalise ─► lexicon+rules router ─► intent + entities (deterministic)
        ─► confidence ≥ threshold ? ─ no ─► templated clarifying question (no LLM)
        ─► tool call (built by code, not by a model) ─► cards
        ─► templated Sinhala sentence for the facts  (default; instant)
        ─► optional: SinhalaLLM paraphrase of *non-factual* connective text ─► verifier ─► else fall back to template
```
Most Sinhala turns need **no LLM call at all**; the LLM is a polish step that can be skipped under load.

---

## 4. Model routing and resource management

### 4.1 Measured facts [measured]

| Metric | Qwen3 1.7B Q4_K_M | SinhalaLLM v2.1 Q4_K_M |
|---|---|---|
| Size on disk | 1.4 GB | 1.1 GB |
| Peak system RAM used while loaded (incl. OS) | 2.03 to 2.19 GB | 1.93 to 2.02 GB |
| Lowest `available` RAM during tests | 1.62 GB | 1.80 GB |
| Generation speed | 7.7 to 8.3 tok/s | 8.3 to 9.7 tok/s |
| Prompt eval speed | 30 to 37 tok/s | 30 to 37 tok/s |
| First token, warm, Sinhala prompt | 2.4 to 3.1 s (55 to 113 prompt tokens) | 0.6 to 1.2 s (14 to 32 prompt tokens) |
| Swap used / OOM events | 0 / 0 | 0 / 0 |

Model switching (unload one, load the other, 1 token): **5.0 to 6.6 s**, identical with the page cache warm or dropped (dominated by runtime initialisation, not disk). Only one model was ever loaded (`OLLAMA_MAX_LOADED_MODELS=1`). Peak during six consecutive switches: 2.07 GB used, 1.74 GB available, no swap.

Idle baseline: about 0.48 to 0.51 GB used. With one model loaded: about 2.0 to 2.2 GB used out of 3.8 GB.

### 4.2 Memory budget

| Item | Memory | Source |
|---|---|---|
| OS, sshd, fail2ban, ufw, chrony, monitoring | about 0.5 GB | measured |
| One loaded model + KV cache at ctx 2048 | about 1.5 to 1.7 GB | measured |
| Node Agent API (Fastify-class server + Zod) | about 0.10 to 0.20 GB | **estimate, measure in M1** |
| **Steady state** | **about 2.1 to 2.4 GB** | |
| Headroom (page cache, bursts) | about 1.4 GB + 2 GB swap | |

Rules that keep this safe:

- Exactly one model resident. The Agent never calls Ollama with a model name other than the two allow-listed tags.
- `num_ctx` fixed at 2048, `num_predict` capped per call (reply ≤120 tokens, tool-call ≤200), `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_QUEUE=8` (already set).
- The Agent itself bounds concurrency with its own queue so Ollama's queue is never the first line of defence.
- **Future workloads (Whisper, Piper, Playwright) are not allowed to co-run with a model.** The Agent owns a single *workload lease*: heavy jobs must acquire it, which forces the LLM to unload first. Their memory use is **unmeasured**; Chromium alone commonly needs several hundred MB, so they stay out of scope until measured.
- `systemd MemoryMax` is deliberately not set. If added later, test first (a too-low limit kills the model loader).
- Alert when `MemAvailable < 600 MB` or swap use > 25 % (extend the existing `volta-health` timer).

### 4.3 Queue and model scheduler

- One **inference slot**. Jobs: `{id, model, priority, deadline, work}`.
- **Model affinity:** while the loaded model has queued work, serve it before switching (max 3 consecutive same-model jobs if the other model's oldest job has waited more than 8 s, so nobody starves).
- **Switch cost is 5 to 7 s**, so a turn is designed to need **one** model: a Sinhala turn uses only SinhalaLLM (the router is code); an English turn uses only Qwen. Consecutive turns in the same language cost no switch. Alternating users cost up to 7 s each switch.
- **Degraded mode:** if the loaded model does not match and queue wait would exceed 8 s, answer with the deterministic template (cards + template text), `meta.degraded=true`. The shopper still gets correct facts instantly.
- Limits: queue depth 6, per-job deadline 45 s (60 s for English two-step), per-IP and per-session rate limits (section 7.3). On overflow return `503 QUEUE_FULL` with `Retry-After`.
- Keep-alive: leave Ollama's 5 min default so a quiet server drops to ~0.5 GB, and pre-warm Sinhala model on first Sinhala request, not at boot.

### 4.4 Capacity [estimate, validate in M6]

At about 8 tok/s and about 30 tok/s prompt processing, one LLM reply of ~80 tokens with a ~300-token prompt takes roughly 10 to 25 s. That is **about 2 to 6 LLM-bearing turns per minute for the whole server**. Deterministic turns (search, stock, accessories, order status, cart) are LLM-free and cost milliseconds plus backend latency. This is why the Sinhala path defaults to templates and why the product must degrade rather than queue indefinitely. If real traffic needs more, the fix is a bigger server or a GPU box, not tuning.

---

## 5. Sinhala input handling

### 5.1 What the measurements say

- Qwen3 cannot reliably produce Sinhala [measured]. Whether it can *understand* it was unvalidated; the experiment below tested it directly.
- SinhalaLLM has no tool capability (Ollama reports `completion` only) and hallucinated products and specifications [measured].
- **Routing experiment [measured, exploratory]**: 25 utterances I wrote (17 Sinhala/mixed, 4 Singlish, 2 English, 2 prompt-injection), labelled by me, 10 intents, Qwen3 1.7B with constrained JSON output, temperature 0, same loaded model:

| Router | Correct | Notes |
|---|---|---|
| Qwen3 1.7B classifier | **19 / 25 (76 %)**; Sinhala-script 13 / 17; Singlish 4 / 4; English 2 / 2; **injection 0 / 2** | avg 2.2 s per call (1.7 to 3.3 s). Errors: compare, stock and accessories questions in Sinhala mapped to `search`, `smalltalk` or `get_product_details`; injections mapped to `order_status` and `smalltalk`. |
| Keyword rules | 25 / 25 | **Not evidence of quality.** I wrote the rules while writing the cases, so this is in-sample and optimistic. It only shows rules are cheap and can express these intents. Real accuracy is unknown until measured on held-out data (M4). |

The sample is tiny and author-labelled. Treat it as direction, not proof. The single reliable conclusion: **a 1.7B model as the *only* Sinhala router is not safe**, in particular it did not reject injections.

### 5.2 Options compared

| Option | Verdict |
|---|---|
| **Deterministic lexicon/rules router** | **Recommended primary.** Auditable, 0 ms, no model switch, cannot be prompt-injected because it never follows instructions, handles Singlish with an explicit transliteration lexicon. Weakness: coverage and maintenance, brittle to paraphrase; needs a curated lexicon and held-out testing. |
| Controlled translation to English first | **Not usable today.** No validated Sinhala-to-English model here (Qwen3 fails on Sinhala; SinhalaLLM translation is untested). Adds a model hop (about 5 to 7 s switch) and compounds errors. Revisit only if a translation model is validated. |
| Qwen-assisted routing after validated translation | **Blocked** by the row above. Do not build. |
| Trained structured classifier (e.g. fastText / logistic regression on Sinhala+Singlish+English n-grams, tiny RAM) | **Recommended second stage**, but only after we have labelled real utterances (M4 shadow mode). Needs data we do not have. Cheap to run (megabytes, microseconds). Used as a *fallback to rules* with a calibrated confidence threshold, never alone. |
| Qwen constrained classifier | Use only as a **tie-breaker for English** and never for Sinhala until it passes the acceptance gate (section 12). |

### 5.3 Recommended pipeline (tiered, fail-closed)

1. **Normalise:** Unicode NFC; strip zero-width joiners only where the lexicon says so (ZWJ matters in Sinhala conjuncts, so normalise *both* forms in the lexicon rather than deleting it); lowercase Latin; map Sinhala digits and number words; collapse repeated characters in Singlish; extract amounts (`100,000`, `100k`, `ලක්ෂයක්`, `1.5 lakh`).
2. **Safety pre-filter:** detect instruction-override patterns in Sinhala/English/Singlish and meta-requests (`ignore previous`, `system prompt`, `discount`, `free`, price manipulation) and route to `unknown` with a fixed refusal. The model never sees the text as instructions.
3. **Intent scoring:** weighted lexicon (Sinhala, Singlish, English tokens) per intent, with negation and question-form handling; ranks intents and returns a margin.
4. **Entity extraction (deterministic, against the live catalogue):**
   - brands, models and categories from a cached vocabulary (`GET /api/internal/ai/vocab`, section 8.2) with fuzzy matching on Latin tokens. Catalogue names are English, so Sinhala messages normally still contain the Latin brand/model;
   - Sinhala category words (`ෆෝන්`, `චාජර්`, `කේස්`, ...) mapped by a **curated lexicon table maintained next to the catalogue categories**;
   - budget and quantity; colour/storage words;
   - referents (`මේක`, `meka`, `this one`) resolved from the page `context.productId` or last-shown product in session state.
5. **Decision:** if top intent score ≥ T and margin ≥ M and all required entities resolved, execute. Otherwise ask a **templated** clarifying question (`ඔබට අවශ්‍ය brand එක හෝ budget එක කියන්න පුළුවන්ද?`). Never guess an entity for a transaction-adjacent tool.
6. **Shadow mode first:** in M4 the router runs and logs its decision (redacted) without affecting replies; labelled results set T and M. Rules are promoted to production only after the held-out gate.

### 5.4 Known Sinhala routing gaps

1. **No labelled corpus.** Everything above is author-written. The first real gap is data.
2. **Catalogue search is English-only.** `matchesSearch` requires every query word to appear in an English haystack (name, SKU, brand, category, variant labels) [repo]. A Sinhala word returns zero results, so the router must translate Sinhala category/colour words into catalogue slugs and brand/model tokens *before* `search_products`.
3. **Lexicon coverage** for colloquial, dialectal and Singlish spellings (`thiyenawada`, `tiyenawada`, `thiyenawd`) is unbounded; spelling variants need a normaliser plus a growing table.
4. **Referent resolution** (`මේක`, `ඒක`) depends on UI context; without it, ask.
5. **Number/currency forms** (`ලක්ෂයයි`, `අසූ දහසක්`) need explicit handling; unparsed budget must trigger a question, not a default.
6. **Qwen cannot recover from router misses on Sinhala**, so every miss must degrade to a clarification, never a model guess.
7. **Prompt injection embedded in Sinhala** was not rejected by Qwen [measured]; the pre-filter is mandatory.
8. **Mixed sentence-level language switching** inside one message: handled by treating any Sinhala-script presence as Sinhala path.

---

## 6. Product data integrity and response generation

**Rule: a model-generated token may never be the first appearance of a fact.**

1. **Facts travel as cards** (`ProductCard`, `ComparisonCard`, `StockCard`, `AccessoryCard`, `CartCard`, `OrderCard`), built by code from tool results. Prices are formatted by the server (`Rs. 129,900.00`), not by a model.
2. **Prose is allowed to be vague by design.** The model receives a *fact sheet* with entity labels only (e.g. `PRODUCT_1`, `PRODUCT_2`, `COUNT=3`) and is asked for a short lead-in or follow-up. It does not receive prices, specs, warranty or stock values.
3. **Output verifier** (runs on every model-written string before it leaves the Agent):
   - rejects any digit sequence, currency symbol, percent, URL or email not present in an allow-list built from the tool results;
   - rejects any product/brand/model name not in the tool results;
   - rejects words from a deny-list (`guarantee`, `free`, `discount`, `warranty`, Sinhala equivalents) unless the corresponding field exists in the results;
   - rejects repetition loops (n-gram repeat ratio), empty text, wrong script for the target language, and responses cut off by the token cap;
   - on any failure: use the template text and set `source: "template"`.
4. **Product content is untrusted.** `ProductContent` is admin-edited rich text [repo]; descriptions are stripped to plain text, length-capped and passed to a model only in a quoted, clearly delimited data block, never as instructions. Cards render only structured fields.
5. **Accessories:** only explicit `AccessoryLink` rows are returned; compatibility is never inferred from names [repo: schema comment]. If none exist, the answer is "no linked accessories", not a suggestion.
6. **Promotions:** shown only when a tool result carries `offerName` from `quotePricedLines`; the model never mentions promotions otherwise.
7. **Delivery charge:** from ERP settings via the tool, never from the model.

---

## 7. API contract

Base paths below are on the **website** (public via BFF) and on the **Agent** (private). All JSON; all errors use the repo's existing envelope `{ "error": { "code", "message", ...extra } }`.

### 7.1 Authentication (BFF to Agent, and Agent to tool backends)

Service-to-service HMAC-SHA256, one secret per direction, stored in env files (`/etc/volta-ai/agent.env`, mode 600; website env), never in the repository and never sent to browsers.

```
X-Volta-Key-Id:    k1                        # supports rotation (two active keys)
X-Volta-Timestamp: 1767000000                # reject if |now - ts| > 60 s
X-Volta-Nonce:     <16 random bytes, hex>    # replay cache for 120 s
X-Volta-Identity:  anon | cust:<customerId>  # covered by the signature
X-Volta-Client-Ip: <ip from BFF>             # used for rate limiting; covered by the signature
X-Volta-Signature: hex(HMAC_SHA256(secret,
   `${ts}\n${nonce}\n${METHOD}\n${path}\n${identity}\n${clientIp}\n${sha256(body)}`))
```
M1-A change: the client IP is part of the signed string (the first design left it unsigned), so a tampered IP cannot dodge per-IP rate limits. Known-answer test vectors for this exact format are in `apps/agent/tests/unit/hmac.test.ts`.
Compared with `timingSafeEqual` (same primitive the repo already uses for `sync-orders`). The Agent trusts `X-Volta-Identity` only because it is signed by the BFF, which derived it from the session cookie.

### 7.2 Public (BFF) endpoints, same-origin

#### `POST /api/ai/chat`

```ts
const ChatRequest = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),       // client-generated, opaque
  message: z.string().trim().min(1).max(800),
  locale: z.enum(["auto", "si", "en"]).default("auto"),
  cart: z.array(z.object({                                       // browser cart snapshot (untrusted, revalidated)
    productId: z.string().max(100), variantKey: z.string().max(200).default(""),
    quantity: z.number().int().min(1).max(10),
  })).max(20).default([]),
  context: z.object({                                            // what the shopper is looking at (untrusted hint)
    page: z.enum(["home", "listing", "product", "cart", "checkout", "track", "other"]).optional(),
    productId: z.string().max(100).optional(),
  }).optional(),
  challengeToken: z.string().max(2048).optional(),               // CAPTCHA-ready hook; verified by the BFF only, unused while AI_CHALLENGE_MODE=off
});
// Client history is NOT accepted: it would let a user forge assistant/tool turns. The Agent keeps short-term state (section 7.5).
```

```ts
const ChatResponse = z.object({
  requestId: z.string(),
  sessionId: z.string(),
  language: z.enum(["si", "en", "mixed"]),
  reply: z.object({ text: z.string(), source: z.enum(["template", "sinhala-llm", "qwen"]) }),
  cards: z.array(Card),                 // all facts live here (section 8.3)
  actions: z.array(ClientAction),       // proposals the browser may apply (section 8.4)
  suggestions: z.array(z.string()).max(4).default([]),   // templated quick replies
  meta: z.object({ model: z.string().nullable(), degraded: z.boolean(), queuedMs: z.number(), latencyMs: z.number() }),
});
```

#### `POST /api/ai/chat/stream` (Server-Sent Events)

Same request body, `Accept: text/event-stream`. Events:

| event | data | notes |
|---|---|---|
| `status` | `{"phase":"queued","position":2}` / `"routing"` / `"tool"` / `"writing"` | emitted immediately, so the UI never looks frozen during the 5 to 7 s model switch |
| `card` | one `Card` | facts appear **before** any prose, they do not depend on the model |
| `action` | one `ClientAction` | |
| `token` | `{"text":"..."}` | **English/Qwen only**, and only for prose that cannot contain facts |
| `text` | `{"text":"...","source":"..."}` | Sinhala path: the full verified paragraph in one event (the verifier needs the whole string) |
| `done` | `{"meta":{...}}` | |
| `error` | error envelope | terminal |

Comment heartbeat `: ping` every 15 s; total budget 60 s; the BFF aborts the upstream call if the browser disconnects. Streaming is for perceived latency; the non-stream endpoint is the reference behaviour.

#### `GET /api/ai/health`

Public, returns only `{ "available": boolean }` (used to show or hide the widget). It must not expose model names, queue depth, versions or hostnames.

### 7.3 Agent (private) endpoints

`POST /v1/chat`, `POST /v1/chat/stream` (same schemas plus the signed headers), and

`GET /v1/health` (service-auth): `{ ok, ollama: {reachable, version, loadedModel}, queue: {depth, running}, memory: {availableMb, swapUsedMb}, uptimeSec, appVersion }`.

**Rate limits** (in-memory, single instance; the existing website limiter is also per-instance [repo]):

| Scope | Limit |
|---|---|
| BFF, per IP | 20 messages / min, 120 / hour |
| Agent, per `cust:` identity | 12 messages / min |
| Agent, per `anon` + IP | 6 messages / min |
| `get_order_status` lookups, per signed-in customer | 10 / hour (order status is customer-only; guests are pointed to `/track-order`) |
| Global in-flight | 1 running + 6 queued |

### 7.4 Errors

| HTTP | code | meaning |
|---|---|---|
| 400 / 422 | `INVALID_REQUEST` / `VALIDATION_FAILED` | schema failure (fields listed like the existing checkout route) |
| 401 | `UNAUTHORIZED` | bad signature, stale timestamp, replayed nonce (Agent), or no BFF auth |
| 403 | `FORBIDDEN_ORIGIN` | existing origin guard (BFF) |
| 429 | `RATE_LIMITED` | with `Retry-After` |
| 429 | `CHALLENGE_REQUIRED` | reserved for a future CAPTCHA (`AI_CHALLENGE_MODE=on_abuse`); not emitted while the mode is `off` |
| 503 | `AI_UNAVAILABLE` / `QUEUE_FULL` / `AI_DISABLED` | kill switch, Ollama down, queue full |
| 504 | `TIMEOUT` | exceeded deadline |
| 502 | `UPSTREAM_ERROR` | a tool backend failed (ERP unreachable and so on) |

Model failures are **not** errors to the user: they produce a `200` with `meta.degraded=true` and a template reply.

### 7.5 Sessions and state

- Identity = signed claim from the session cookie (`valta_session`, 30-day opaque token [repo]). The Agent never sees cookies or passwords.
- `sessionId` is a conversation handle only, not an auth credential. State is keyed by `(identity, sessionId)` so a guessed `sessionId` cannot read someone else's state.
- State is in memory only (LRU 300 sessions, TTL 30 min): last intent, resolved brand/category/budget slots, last-shown product ids, language, pending clarification. It is re-derivable from `cart` and `context`, so an Agent restart degrades gracefully. **No PostgreSQL, SQLite or other store is added.**

### 7.6 Logging

JSONL, append-only, rotated: `{ts, requestId, identityHash, language, intent, router, tool, toolStatus, model, queuedMs, latencyMs, tokensIn, tokensOut, verifier:{pass,reason}, degraded}`. By default **no message text, cart contents, names, phones, addresses, passwords, payment data or tokens are logged**, and nothing is used for AI training. Retention of redacted message text happens only when the BFF forwards a signed per-request consent claim from an explicit opt-in; the browser cannot assert consent to the Agent directly. Messages that look like card numbers, passwords/OTPs or national IDs are refused and never retained, even with consent. Retention limits, deletion and redaction limits are in the M0 decision record, section 4.

---

## 8. Tool definitions

### 8.1 Design rules

- Tools are **typed functions executed by the Agent**, with the model (English path) or the router (Sinhala path) only *proposing* name and arguments. Proposals are validated by Zod with `.strict()` (unknown keys rejected), range-checked, and permission-checked before execution.
- All tool backends are **new internal routes on the website** that reuse existing server code, so there is one source of truth. They are authenticated with the HMAC scheme (section 7.1), return 404 when the secret is unset (same pattern as `/api/internal/sync-orders` [repo]), are rate limited and never accept an `Origin`-based session.
- Read tools run in parallel (max 3); write-like tools run only when proposed by the user's explicit message.
- Tool results are **data**. They are wrapped in a fixed envelope and never concatenated into the system prompt as instructions.

### 8.2 Tool table

Money is returned as `{ amount: number, text: string }` formatted by the server. IDs are the ERP product ids already used by the store [repo].

| Tool | Args (Zod, strict) | Backend (NEW unless noted) | Permission | Mutates? |
|---|---|---|---|---|
| `search_products` | `{ query?: string≤100, category?: slug≤100, brand?: ≤80, minPriceLkr?: int≥0, maxPriceLkr?: int, inStockOnly?: bool=true, onSale?: bool, sort?: "newest"\|"price-asc"\|"price-desc"\|"name", limit?: 1..8=5 }` | `POST /api/internal/ai/search-products` → `listProducts()`. The *public* `/api/store/products` route does **not** accept price bounds or `inStockOnly` even though `queryProducts` supports them [repo], so a new route is needed. | anon, customer | no |
| `get_product_details` | `{ productId: string≤64 }` (slug resolved by the router) | `POST …/product-details` → catalogue snapshot + published `ProductContent` (plain-text fields only) | anon, customer | no |
| `compare_products` | `{ productIds: array(2..3) of productId }` | `POST …/compare` → same data as details; **differences (price delta, spec equality) computed in code** | anon, customer | no |
| `check_stock` | `{ productId, variantKey?: string≤200, quantity?: int 1..10 }` | `POST …/check-stock` → `checkAvailability()` (live ERP read). Reports available / out of stock and whether the requested quantity can be met; same disclosure level as the storefront [repo]. | anon, customer | no |
| `get_accessories` | `{ productId, variantKey?: string }` | `GET …/accessories` → `offersForSources()` (explicit `AccessoryLink` only) | anon, customer | no |
| `get_cart` | `{}` (cart comes from the request snapshot) | `POST …/cart-quote` → `checkAvailability()` + `quotePricedLines()` with `customerId` from the signed identity; adds ERP delivery charge | anon, customer | no |
| `add_to_cart` | `{ productId, variantKey?: string, quantity: int 1..10 }` | `POST …/cart-validate`; returns a `cart.add` **client action** plus a preview | anon, customer | proposal only |
| `update_cart_quantity` | `{ productId, variantKey?: string, quantity: int 1..10 }` | same | anon, customer | proposal only |
| `remove_from_cart` | `{ productId, variantKey?: string }` | same | anon, customer | proposal only |
| `get_order_status` | `{ ref?: string matching /^VLK-\d{6}-[A-HJKMNP-TV-Z2-9]{10}$/ }` | `POST …/order-status` → `loadOrderView()` + `toPublicOrder()` (privacy-filtered). With no `ref`: latest ≤5 via `orderRefsFor()`. A supplied `ref` is honoured **only if it is in that customer's `CustomerOrder` rows**; otherwise a generic "not found". | **signed-in customer only, own orders only.** Guests get a pointer to `/track-order`, no lookup. | no |

Also needed once: `GET /api/internal/ai/vocab` returning `{brands[], categories[{slug,name}], products[{id,name,brand,model?}]}` (public catalogue data only) for the router's entity extraction. Cached in the Agent for 5 min.

Delivery charge: there is no separate tool. The ERP exposes one flat charge in its store settings [repo]; `get_product_details` and `get_cart` carry it as an optional `deliveryCharge` field **only when a live settings read succeeds**, always worded "confirmed at checkout". If settings are unavailable the field is omitted and the assistant says it cannot confirm the charge; it never estimates. Promotions appear only when the backend quote returns them for that identity (guest or customer).

Validation specifics:

- `add_to_cart`: product must exist in the catalogue; if the product has more than one variant a `variantKey` is **required** (existing rule `variantChoiceRequired`); quantity ≤ `MAX_LINE_QTY` (10) [repo]; must be live-available for that quantity; the cart snapshot must stay ≤ 20 lines [repo checkout limit]. A failed validation returns a structured reason (`VARIANT_REQUIRED`, `OUT_OF_STOCK`, `LIMIT`) that the composer turns into a templated question.
- **There is no `place_order`, `pay`, `cancel_order` or `apply_discount` tool.** Order cancellation exists on the website but is out of scope for the assistant.

### 8.3 Cards (response data)

```ts
type Money = { amount: number; text: string };           // text is server-formatted, e.g. "Rs. 129,900.00"
type Card =
  | { type: "product"; id: string; slug: string; name: string; brand?: string; imageUrl?: string; price: Money; listPrice?: Money;
      offerName?: string; available: boolean; variants?: { key: string; label: string; available: boolean; price: Money }[]; url: string }
  | { type: "comparison"; products: Card[]; rows: { label: string; values: (string | null)[]; differs: boolean }[]; priceDelta?: Money }
  | { type: "stock"; productId: string; variantKey?: string; available: boolean; requestedQuantity?: number; canFulfil?: boolean }
  | { type: "accessory"; forProductId: string; kind: string; product: Card }
  | { type: "cart"; lines: { productId: string; variantKey: string; name: string; quantity: number; unitPrice: Money; lineTotal: Money; available: boolean }[];
      subtotal: Money; deliveryCharge?: Money; note: "Final total is confirmed at checkout" }
  | { type: "order"; ref: string; status: string; payment: "COD pending" | "COD collected"; lines: { name: string; quantity: number; unitPrice: Money }[];
      total: Money; carrier?: string; trackingNumber?: string; cancellable: boolean; stale?: boolean };
```
Fields that the ERP does not provide (for example warranty on a product with none) are **omitted**, never defaulted or generated.

### 8.4 Client actions (cart and navigation)

```ts
type ClientAction =
  | { actionId: string; type: "cart.add"; productId: string; variantKey: string; quantity: number; confirm: "none" | "ask" }
  | { actionId: string; type: "cart.setQuantity"; productId: string; variantKey: string; quantity: number; confirm: "none" | "ask" }
  | { actionId: string; type: "cart.remove"; productId: string; variantKey: string; confirm: "none" | "ask" }
  | { actionId: string; type: "navigate"; href: "/checkout" | "/cart" | `/products/${string}` | `/track-order?ref=${string}` };
```
The browser applies actions through the existing `cartActions` store [repo], one `actionId` at most once (idempotent), and shows an undo toast. `confirm:"none"` is used only when the shopper's own message was an explicit command ("add this to cart"); recommendations never auto-apply. `href` is constrained to the allow-list above; the browser re-validates it.

---

## 9. Security model

### 9.1 Transaction safety

| Requirement | Design |
|---|---|
| No order without explicit confirmation | The assistant cannot create orders. It emits `navigate:/checkout`. The existing page requires the customer to review, accept terms and press the button; `POST /api/store/orders` is browser-originated, same-origin, validated by Zod and recomputes prices server-side [repo]. |
| No payment without authorisation | Only COD exists [repo]; no payment tool exists. |
| Model never reaches PostgreSQL | The Agent has no DB credential and no network route to the DB; tool backends are the only readers and use existing `lib/` functions. |
| Authenticated backend APIs | HMAC (section 7.1) in both directions; identity is a signed claim. |
| Idempotency | Existing order `externalRef` + ERP `Idempotency-Key` is untouched. Client actions carry `actionId`. If chat checkout is ever added (M8) it must use a two-step `prepare` → signed confirmation token bound to `(cartHash, total, customer, expiry)` → button in UI → the existing order route. |
| Audit | Section 7.6 for the Agent; the website keeps its existing order and admin audit. Every cart proposal logs `actionId`, tool and status. |
| Ownership checks | Orders: the assistant serves only the signed-in owner (`CustomerOrder`); it does **not** accept a bare reference from guests. Delivery address/phone are never returned (`PublicOrder` has none) [repo]. Cart is the browser's own and is revalidated, never read by id. |

### 9.2 Threat model (abbreviated)

| Threat | Control |
|---|---|
| Direct prompt injection ("ignore previous instructions, 90 % discount") | Safety pre-filter before any model; models have no price or discount tool; verifier blocks invented numbers; tool args validated. Qwen failed injection in testing (0/2) [measured], so it must not be the only barrier. |
| Indirect injection via ERP/admin text (descriptions, names, order notes) | Plain-text strip, length cap, delimited data block, no instructions honoured from data, cards carry facts, tools never accept free-form SQL/URLs. |
| Forged history / role injection | No client history accepted; state is server-side. |
| Tool abuse / argument tampering | `.strict()` Zod, range clamps, allow-listed tools and models, per-turn tool-call cap (max 3), read tools parallel only. |
| IDOR (other customers' orders/carts) | Identity from signed claim; order lookups by owner or secret ref; no cart-by-id. |
| Order reference enumeration | Not reachable through the assistant: references from guests are not accepted; signed-in lookups are limited to the customer's own orders with a per-customer limit and generic not-found. (The existing `/track-order` page keeps its own ~49-bit reference and rate limits [repo].) |
| Denial of service on a CPU-only host | Queue and deadlines, short outputs, deterministic fast path, degraded mode, rate limits, kill switch `AI_ASSISTANT_ENABLED=false`. |
| Service credential theft | env files mode 600, secrets only on the two hosts, rotation via `X-Volta-Key-Id`, replay cache, 60 s skew. |
| Ollama exposure | Remains `127.0.0.1`; UFW does not allow 11434; Agent health never returns model internals publicly. |
| PII leakage into prompts/logs | Prompts contain no names, phones, addresses or tokens; logs hash identity; text capture opt-in with redaction. |
| Outbound data flow from Ollama | Observed in phase 4: Ollama contacts `ollama.com` for model recommendation/cloud caches. Review and, if possible, disable before launch (setting not yet verified). |
| Supply chain | Few dependencies (HTTP framework, Zod, undici); lockfile; `npm ci`; no postinstall scripts from third parties; unprivileged service user; systemd hardening (`NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`). |
| Hallucinated facts | Section 6 verifier and fact-sheet design. |
| Chat transcripts as new personal data | Update the privacy policy; consent notice in the widget; retention limits. |

### 9.3 Hardening of the Agent service

Runs as a dedicated non-login user; binds loopback or tunnel interface only; reads secrets from a root-owned env file; systemd `Restart=always`, `MemoryHigh` is *not* set until tested; logs to journald plus rotated JSONL under `/opt/volta-ai/logs`.

---

## 10. VOLTA repository findings that shape the design

Facts from reading the repo (no assumptions about endpoints or fields):

1. **Stack:** Next.js 16 / React 19 / TypeScript 6 / Prisma 7 / Zod 4 / Vitest; **ERP (HEXALYTE) is the source of truth** for products, prices, stock and orders; the website DB holds accounts, order links, product content, accessory links and promotions only [repo].
2. **Cart is browser-only** (`localStorage`, key `valta.cart.v1`) and there is no cart table [repo]. Hence cart tools are client actions.
3. **Public store routes** exist: `/api/store/products`, `/availability`, `/accessories`, `/orders`, `/orders/[ref]`, `/reservations`, `/settings`, `/recommendations` [repo]. Mutating routes require a same-host `Origin`, so a server-to-server caller cannot reuse them; this is why new HMAC-protected internal routes are specified.
4. **The public products route omits `minPrice`, `maxPrice`, `inStockOnly`** although the underlying `queryProducts()` supports them [repo]. Budget search needs the new internal route.
5. **Catalogue is an in-memory snapshot** refreshed every 60 s; search is substring AND-matching over English fields only [repo]; Sinhala text will not match.
6. **Accessories are explicit links only** and compatibility is never inferred [repo].
7. **Orders:** guests identify an order by an unguessable reference; customers list theirs via `CustomerOrder`; `PublicOrder` is already privacy-filtered [repo].
8. **Auth:** cookie `valta_session`, SHA-256-hashed server-side tokens, 30-day sessions, `getCurrentCustomer()` [repo].
9. **Internal-route precedent:** `POST /api/internal/sync-orders` uses a Bearer secret, `timingSafeEqual`, rate limiting and returns 404 when unconfigured; the new internal routes follow the same convention.
10. **`DEMO_READ_ONLY=true`** makes `proxy.ts` refuse every non-GET request; the chat BFF must be disabled or explicitly exempted in demo mode [repo].
11. **Rate limiting is per-instance memory**; fine for one instance, to be revisited with scale-out [repo].
12. **The ERP integration has never run against a live ERP** (mock only) [repo README]. The assistant inherits that risk and must be tested on the mock first and the staging ERP next.
13. `apps/web/AGENTS.md` warns that this Next.js version differs from common knowledge and to read `node_modules/next/dist/docs/` before writing code. That applies to M2 and M5.
14. Order flow already provides price re-check (`PRICE_CHANGED`), stock check, terms acceptance and idempotent ERP creation [repo], which is why checkout stays the only transaction path.

---

## 11. Implementation roadmap

Nothing below starts without approval. No milestone before M7 touches production.

**Owner-scoped M1 (2026-11-12):** the owner asked for an M1 limited to mock ERP data. The proposed plan is [AI_M1_PLAN.md](AI_M1_PLAN.md). It covers old M1, old M2 (mock only), old M3, the pipeline part of old M4 (no shadow mode, no native review) and the rate-limiting and testing parts of old M6; it excludes old M5 and all real transport, staging and production work. It is not approved.

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| M0 | Decisions and prerequisites | **OPEN.** Decisions D2 to D6 recorded; blockers B1 to B7 in the M0 decision record (website host and egress IP, staging ERP, M1 approvals, Sinhala reviewers, legal review, guest abuse protection); HMAC secrets created out of band | Decision record accepted and every blocker resolved or consciously waived |
| M1 | Agent skeleton (AI server) | **Node 24 is already installed** (`/opt/node/current`, verified in M0); `/opt/volta-ai/agent-api`; systemd unit as non-root user; loopback bind; tunnel account for staging; HMAC auth + replay cache; Ollama client + model manager + single-slot queue; `/v1/health`; JSONL audit log; **measure its RSS** (bare Node 24 measured at 47 MB idle, 88 MB after load) | Health OK; 50 mixed queue jobs without OOM; model-switch p95 measured; RSS recorded; no new public port |
| M2 | VOLTA tool backends (repo, feature branch) | **mock ERP only, never the production ERP**; `/api/internal/ai/*` (section 8.2) + vocab; Zod schemas; reuse `lib/`; HMAC verify; 404 when unset; unit + integration tests against the mock ERP (`npm run mock-erp`) | All tools pass tests for happy path, ownership denial, invalid args, ERP-down |
| M3 | English path | Qwen tool-calling with Zod validation, fact-sheet prose, verifier; 100-prompt English eval | Gates in section 12 (E1 to E4) |
| M4 | Sinhala path (shadow first) | Normaliser, lexicon, rules router, entity extraction against vocab, templates, SinhalaLLM polish + verifier; **shadow mode** on staging traffic; labelled corpus; optional trained classifier | Gates S1 to S6 on a **held-out** set reviewed by a native speaker |
| M5 | Web integration (feature-flagged) | BFF routes, widget, client-action applier (via existing cart store), consent notice, `AI_ASSISTANT_ENABLED`, demo-mode handling, `/api/ai/health` | E2E (Playwright) journeys; widget hidden when health is false; kill switch tested |
| M6 | Hardening and load | Rate limits, soak test, OOM/chaos tests (kill Ollama, ERP down, tunnel flap), red-team prompts, alerts, runbooks | Gates P1 to P5 and X1 to X6 |
| M7 | Staged rollout | Staff only, then small percentage of customers; review logs weekly | No sev-1 in 2 weeks; fabricated-fact rate 0 |
| M8 | Later (separate approval) | Chat checkout (two-step confirm), server-side cart, voice via the workload lease | Own design review |

---

## 12. Testing and acceptance criteria

All numeric thresholds below are **proposed** targets to be agreed; they are not yet measured.

### Functional
- **F1** Each of the 10 tools passes happy-path, invalid-argument, unauthorised and upstream-failure tests against the mock ERP.
- **F2** Product, comparison, stock, accessory, cart and order cards contain only values present in tool results (automated field-by-field check).
- **F3** Browser applies each client action at most once; replaying an `actionId` changes nothing.

### English (E)
- **E1** Tool selection accuracy ≥ 90 % on 100 prompts; **E2** 100 % of emitted calls either pass Zod or are rejected without execution; **E3** zero calls to unlisted tools; **E4** injection prompts: 0 successful (no price/discount/order effect).

### Sinhala (S), on a held-out labelled set (≥300 utterances: Sinhala script, Singlish, mixed, English; native-speaker labelled)
- **S1** Top-level intent accuracy ≥ 95 % where the router acts, with coverage reported separately (clarification rate allowed up to 25 %).
- **S2** Wrong-tool rate for `cart_action` and `order_status` ≤ 1 %.
- **S3** Injection/unsafe requests rejected ≥ 99 %.
- **S4** Entity extraction (brand/model/budget) accuracy ≥ 90 % on the labelled set.
- **S5** Grounding: on 500 generated replies, **0** unverified numbers, prices, product names or promotions reach the user (verifier unit-tested plus fuzzed).
- **S6** Native-speaker rating: fluency and appropriateness reviewed on 100 replies; repetition loops < 1 %.

### Safety / transaction (X)
- **X1** The assistant cannot create an order, apply a discount, or reveal address/phone under any tested prompt.
- **X2** Cross-customer order access blocked in 100 % of tests.
- **X3** Ollama port 11434 unreachable from outside (external probe), UFW unchanged except approved rules.
- **X4** Replay and expired-timestamp requests rejected.
- **X5** Logs contain no message text, PII or secrets in default mode (grep test).
- **X6** Kill switch disables the widget and BFF within 60 s.

### Performance / resources (P)
- **P1** Peak system RAM ≤ 3.2 GB and swap use ≤ 25 % during a 30-minute mixed soak; **0** OOM kills.
- **P2** Deterministic turns p95 ≤ 1.5 s end to end (excluding ERP latency).
- **P3** Sinhala LLM-polished turn p95 ≤ 20 s; English two-step turn p95 ≤ 45 s; degraded fallback ≤ 2 s.
- **P4** Model switch p95 ≤ 8 s; no starvation (oldest queued job waits ≤ 20 s).
- **P5** Behaviour under overload: queue full returns `503` with `Retry-After`, server stays healthy, Ollama never receives more than one concurrent job.

### Operational
- **O1** Service restarts after reboot and after crash; **O2** `volta-health` alerts on low memory; **O3** secret rotation exercised once; **O4** runbook for tunnel loss and Ollama failure.

---

## 13. Out of scope (confirmed untouched)

No public API deployed, no new port, no firewall change, no model or Ollama configuration change, no migration, no change to production services, no paid AI APIs, no commit or push. STT, TTS and browser automation are not started.
