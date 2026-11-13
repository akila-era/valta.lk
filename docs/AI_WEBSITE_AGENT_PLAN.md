# VOLTA AI: website-aware agent, inspection and implementation plan

Status: **superseded by `AI_M3_MASTER_PLAN.md`** (kept for history). Original status: **plan only.** No code written for this direction, nothing committed, pushed or deployed. Scope (latest brief): general conversation plus deep, controlled interaction with **VOLTA.LK only**. No arbitrary internet browsing.

## 1. What exists today (inspection)

| Area | Today | Consequence for the plan |
|---|---|---|
| Agent API (`apps/agent`, ~5,300 lines TS, only dependency `zod`) | HMAC auth, replay cache, rate limits, identity-bound sessions, safety pre-filter, router-first pipeline, response verifier, scheduler (1 inference slot), metrics | Keep unchanged; new capabilities plug in as tools and as extra pipeline steps |
| Tools | 10 shopping tools, strict Zod args, permission per actor (`guest` / `customer`), results become verified cards. Cart changes are only *proposals* the shopper confirms in their own browser | The approval framework (section 6) extends this model rather than replacing it |
| Models | `MODELS` allow-list: `qwen3:1.7b-q4_K_M` and a Sinhala model, one loaded at a time, `num_ctx` 2048, replies capped | Orchestration layer wraps this allow-list; "general AI" quality is limited by a 1.7B model (section 5) |
| Chat replies | Qwen-written replies accepted only if they pass `modelReplyProblem` (no numbers, prices, links, product names, Sinhala) | Fine for chit-chat; **too strict for general Q&A and coding**, so a separate "general answer" lane with different rules is needed |
| Website (`apps/web`, Next.js 16) | Store pages: about, FAQs, shipping / returns / warranty / privacy / terms, products, categories, brands, new-arrivals, search, compare, wishlist, cart, checkout, track-order, account. Public APIs under `/api/store/*`; account APIs under `/api/account/*`; `robots.ts` already disallows `/api/`, `/cart`, `/checkout`, `/search`, `/admin/` | A ready list of what the agent may read; robots rules become the starting point of the allowlist |
| Playwright | Already a dev dependency of the web app (tests only) | The same library can power the worker, but never inside the web container |
| Infrastructure | AI server: 2 vCPU, 3.8 GB RAM, Qwen already uses most of it. Website server: shared host, disk about 93% used | **Neither can host Chromium.** The browser worker needs its own machine (section 3) |

## 2. Key design decision (needs your confirmation)

The brief asks for browser sessions "bound to authenticated customer identities" **and** "never expose browser cookies or credentials to the language model". The safest way to satisfy both:

1. **Customer-specific data and actions never go through a logged-in browser.** They use typed website tools (orders, account, cart) that call the website's own backend with the existing signed identity, so the backend authorises every call. This is how the assistant already works.
2. **The Playwright worker is anonymous and read-mostly.** It opens approved public pages as a guest in a throw-away profile, reads the accessibility tree and text, and takes screenshots. It holds no customer cookies, so nothing sensitive can reach the model.
3. **When a UI action is needed for a signed-in customer** (add to cart, fill a form), the worker does not act with their cookies. Instead the agent returns a *proposal* and the shopper's own browser performs it after confirmation (today's cart flow), or the website exposes a dedicated tool endpoint that validates CSRF and permissions.

This removes the largest risk (an LLM-driven browser holding a customer session) while still giving "interact with the cart", "fill forms" and "navigate" in the product. If you want a truly authenticated browser session later, that becomes a separate, explicitly approved milestone with its own threat model.

## 3. Target architecture

```
Shopper browser ──► Website (Next.js) ──signed──► Agent API ──► Model orchestrator ──► Ollama (AI server)
                                                      │
                                                      ├─► Website tools (typed, signed, backend-authorised)
                                                      ├─► Knowledge index (site pages, policies, FAQ, product copy)
                                                      └─► Browser worker (separate host, Playwright, anonymous, allowlisted)
```

Separate services, each with its own host/budget:

| Service | Purpose | Where | Notes |
|---|---|---|---|
| Agent API (exists) | auth, pipeline, verification, approvals | AI server (unchanged) | New code is small and CPU-light |
| Inference (exists) | Qwen via Ollama | AI server | Do not add models until a resource plan is approved |
| Knowledge index | search over approved site content | inside the Agent process at first (BM25, in memory, rebuilt from sitemap and APIs) | No embeddings yet: a vector model would compete with Qwen for RAM |
| Browser worker | Playwright + Chromium, one isolated context per task | **new, separate small host** (needs about 2 vCPU / 4 GB; this is a purchase, so it needs your approval) or, for development only, a local machine | Reached only over an authenticated private channel from the Agent. Never a public port |
| Voice, sandboxed code execution | out of scope for this brief | later | Not designed here |

**Resource rule:** nothing new is installed on the 4 GB AI server. The worker's host is egress-limited to the allowlisted domains and has no access to any secret or internal network.

## 4. Domain allowlist policy

- Single source of truth: a signed configuration file (`allowlist.json`), reviewed in version control, loaded at start. Initial entries: `valta.hexalyte.com` (preview) and the final production domain once you name it. Nothing else.
- Match on the exact registrable host and scheme `https`. No wildcards, no subdomain guessing, no ports other than 443.
- Enforced in **three** layers so one bug cannot open the door: (a) the Agent validates every URL a tool receives; (b) the worker intercepts every request and redirect in the browser context (`page.route`) and aborts anything off-list, including sub-resources, iframes and WebSocket; (c) host firewall egress rules (approval needed for the firewall part).
- Resolve DNS in the worker and reject private ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 including cloud metadata, `::1`, `fc00::/7`, `fe80::/10`), re-checked after each redirect to defeat DNS rebinding.
- Paths: follow `robots.ts`; additionally block `/admin`, `/api`, `/checkout` payment steps. Navigation to anything else on an allowed host is permitted only if it passes these rules.
- A blocked navigation returns a clear, non-leaky answer ("I can only open VOLTA pages") and is counted in metrics.

## 5. Model orchestration (provider-independent, no paid APIs)

- Interface `ModelProvider { id, license, capabilities, generate(req) }` behind one `ModelRouter` that selects by task: `classify`, `plan_tools`, `chat`, `general_answer`, `code`.
- First provider: the existing Ollama client (unchanged allow-list behaviour). Further providers are added only by editing the allow-list in code, never by a request.
- No remote or paid provider type exists in the codebase, so a paid fallback cannot be switched on by configuration.
- **Candidates to evaluate** (licences and sizes must be verified from each model card before any choice; I have not verified them in this session): Qwen2.5 3B instruct, Qwen3 4B instruct-2507, Gemma-family small models, Llama-family small models, and Phi-family small models. Large models (GPT-OSS 20B or larger, DeepSeek distills of 7B or more) do not fit 4 GB RAM and would need a different, approved host. Deliverable: a table with licence text, commercial-use terms, RAM, tokens per second, and quality on our own eval set.
- Honest limit: a 1.7B to 4B model on 2 CPUs gives short, sometimes wrong answers at about 4 to 5 tokens per second. "Advanced reasoning" and "coding assistance" at modern-assistant quality are **not achievable on this hardware**. The plan sets expectations accordingly and labels general answers as AI-written.
- General-answer lane: no product or price claims (those still come only from tools), a visible "AI-generated, may be wrong" marker, the same safety pre-filter, and no retention.

## 6. Action approval framework

| Class | Examples | Rule |
|---|---|---|
| Read-only | search products, read policy page, order status for the signed-in owner | Runs within the caller's permissions. Logged as a metric only |
| Reversible | add or remove cart line, add to wishlist | Executes only after the shopper's confirmation click in their browser (today's behaviour); the result carries an Undo |
| Sensitive | change account details, cancel order, submit a contact or wholesale form | Explicit confirmation card showing exactly what will be sent; the Agent stores no form contents |
| Financial | payment, placing an order, applying a discount | **The agent never does these.** It links the shopper to the existing checkout. No tool exists for them and a unit test asserts that |

Every tool declares its class in the registry, and the pipeline refuses to emit a non-read action without a confirmation token that the browser echoes back (single-use, bound to the session and the exact action).

## 7. Website tool registry (additions)

| Tool | Class | Source of truth |
|---|---|---|
| `site_search(query, section?)` | read | Knowledge index |
| `get_page(path)` | read | Knowledge index (allowlisted paths only) |
| `get_policy(topic)` (shipping, returns, warranty, privacy, terms, FAQ) | read | Policy pages |
| `get_warranty(productId)` | read | Website data (note: `ProductView` has no warranty field today, so this needs a backend addition) |
| `browse_page(path)` | read | Browser worker, returns text, accessible element list, screenshot reference |
| `browser_act(action)` (click, type, select on allowed elements) | reversible/sensitive by element | Browser worker, proposals only for signed-in users |
| Existing 10 shopping tools | unchanged | unchanged |

Page text returned to the model is wrapped as **untrusted data**, length-capped, stripped of markup and scanned by the existing injection filter. Instructions inside pages are never followed.

## 8. Security review (threats mapped to controls)

| Threat | Control |
|---|---|
| SSRF, metadata endpoints, private IPs | Allowlist plus DNS check at every hop plus egress firewall |
| Prompt injection from page content | Untrusted-data wrapping, injection filter, tools limited by class, no tool can be unlocked by page text |
| Cookie or credential leakage to the model | Worker is anonymous; cookies never leave the browser context; screenshots and text are scanned for the sensitive-value patterns already in the safety lexicon |
| Customer A sees customer B | Identity comes only from the signed request; per-customer tools call the website backend which re-authorises; worker has no customer state |
| Session mixing in the browser | One new browser context per task, destroyed afterwards, no shared profile or cache |
| Runaway tasks | Step limit, wall-clock limit, concurrency cap, cancel endpoint |
| Exposure of the worker | No public port; authenticated private channel only (this is a firewall/SSH-style change, so it needs approval) |

## 9. Test plan (maps to your list)

Domain allowlist per approved domain; internal navigation; external navigation and redirect blocking (including a local test server that redirects off-list); private IP and metadata addresses; customer isolation and unauthorised account access (two customers, mock data); browser context isolation (cookie set in one task is absent in the next); prompt injection through a page served by a local malicious fixture; action confirmation (no non-read action without a valid token); existing shopping regression (the current 893 Agent tests and the web Playwright suite must stay green). All testing runs against local fixtures and the mock ERP, never production or real customer data.

## 10. Phases, agents and file ownership

To avoid edit conflicts each agent owns separate directories. I will run them one after another unless you want parallel work.

| # | Phase | Owner (agent) | Owns | Exit evidence |
|---|---|---|---|---|
| 1 | Architecture and interfaces (`ModelProvider`, `Tool` class field, `BrowserWorker` protocol, allowlist schema) | AI architecture | `apps/agent/src/contract`, docs | Interfaces compile, ADR written |
| 2 | Model orchestration | Model orchestration | `apps/agent/src/ollama`, new `src/models` | Existing behaviour unchanged (regression), router tests |
| 3 | Knowledge index and site tools | Website knowledge | new `src/knowledge`, `src/tools/site-*.ts` | Index built from local site fixture, retrieval tests, injection tests |
| 4 | Browser worker (local only) | Browser automation | new `apps/browser-worker` | Allowlist, SSRF, redirect and isolation tests on local fixtures |
| 5 | Approval framework and authorisation | Backend and API security | `src/security`, pipeline step | Confirmation-token tests, no financial tool test |
| 6 | Frontend: approval cards, source and "AI-written" labels, progress | Frontend integration | `apps/web/src/components/assistant` | Browser tests on desktop and phone |
| 7 | QA and performance | QA and performance | `tests/`, `docs/` | Full regression, latency and memory report |

## 11. Risks and open decisions

1. **Where the browser worker runs.** A separate host is required (purchase). Until approved, development uses a local machine only.
2. **Authenticated browser sessions** (section 2): I recommend not doing them in this phase. Please confirm.
3. **Model quality limits** (section 5): general conversation will stay modest on this hardware. A larger model needs a bigger host, which is a cost decision.
4. **Production domain name** for the allowlist.
5. **Sinhala** answers remain "needs native review"; nothing here changes that.
6. **The earlier "post-M1 stabilisation" task** is paused. The full browser suite I started for it is still running; I will report its result and the keyboard-test result before any new code, unless you tell me to drop that task.

## 12. Approvals needed from you before implementation

- Confirm the section 2 design (anonymous worker, typed tools for customer data).
- Approve starting Phase 1 (interfaces only, local, no deployment).
- Name the production domain for the allowlist.
- Decide the worker host (new small server, or local development only for now).
- Keep or drop the paused stabilisation task.
