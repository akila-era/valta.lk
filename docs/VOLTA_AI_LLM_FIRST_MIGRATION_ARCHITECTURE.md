# VOLTA AI: LLM-first migration architecture (design only)

Date: 2026-11-14. Written for: the project owner. **This is a design. Nothing was implemented, no source, test, config or other document was changed, no model was run, no server was contacted, no key was used, nothing was committed or deployed.** It builds on `VOLTA_AI_COMPLETE_ARCHITECTURE_AUDIT.md` (cited as *the audit*); every code claim below that I relied on was re-read in the current tree (file:line given). Concurrent work this design must respect: the **R0 agent** is editing `apps/agent/src/router/**`, `reasoning/**`, `verify/verifier.ts`, `pipeline/**` and `session/**` right now, and a model-runtime agent is setting up a local runtime.

Evidence labels: **Code** = read in the repository today; **Doc** = taken from a project document or a vendor page quoted in the audit (not re-measured); **Estimate** = my arithmetic, stated with its inputs; **Unverified** = needs a model, a server or people.

---

## 1. Summary and verdict

**What the owner asked for.** The language model is the primary intelligence and writes the answers: it reads the whole message and the conversation, understands Sinhala/Singlish/English/mixed, handles corrections, negations and instructions, decides between answering from knowledge, calling tools and researching, and writes its own natural reply. Templates remain only for deterministic UI messages, errors and system notifications.

**What I propose.** A model-driven *turn loop* (context assembly, model decides, tools run under application-level authorisation, model writes the answer, a redesigned grounding verifier checks it) with a strict split of responsibilities:

- **Model-driven:** understanding, history use, corrections/negations/instructions, deciding to answer or call tools or search, tool arguments, and the wording of every answer (including general knowledge, calculation results, explanations, comparisons and recommendations).
- **Deterministic and kept exactly as today:** identity and session isolation, rate limits, input safety gates, tool authorisation (including `financial` = never), the **structured cards and actions** and their field-by-field verification (price, stock, variant, fit, cart, order, links), confirmations for cart changes and browser actions.
- **Templates:** only for system notifications (busy, error, refusal of secrets/payment, "I could not verify this", "search unavailable") and the compatibility fallback during migration.

**The verifier changes character:** from "model text may contain no facts at all" to "every *store* fact in model text must be traceable to this turn's tool results, every *search* claim must carry a source actually fetched this turn, and refusal classes stay". Sinhala letters, digits, prices and normal factual statements are no longer rejection reasons by themselves.

**Feasibility verdict (honest).** The architecture is sound and can be built behind interfaces with fake models first. **It is not shown to be viable on today's production hardware:** a 6-vCPU CPU-only server generates about 2 to 7 tokens/s for the models we can fit (Doc, `models/registry.ts`, `VOLTA_AI_MODEL_SELECTION_REPORT.md`), so a 100-token answer costs 15 to 50 s before any tool round; Sinhala quality of 1.7B to 9B local models is unmeasured; the one measured tool-choice run (Qwen3.5-4B) scored 54.3% with a 32 s median call. A hybrid is the likely end state (section 8): router-assisted tool prefetch and short model answers on local hardware for shopping turns, plus either a larger/faster host or an approved hosted model for general and search turns. **That choice needs the owner's decision and an isolated real-model benchmark before anything is built on assumptions.**

**Proposed order:** build model-agnostic foundations and the fake-model test rig first (after R0 lands), then the verifier v2, calculator and general lane, then the real-model benchmark on an isolated host, then the search lane, then website/contract 1.4, then shadow on test traffic only, then canary (section 9).

---

## 2. What the code does today (re-verified, short)

| Fact | Evidence (Code) |
|---|---|
| Every shopping reply is a fixed template; the model never writes an answer that carries facts | `pipeline/routing-pipeline.ts:383-405,436-445` (template chosen by outcome), `verify/verifier.ts:269-280` (reply source must be template, polished-fixed Sinhala, or a verified chat reply) |
| The chat model gets `[system, current message]` only, 70 tokens, English, no digits/prices/Sinhala/product names allowed in its reply | `pipeline/chat-responder.ts:11-22,46`; `verify/verifier.ts:292-317` |
| The planner gets `[system, context block (≤6 known products, page, cart count), message]`, picks ≤3 tools, its text is discarded | `pipeline/english-planner.ts:52-60,100-139` |
| No conversation text is stored; session = ids, profile codes, slots, in memory, 300 sessions, 30 min idle, 8 h max | `session/store.ts:5-19,98-99` |
| Router first: `routeMessage` decides intent/template; scope guard sends general questions to `clarify_what`; below score 3 it abstains | `routing-pipeline.ts:188-193,209-239`; `router/scope.ts:63-76`; audit section 4 |
| Any verifier mismatch replaces the whole answer with `verification_failed` | `routing-pipeline.ts:482-490` |
| Model client: Ollama `/api/chat`, `stream:false`, `num_ctx` 2048 fixed, reply cap 120 tokens, tool cap 200, at most 8 messages, 4,000 chars per message, think off, loopback only | `ollama/models.ts:38-42,83-110`; `ollama/client.ts:56-66,110-124` |
| The client already parses native tool calls (`message.tool_calls`) and token counts | `ollama/client.ts:18-30,116-123` |
| Selectable Qwen tags: exactly two (`qwen3:1.7b-q4_K_M`, `qwen3:4b-instruct-2507`); registry describes more but "only local, self-hosted runtimes exist as a type... no remote or paid provider kind" | `ollama/models.ts:9-20`; `models/types.ts` (ProviderKind) |
| One inference slot, queue, deadline 45 s default, degrade when the wait is too long | `queue/scheduler.ts:3-9,238`; `config.ts:169` |
| Tools: 10, strict schemas, actor allow-lists, ≤3 calls per turn, 64 KB result cap, timeouts; action classes read/reversible/sensitive/financial with `financial` = never | `tools/runner.ts` (MAX_CALLS_PER_TURN, MAX_RESULT_BYTES); `tools/action-classes.ts` |
| Contract 1.3; `ReplySource` = template / sinhala-llm / qwen; `reply.text` ≤2,000; a stream `token` event already exists; the website parses the response with a **strict** schema | `contract/schemas.ts:16,202,254-270,312`; website `src/lib/assistant/schema.ts:138` |
| The widget renders reply text as plain text | website `components/assistant/assistant-panel.tsx:137,161` |
| An evaluator harness for the M5/M8 sets treats any reply that is not a known template as "not a verified answer" | `tests/bench/m5-reasoning/evaluate.ts` (`isTemplateReply`); the harness must be replaced for LLM-first (section 9) |
| A fake Ollama server and a host-protecting real-model benchmark core already exist | `tests/fake-ollama/server`, `tests/bench/bench-core.ts`, `tests/bench/model-bench-guards.test.ts` |

---

## 3. Target architecture

### 3.1 Principles

1. **The model sees the user's original message**, verbatim. Normalised forms are router hints only.
2. **The model sees the conversation** (bounded history plus explicit state: corrections, negative preferences, profile, discussed products, language/brevity instructions).
3. **Facts about the store come from tools, never from the model.** The model writes sentences; cards carry the verified values; the verifier checks that sentences and cards agree.
4. **The application authorises tools, not the model.** The model proposes calls; the server validates schemas, actor rights, limits and class (`financial` never available).
5. **No silent template fallback for normal conversation.** When the model cannot answer, the shopper gets an honest system notification, not the shopping menu.
6. **Safe degradation:** every added capability has a kill switch and an `off` mode equal to today's behaviour.

### 3.2 What stays deterministic and what becomes model-driven

| Concern | After the migration | Why |
|---|---|---|
| Identity, session ownership, HMAC, replay, rate limits, concurrency, pre-auth body limits | **Deterministic, unchanged** (`http/server.ts`, `security/*`) | Security boundary; not a language task |
| Input safety gate (secrets, card numbers, injection, exfiltration, price manipulation) | **Deterministic, kept**, narrowed by R0 so benign messages pass; refusals stay fixed system messages | A model must not be the only defence against its own manipulation |
| Intent understanding, correction/negation/instruction interpretation, language handling, reference resolution ("meka", "second one", "kalin kiyapu eka") | **Model-driven**, helped by deterministic hints and explicit session state | This is the owner's core requirement |
| Which tool to call and with what arguments | **Model-driven**, validated by the server; router hints may *prefetch* obvious tools to save a model round-trip (3.5) | Latency on CPU |
| Tool execution (validation, authorisation, timeouts, caps, result shaping) | **Deterministic** | Existing and tested |
| Cards, comparison tables, actions, links and their verification | **Deterministic**, built from tool results, verified field by field as today | Prices, stock, variant, `fit` must never depend on model text |
| Negative preferences ("don't recommend Samsung") | Model reads them; **the server also filters** excluded brands/products out of tool results and cards | Defence in depth: an instruction can never be lost by a bad generation |
| The text of every answer (shopping, comparison, recommendation reason, general, maths, explanation, research) | **Model-written**, verified by the grounding verifier | Owner requirement |
| Web research (query, source selection, answer) | **Model decides and writes; the server executes the search/fetch, extracts, fences and attaches sources** | Never trust the model for sources |
| Cart changes, browser actions | Proposals the shopper confirms (unchanged); browser tools off by default | Existing approval framework |
| System messages (busy, error, refusal of secrets/payment, unverifiable, search unavailable, hand-offs) | **Templates** (a small fixed set, wording variants allowed) | Owner: templates remain for UI, errors, notifications |

### 3.3 Data flow of one turn

```
widget -> website route (identity, rate limit, cookie session) -> signed -> Agent /v1/chat or /v1/chat/stream
   |
   v
[1 Gates]  pre-auth, HMAC, rate limits, session registry              (unchanged)
[2 Safety] input gate: secrets / injection / exfiltration / price manipulation  (narrowed by R0)
   |  blocked -> system refusal message (template)
   v
[3 Hints]  original message kept verbatim; deterministic hints computed in parallel (cheap, no model):
           language guess, router intent + entities (brand, category, budget, referents), negation/correction signals, page + cart
   v
[4 Context assembly]  system prompt (fixed, cacheable) + tool schemas (subset for this actor/flags)
           + SESSION FACTS block (profile, negative preferences, corrections, discussed/shown products, language & brevity instructions)
           + last N turns of the conversation (3.4 / section 7) + HINTS block + the user message (verbatim)
   v
[5 Decide] (a) high-confidence shopping hint -> PREFETCH: run the obvious read tool(s) now, put results in the prompt
           (b) otherwise the model is asked once: answer directly OR call tools (native tool call, JSON-constrained fallback)
   v
[6 Tool rounds] max 3 rounds, max 3 calls per round: validate -> authorise -> run -> shape (64 KB cap) -> fence as DATA -> back to the model
           tools: product search/details/stock/compare/accessories (+ cart proposals, orders for customers), calculate, web_search,
                  fetch_page (search results only), lookup_documentation, (browser_* off by default)
   v
[7 Answer]  the model writes the final answer (streams tokens to the widget when the client supports it)
   v
[8 Grounding verifier v2]  cards/actions: exactly today's checks.  text: claim extraction -> store facts vs tool results,
           search claims vs sources fetched this turn, refusal classes, leak checks.  Result: ok / repaired / rejected.
   |  repaired = one regeneration with verifier feedback, or sentence-level removal; rejected = honest system message
   v
[9 Response]  text + cards + actions + suggestions + optional sources (contract 1.4) + meta (tokens, tool rounds, answer class)
```

Streaming path (`/v1/chat/stream`): `status` events at each stage (they exist: queued, routing, tool, writing), `card` events as soon as the deterministic cards are verified (they do not depend on the text), then `token` events for the answer (the event type exists, `contract/schemas.ts:312`), then a final verified `text` event that is authoritative. **Streaming and verification interact:** tokens are shown only after the *pre-checks that can run on a prefix* (no secret/leak patterns); the final verified text replaces the streamed text, and a rejected answer is replaced in the UI by the system message. This needs a client rule ("the last text wins") which the widget must implement (section 4, widget row). The current implementation calls Ollama with `stream:false` (`ollama/models.ts:105`), so real token streaming needs a client change.

### 3.4 Answer classes (carried through the pipeline, chosen by what the turn used)

| Class | When | Verifier rules |
|---|---|---|
| `store` | at least one store tool result is in play (products, stock, compare, cart, orders) | cards/actions: all existing checks; text: store claims must match tool results (5.2) |
| `general` | no tool, or `calculate` only | no store claims about VOLTA products/prices/stock; digits, Sinhala and facts allowed; leak/secret checks |
| `search` | `web_search`/`fetch_page`/`lookup_documentation` produced sources | every external claim attributable to a fetched source; sources attached; "searched" wording only if a search ran (5.4) |
| `system` | busy, error, refusal, unverifiable, hand-off | fixed templates (kept), including R0 wording variants |

A turn can be `store` + `search` (for example official specifications next to a store price): each sentence is judged by the class of the facts it uses, and the answer must keep the three kinds visibly apart (verified store data, search-derived information with sources, general knowledge).

### 3.5 What happens to the router (decision, with evidence)

**Decision: keep it as a fast hint-and-prefetch layer and as the compatibility fallback; remove it as the author of replies and as the scope gate for general questions.** Evidence and reasoning:

- It is the only component that has measured answers: M4/M5/M8 DEV and frozen first runs (intent 88.6% / recommendation 83.3% on EVAL; audit section 5) and the registry shows tool choice 65/100 for Qwen3-1.7B alone against 89/100 router-first (Doc, `models/registry.ts`). Deleting it would lose the measured shopping accuracy and the latency win.
- Latency: on CPU every model round costs seconds (section 8). A high-confidence router hint lets us **prefetch** the tool (milliseconds) and give the model the results in its *first* prompt: one model call instead of two. This is the single most important latency decision in the design.
- But the router is also the root cause of the wrong answers (audit sections 4 and 5): abstention, keyword collisions, `scope.ts` sending "capital of France" to `clarify_what`. After the migration it must never *decide the reply*. Its output becomes a `HINTS` block (intent, entities, confidence, negation/correction flags) the model may use or ignore.
- Router changes that R0 is making (corrections, negations, bare categories, language fix, safety narrowing) are reused as **hints and explicit session state**, not discarded.
- `scope.ts`: the `general` and `live_info` verdicts stop producing `clarify_what`; they become hints ("looks general", "asks for live information") that route to the general/search lane. `external_site` ("search Google", "open Daraz") changes meaning: web *research* becomes a permitted tool; *opening or browsing other websites* stays forbidden for the browser controller (VOLTA host only).

### 3.6 Contract impact (1.0 to 1.3 compatible; new optional fields in 1.4)

Rules from the existing discipline (`contract/compat.ts`, `contract/schemas.ts`): a new field is optional and sent only to clients that declare the new version; an unknown version is refused (422); the website's response schema is **strict** (`schema.ts:138`), so an unannounced new key makes the website reject the answer.

| Addition | Contract |
|---|---|
| `sources: [{ title, url, domain, fetchedAt }]` (max 6) on the response | **1.4, optional.** Client declares `"1.4"`; older clients never receive it. URLs come from the search tool results only, never from model text |
| `reply.source` value for model-written text | existing `"qwen"` is a model-specific label; add `"llm"` in 1.4 and map it to `"qwen"` for ≤1.3 clients inside `contract/compat.ts` (so the website keeps parsing) |
| `meta.answerClass` (`store`/`general`/`search`/`system`) and `meta.toolRounds`, `meta.tokens` | **1.4, optional**, counts only |
| Stream: use the existing `token` event; optionally a `sources` event | 1.4 for `sources` |
| Request: `history` is **not** sent by the widget; the Agent keeps it server-side (section 7). No request change | none |
| Instruction/preferences set by the shopper in chat ("reply in Sinhala", "no more questions") | session state, no contract change |

Deployment order stays: Agent first (it speaks 1.4 and still serves 1.0 to 1.3), website second (mirror + widget), rollback website first.

---

## 4. Code paths that must change

"Order" = dependency order (1 first). **R0** marks files the R0 agent is editing now: do not touch until R0 is finished and merged in the working tree. Sizes are rough engineering estimates (Estimate), not commitments.

| # | File / area | Today | Required change | Size | Risk | Order |
|---|---|---|---|---|---|---|
| 1 | `ollama/models.ts` | two allow-listed Qwen tags, fixed `num_ctx` 2048, caps 24/200/120 tokens, ≤8 messages, 4,000 chars/message, `stream:false`, think off | Introduce a **`ModelProfile`** (from the registry: tag, `num_ctx`, reply cap per purpose, think/format flags, tool-calling support) selected by config; raise limits for the LLM lane (history needs >8 messages; reply cap per answer policy); keep the allow-list as the policy gate (registry `status` decides, not a hard-coded pair); keep Sinhala-polisher rules | M | Med | 1 |
| 2 | `ollama/client.ts` | non-streaming, parses `tool_calls` | Add **streaming** (NDJSON `/api/chat` with `stream:true`), `format` (JSON schema) support in the decide step, measured per-call stats (already parsed), tool-message round trips (`role:"tool"`) | M | Med | 1 |
| 3 | `models/types.ts`, `models/registry.ts` | `ProviderKind = "ollama-local"` only, by design | Only if the owner approves a hosted model: add a provider kind with explicit policy fields (data leaves the server, key, cost cap, allowed tasks). **No change without the owner's approval** | S | **High (policy)** | later |
| 4 | NEW `src/llm/**` (turn loop, context assembly, decide/answer prompts, tool-call parser, repair loop) | none | The new lane, behind `AGENT_LLM_FIRST` (3.7 below). Pure functions + an injected `LlmClient` so it is testable with a fake | L | Med | 2 |
| 5 | `session/store.ts` | no text; ids and profile codes | Add bounded **conversation history** and **explicit constraints** (negative preferences, corrections, instructions) in memory only (section 7); same key `(identity, sessionId)`, same TTL/absolute limits | M | Med (privacy) | 2 |
| 6 | `reasoning/profile.ts`, `reasoning/engine.ts` | profile (category/brand/budget/usage), discussed/shown ids, asked questions | **R0.** Afterwards: expose `constraints` (exclusions) and `corrections` as part of session facts; ranking/search honour exclusions server-side | M | Med | after R0 |
| 7 | `router/router.ts`, `router/scope.ts`, `router/templates.ts`, `router/language.ts` | decides intent and reply; scope guard blocks general | **R0.** Afterwards: `routeMessage` returns hints + confidence only for the LLM lane; scope verdicts become hints; templates reduced to system messages and wording variants; language detection used for flags and hints, not for choosing templates | L | **High (regression of measured sets)** | after R0 |
| 8 | `pipeline/routing-pipeline.ts` | the whole shopping pipeline; `clarifyOrChat`, planner, `compose` | **R0.** Afterwards: keep as the **`off` lane and the compatibility fallback**; add the lane switch at the top; share the tool-running, allow-list, card-building and `compose` verification code with the new lane (extract, do not duplicate) | L | **High** | after R0 |
| 9 | `pipeline/english-planner.ts`, `pipeline/chat-responder.ts`, `pipeline/polisher.ts` | tool picker (English only), 70-token chat reply, template rewriter | Superseded by the turn loop in the `on` lane. Kept for `off`. `CHAT_SYSTEM_PROMPT` is imported by the verifier (leak check): move the leak-check source to a shared constant | S | Low | 6 |
| 10 | `verify/verifier.ts` | one rule set; model text may hold no digits/Sinhala/prices/names | **Verifier v2** (section 5): keep all card/action checks; replace `modelReplyProblem` with claim grounding; new failure codes; class-aware | L | **High** | 3 (design) / after R0 (edit) |
| 11 | `tools/definitions.ts`, `tools/registry.ts`, `tools/runner.ts`, `tools/action-classes.ts` | 10 shopping tools, ≤3 calls per turn | Add `calculate` (safe evaluator), `web_search`, `fetch_page`, `lookup_documentation`; allow multiple **rounds**; per-tool class, budget and actor rules; result fencing; `run_code` registered but disabled (6.5) | M | Med | 3 |
| 12 | NEW `src/search/**` | none | Provider interface, SSRF-safe fetcher, extraction, injection fence, quota/cost accounting (section 6.4) | L | Med-High (external data flow) | 5 |
| 13 | `contract/schemas.ts`, `contract/compat.ts` | contract 1.3 | Contract 1.4 optional `sources`, `reply.source:"llm"`, `meta` fields; version shaping; stream events | M | Med | 6 |
| 14 | `http/server.ts` | chat, stream, health, metrics, voice, browser, pre-auth | Lane selection, streaming of tokens, deadline split between tool rounds and answer, per-conversation lane stickiness; no change to auth | M | Med | 6 |
| 15 | `app/stack.ts`, `main.ts` | builds the pipeline | Build the LLM client, tool registry additions, search provider (disabled unless configured), lane flag | S | Low | 6 |
| 16 | `queue/scheduler.ts` | one slot, three priorities | Account for multi-call turns (planner + answer = 2 jobs of one conversation): either hold the slot across the turn's calls or accept interleaving; keep customer priority; degrade rules count a whole turn | M | Med | 2 |
| 17 | `observability/**` | counts and latencies | Counters in section 11 (reply source, answer class, tool rounds, repairs, rejections by code, tokens, search calls and cost) | S | Low | 6 |
| 18 | `browser-agent/intent.ts`, `server.ts` browse hook | a second, regex-based intent layer before the pipeline | Fold the browse intent into the tool layer (the model may *request* `browser_*` tools when `AGENT_BROWSER_ENABLED`); until model-driven browsing is evaluated against injection, keep the regex layer and keep the feature off | M | **High (security)** | last |
| 19 | Website `src/lib/assistant/schema.ts` (strict mirror), `app/api/assistant/chat/route.ts`, `components/assistant/**` | contract 1.2 mirror, plain-text replies | Contract 1.4 mirror, `sources` rendering (title + domain, plain-text link with `rel="noopener noreferrer nofollow"`, http/https only), search/general labels, token streaming ("last text wins"), honest system-message states | M | Med | 7 |
| 20 | Website admin QA centre (`lib/ai-qa/**`, `components/admin/ai-qa/**`) | stale capability text; scenario runs on the template pipeline | Update capability claims from real probes; add the model-backed run mode | S | Low | late |
| 21 | Tests: `tests/bench/m5-reasoning/evaluate.ts` and siblings | assumes template replies | Do **not** reuse for LLM-first: new `tests/llm/**` harness and DEV set (section 9) | L | Low | 3 |
| 22 | `normalize.ts` | match-form rewriting for the router only | Keep; add a test that the raw message reaches the model unchanged (R0 already adds an "original preserved" test) | S | Low | with R0 |

### 3.7 Feature flags and the compatibility fallback

`AGENT_LLM_FIRST = off | shadow | on` (default `off`): `off` is exactly today's pipeline. `on` selects the new lane **per conversation, sticky by a hash of the session id** (so a conversation never switches lanes mid-way). Sub-flags, each default off: `AGENT_LLM_SEARCH`, `AGENT_LLM_CODE`, `AGENT_LLM_BROWSER`. `shadow` computes the new lane's answer **without serving it** — but see 9.4: it must not run on live shopper traffic (it doubles CPU load on the single slot and storing the comparison would require storing message text, which the privacy design forbids), so shadow is for staging/replay with consented test messages only.

Compatibility rules while both lanes exist: (1) a router high-confidence **shopping** intent with the model lane unavailable falls back to the old template path, marked `meta.degraded: true`; (2) a **non-shopping** message with the model lane unavailable gets the honest "busy, try again" system message, **never** `clarify_what`; (3) a model answer the verifier cannot repair gets the honest "I could not verify that" system message, never the shopping menu.

---

## 5. Verifier redesign

### 5.1 What stays

Everything that guards structured output and authorisation is kept unchanged and still runs on every answer: `card_without_source`, `unknown_product`, `product_mismatch` (including `fit` recomputation), `variant_mismatch`, `stock_mismatch`, `accessory_unauthorized`, `comparison_mismatch`, `cart_mismatch`, `order_unauthorized`, `order_mismatch`, `action_unauthorized`, `link_not_approved`, `contract_version` (`verify/verifier.ts:184-267,319-326`), the `sensitive_leak` scan of every outgoing text (`:282-283`) and `review_flag_missing` (`:285-287`, still required for any Sinhala/Singlish/mixed output until native review).

### 5.2 Grounding model for model-written text (replaces `modelReplyProblem`, `verifier.ts:292-317`)

The text is parsed into **claims** by deterministic extractors (no second model needed for the core rules):

| Claim kind | Extraction | Check | On mismatch |
|---|---|---|---|
| **Price / amount** | currency patterns (`Rs`, `LKR`, `රු`, grouped numbers with currency), per-sentence | If the sentence names or refers to a store product (resolved by name/id against this turn's tool results): the amount must equal `effectiveCents` or `priceCents` of that product (the verifier's own `rs()` formatting, `verifier.ts:66-70`), or a difference/total produced by the `calculate` tool in this turn. A currency amount with no product: allowed only if it equals the user's own stated budget, a tool result, or a calculator result; otherwise `claim_ungrounded` | repair (6.3) |
| **Stock / availability** | availability vocabulary in English/Singlish/Sinhala (a maintained lexicon: in stock, out of stock, available, තොගයේ, ... ) attached to a resolved product | must match `available`/stock result for that product from this turn | repair |
| **Specification** | spec vocabulary (RAM, storage, battery, camera, processor, display...) + number/unit near a resolved product | must equal a spec row in this turn's product result; a spec the data lacks may only be stated as "not listed"; an external manufacturer spec is allowed only as a `search` claim with a source | repair |
| **Product / brand names** | resolve mentions against the catalogue vocabulary | a store product named in text must be in this turn's results or the user's message; never an invented product; names of non-store products (a competitor, a generic device) are fine | repair |
| **Exclusions** | session constraints | text must not recommend an excluded brand/product (card filtering is server-side; the text check is a second line) | repair |
| **Numbers in general answers** | not store-related | allowed. Arithmetic the model states for the user's computation must equal the `calculate` result if one ran; if no calculator ran and the sentence is a computation ("15% of 2400 is X"), the verifier can recompute simple percent/sum/product with the same evaluator and compare | repair |
| **Links** | URLs in text | only URLs present in this turn's `sources`; any other URL is removed (not rejected) | strip |
| **Search attribution** | claim sentences with `[n]` markers | marker `n` exists; the source was fetched this turn; plus a cheap lexical support check (key noun phrases/numbers of the sentence appear in the cited snippet: heuristic, labelled as such) | repair or drop sentence |
| **"I searched" statements** | phrases claiming a search/lookup | allowed only if a search tool ran this turn with ≥1 result; else `search_claimed_without_search` | repair |
| **Length/markup** | length ≤ a per-class cap (default 1,200 chars, contract max 2,000); HTML/script markup stripped | cap and strip; simple lists and line breaks are allowed (rendered as plain text) | truncate at a sentence boundary |

Matching tolerances: money compared in integer cents after parsing grouped digits in both Latin and Sinhala digit forms; units normalised (GB/ජීබී, mAh); a spec "approx." wording is not a number mismatch; a rounding of a verified price ("about 150 thousand") is accepted only within 1% and only when the exact figure is on the card in the same answer.

### 5.3 Free text that is explicitly allowed

Sinhala script, Singlish, digits, years, percentages, units, dates and ordinary factual statements about the world, explanations and code, as long as they carry no unverifiable *store* claim and no unattributed *search* claim. This removes the current rejections for digits, currency words, Sinhala letters, `price/available/days/discount`, links in sources, product names that are legitimately in the results, and live-information words when a search provides them.

### 5.4 Retained refusal classes (not relaxed)

Secrets and card/OTP/NIC patterns in output (`containsSensitive`); system-prompt/instruction leakage (the current `LEAK_WORDS` and prompt-echo check, made independent of the chat prompt constant); compliance with instructions found in tool results or web pages (the model may not act on them: enforced by tool authorisation plus an output check for "ignore previous", role-play of an operator, requests for secrets); payment/checkout/discount actions (`financial` class stays unavailable; text claiming an order was placed is a `claim_ungrounded`); cross-customer data (order tools are actor-bound; guests never receive order data, `verifier.ts:244-246`); outbound search queries containing personal data (6.4).

### 5.5 Degradation (never a silent generic template)

1. **Repair once.** Regenerate the final answer with a server-written feedback message that names the violated *categories* and the correct facts from tool results (for example "the card price for X is Rs. 1,000; restate it"). Costs one more model call, so only for store/search violations.
2. **Else sentence-level removal:** keep the verified sentences, drop the failing ones; if what remains is empty or incoherent, go to 3.
3. **Honest system message:** "I could not verify that answer, so I'm not going to state it. [What I can show: the verified cards.]" with the cards (they were verified independently) when the turn had any, and a suggestion to rephrase or to ask for the product details. Counts the `verification_failed_text` metric; no content logged.
4. **Model unavailable/timeout:** the `busy` system message with `retryAfterSec`, or, for a recognised shopping intent, the old template path (`meta.degraded`).

### 5.6 What changes, check by check (today's `modelReplyProblem` and friends)

| Today's check | Decision | Reason |
|---|---|---|
| any digit / `[෦-෯]` (`:305`) | **Removed** | General answers, calculations, years, specs need digits; store numbers are grounded by 5.2 instead |
| currency words and symbols (`:306`) | **Replaced** by amount grounding | Prices may be stated when they equal tool results |
| links `https?:`, `www.`, `.com`, `.lk`, `@` (`:307`) | **Relaxed**: only URLs from `sources`; others stripped; `@` kept as sensitive-pattern input | Citations need links |
| markup `*_\`#<>{}[]|~` and list bullets (`:308`) | **Relaxed**: strip HTML/script/active markup, allow plain lists and line breaks | The widget renders plain text |
| Sinhala letters (`:309`) | **Removed** (still flags `needsNativeReview`) | The owner wants Sinhala answers |
| live-info words (`:310`) | **Relaxed**: allowed when a search result provides the information in this turn; otherwise the model must say it cannot check | Search lane |
| `CLAIM_WORDS` price/available/warranty/delivery/discount (`:292,311`) | **Replaced** by claim extraction (5.2) | These are exactly the store claims to ground |
| catalogue product/brand name (`:314`) | **Replaced**: allowed when the product is in this turn's results; invented names rejected | Comparisons and recommendations must name products |
| length > 320 (`:304`) | **Relaxed**: per-class cap | Explanations are longer |
| leak words / prompt echo (`:293,315`) | **Kept** | Safety |
| `reply.source` must be template/sinhala/qwen-verified (`:269-280`) | **Replaced** by class rules; templates only for `system` | LLM-first |
| `i.cards.length > 0 || i.actions.length > 0` forbids a model reply with cards (`:277`) | **Removed**: model text *accompanies* verified cards; consistency is checked | Core of the design |
| `verification_failed` replaces the whole answer (`routing-pipeline.ts:482-490`) | **Replaced** by 5.5 (repair/partial/honest message); a *card* failure still drops that card set | More useful, still fail-closed for structured facts |

New failure codes: `claim_ungrounded`, `claim_price_mismatch`, `claim_stock_mismatch`, `claim_spec_mismatch`, `excluded_item_recommended`, `citation_invalid`, `search_claimed_without_search`, `unsourced_link`, `text_too_long`.

---

## 6. Tool layer

### 6.1 Function-calling schemas (names and shapes; validated with the existing strict zod discipline)

Existing, kept (schemas in `tools/definitions.ts`): `search_products`, `get_product_details`, `compare_products` (2 to 4 ids), `check_stock`, `get_accessories`, `get_cart`, `add_to_cart`, `update_cart_quantity`, `remove_from_cart` (proposals only), `get_order_status` (customers only).

New:

| Tool | Input | Output (data, fenced) | Limits | Authorisation |
|---|---|---|---|---|
| `calculate` | `{ expression: string(≤200) }` (numbers, `+ - * / ^ %`, parentheses, `sqrt min max round abs`, "x% of y" as `x/100*y`) | `{ result: number, normalised: string }` | no `eval`; recursive-descent parser, depth ≤20, tokens ≤100, decimal arithmetic, 100 ms; no variables, no I/O | all actors |
| `web_search` | `{ query: string(≤200), freshness?: "day"\|"week"\|"month"\|"any", site?: official-domain key }` | `{ results: [{ id, title, url, domain, snippet(≤400), publishedAt? }] (≤6) }` | per-conversation 3 searches, per-identity daily cap, global daily cap, 5 s timeout, no retries beyond 1 | all actors; disabled unless `AGENT_LLM_SEARCH` and a provider is configured |
| `fetch_page` | `{ resultId: string }` — an id from a `web_search` result **of this turn**, never a free URL | `{ id, title, domain, text(≤6,000 chars, extracted), truncated }` | SSRF-safe fetch (6.4), 3 pages per turn, 8 s, 1 MB cap | same |
| `lookup_documentation` | `{ query, product: "android"\|"ios"\|"windows"\|... }` | same as `web_search` restricted to an allow-list of official documentation domains | as `web_search` | same |
| `run_code` | `{ language: "python"\|"javascript", code, stdin? }` | `{ stdout, stderr, exitCode }` | **registered but disabled** (6.5) | none until approved |
| `recall_conversation` | `{}` | the server-built SESSION FACTS (profile, constraints, corrections, discussed products) | read-only | all actors; replaces a model-writable "memory" tool (section 7) |
| `browser_*` | existing `browser.*` schemas | existing | off by default; model-driven use only after an injection evaluation | existing confirmation rules |

### 6.2 How the model's calls are obtained, parsed and validated

1. **Primary:** Ollama native tool calling (`tools` in `/api/chat`; the reply's `message.tool_calls`, already parsed in `ollama/client.ts:18-30,116-118`). Use a *subset* of tools per turn (actor, flags, router hint) to keep the prompt small.
2. **Fallback for small models that emit malformed calls:** a constrained **decide step** using Ollama's `format` (JSON schema) with `{ action: "answer" | "tool", calls: [...] }`, which constrains the output grammar and removes most JSON failures; one retry with the existing server-written hint (`english-planner.ts:131-134`: field names only); then the deterministic router's plan if its confidence is high; otherwise the answer step runs without tools and the model is told no tool result is available (it must not invent one).
3. **Validation (unchanged semantics):** unknown tool, forbidden actor, strict-schema failure, duplicate call, more than 3 calls per round (`tools/runner.ts`), unknown product id/category/brand against the allow-lists (`routing-pipeline.ts:256-263`), no model-supplied URLs.
4. **Result return:** a `role:"tool"` message per result, shaped and size-capped (64 KB runner cap; far less goes to the prompt, 6.6), wrapped in the data fence (`<<<TOOL_DATA ... TOOL_DATA_END>>>`, extending `browser/policy.ts` `wrapUntrusted`), never as instructions.
5. **Loop limits:** ≤3 rounds, ≤3 calls per round, total tool time budget per turn, global deadline split: tool rounds may use at most 60% of the remaining deadline so the answer always has time; on budget exhaustion the model is told to answer with what it has.

### 6.3 Repair loop

Part of the turn, not a tool: after verification fails, one regeneration with category feedback (5.5). Counted separately so cost and latency are visible.

### 6.4 Web research design (provider interface; no provider chosen, no key used)

- **Interface:** `SearchProvider.search(query, opts) -> results[]` and `FetchProvider`/extractor. Adapters live in `src/search/providers/*` and are enabled by config only. Candidates from the audit (Doc, vendor pages read 2026-11-14): **Gemini API grounding with Google Search** (the provider does retrieval and returns citations; fewest moving parts; text leaves to Google; Sinhala quality and terms unverified; the free-tier statement is contradictory between two pages) and **Brave Search API** (raw results to verify and cite ourselves; $5 per 1,000 requests; storing results needs a custom plan). **Google Custom Search (closed to new customers, ends 2027-01-01) and Bing Web Search (retired 2025-08-11) are excluded.** SearXNG only for private evaluation.
- **Two integration shapes, to be chosen with the owner:** (A) *retrieval provider* (Brave-like): we get results, fetch pages ourselves, the local/hosted model writes the answer from fenced evidence, the verifier checks citations. (B) *grounded generation provider* (Gemini-like): the provider's model produces a grounded answer with citations; our verifier still checks that cited URLs came from the provider's metadata and that no store claims appear without tools; the answer is labelled search-derived. (B) is less code and less injection surface but sends the conversation context to a third party and has its own Sinhala behaviour; (A) keeps control.
- **Decision logic (model-driven with a server floor):** the model decides whether to search; the server adds hard rules: never search for greetings or store prices/stock; never send customer identifiers, order data, cart contents or the full conversation as a query; strip emails/phones/NIC-like tokens from queries; a query is derived from the user's *question*, not pasted history; explicit "search/google/research" requests and "latest/current/official" patterns bias to search; unknown fact + low model confidence (an "I don't know" self-assessment prompt) biases to search.
- **Retrieval pipeline:** search -> rank/filter by domain trust (official vendor and documentation domains first; a per-topic allow-list for `lookup_documentation`) -> `fetch_page` on the top results with an **SSRF-safe fetcher separate from the VOLTA-only browser egress**: public IPs only via our own DNS resolution and pinning, redirect validation per hop, scheme https preferred, port 80/443 only, size/time caps, no cookies, no credentials, content types limited to HTML/text/PDF-as-text, user agent fixed. The existing `security/url-policy.ts` (blocked address ranges, `resolvePublicAddresses`, redirect checks) and the egress proxy are the starting point, with a *different* allow-list policy ("any public host except blocked ranges", not "valta.hexalyte.com only").
- **Extraction and fencing:** readable-text extraction, boilerplate removal, length caps, strip zero-width/bidi characters (the existing `sanitizeText`), fence as data. Page text never selects tools, never changes policy; instructions inside it are ignored and trigger an audit counter.
- **Citations:** sources are created by the server from provider metadata (title, URL, domain); the model refers to them by `[n]`; the final `sources` list contains only used, fetched ones; a "searched" claim without a search is rejected (5.2).
- **Quota and cost accounting:** per search call counters (provider, count, latency, status), daily/monthly caps from config with a kill switch, an alert at 50% and 80% of the cap, cost estimated from configured unit prices (default 0: no invented prices).
- **Caching:** in-memory only, short TTL, keyed by normalised query; do not store results beyond the terms of the provider (Brave: storage needs a custom plan).
- **Privacy:** state to the owner that outbound queries leave the shop's infrastructure; keep a short policy text for the privacy notice; log counts only.
- **Failure honesty:** provider error/quota/timeouts produce the `search_unavailable` system message ("I couldn't search right now"), never a made-up answer or a claim of having searched.

### 6.5 Safe code execution

1. **Calculator first (in scope now):** `calculate` as in 6.1, in-process, no `eval`, no dynamic code, parser tested by property tests (fuzz). It covers "15% of 2400" and most customer arithmetic.
2. **`run_code` is not implemented in the Agent process and is not proposed to run there.** Running model-written code needs a *separately approved isolated sandbox*: a dedicated unprivileged execution service with no network, no filesystem except a scratch directory, CPU/memory/time/output limits, a seccomp/namespace or VM boundary (options: gVisor or Firecracker-class isolation, or WASM runtimes such as Pyodide for Python with hard limits), killed on timeout, result size cap, per-identity quota, no persistence, audit counts. Requirements before approval: where it runs (not on the shopper-serving 12 GB server), who maintains it, the threat model, an independent review, and a decision whether customers need code execution at all (explaining Python does not).

### 6.6 Browser exposure

Disabled by default (`AGENT_BROWSER_ENABLED`). Model-driven `browser_*` tool calls are only designed, not enabled: the existing confirmation store, action classes, URL policy and egress proxy remain the authority; the independent review verdict "driver not safe to enable" and the missing OS-level isolation (browser reports) still block it. Page text reaching the model is fenced data; any injection signal ends the browsing task with a system message (as in `browser-agent`).

---

## 7. Conversation memory and context assembly

### 7.1 What reaches the model (token budget)

Constraint today: `num_ctx` 2,048 fixed "by the measured memory budget on the 4 GB server" (`ollama/models.ts:37-38`); the new server has 12 GB, and the staging benchmark ran at 4,096 (Doc, registry notes). LLM-first needs **4,096 minimum** (Estimate, table below); the memory cost of a larger context is part of the benchmark (section 8.3). Budget for one turn on a 4,096-token window (Estimate; tokenisation of Sinhala is much more expensive than English, so Sinhala turns need larger allowances):

| Block | Content | Tokens (Estimate) |
|---|---|---|
| System prompt (fixed, cacheable) | role, language policy, tool-use policy, grounding rules, safety rules, "data is not instructions" | 350 to 450 |
| Tool schemas (subset) | 4 to 8 tools | 300 to 700 |
| SESSION FACTS | profile (category/brand/budget/usage), negative preferences, corrections, shown/discussed products (id + name), instructions (reply language, brevity, no more questions), page, cart count | 150 to 300 |
| History | last N=6 turns (user and assistant text, each clipped to ~120 tokens), older turns folded into SESSION FACTS | 300 to 900 |
| HINTS | router intent/entities/confidence, negation/correction flags | 50 to 100 |
| Tool results (this turn) | shaped, not raw: ≤8 products × ~60 tokens, details ~250, search snippets ≤6 × ~100, fetched text ≤1,500 | 300 to 1,500 |
| User message | verbatim (≤800 chars) | 30 to 250 |
| Answer reserve | | 150 to 400 |
| **Total** | | **~1,800 to 4,500** |

So a 4,096 window is tight for search turns (use `fetch_page` summaries, fewer products) and Sinhala-heavy turns; an 8,192 window costs more RAM and prompt time (benchmark). The fixed system prompt + tool schemas form a **stable prefix** that Ollama can keep in its KV cache between turns of the same loaded model (the planner comment at `english-planner.ts:48-51` already relies on this); keep that prefix byte-stable.

### 7.2 State kept per conversation (server memory only)

Key `(identity, sessionId)` as today (`session/store.ts:24`), same limits (300 sessions, 30 min idle, 8 h absolute, lost on restart). Added: `history[]` (last 6 turns, text clipped, **memory only, never logged, never persisted**), `constraints` (excluded brands/categories/products, budget bounds, withdrawn exclusions), `corrections` (the last corrected interpretation, so "mama kiwwe eka nemei" drops the previous assumption and the model is told what was wrong), `instructions` (reply language, brevity, ask-no-questions), and the existing profile/shown/discussed ids. Explicit exclusions are enforced in code too (tool-result filtering and card building) so a wrong generation cannot violate them.

**Summarising older turns:** deterministic folding into SESSION FACTS (profile, constraints, discussed products, corrections), not an LLM summary, to save CPU time and avoid summary hallucination.

### 7.3 Tenant isolation, privacy and retention

History is isolated by the existing key; guests and customers never share state; a signed-in change rotates the session id (existing website behaviour). **This is a privacy change** (the current design stores no message text, `session/store.ts:5-8`): storing recent turns in memory is a decision for the owner, with a stated retention (30 min idle, cleared on restart, never written to disk or logs) and a short customer-facing notice. Long-term saved preferences (across sessions) are **not** designed here: they need consent, storage, deletion and an explicit decision. Customers' order data is never placed in history by tools for guests.

---

## 8. Model feasibility

### 8.1 What the evidence says (Doc unless marked)

| Item | Value | Source |
|---|---|---|
| Server | 6 vCPU, 12 GB RAM, CPU only, one inference slot, also serves live shoppers | audit; `queue/scheduler.ts` |
| Qwen3-1.7B (production) | ~5.1 tokens/s measured on the **old 2-vCPU** server; not re-measured on the 6-vCPU server | `models/registry.ts` |
| Prompt evaluation | "roughly 30 tokens per second on this CPU" (a developer note about the old server) | `english-planner.ts:48-51` |
| Qwen3.5-4B | 3.5 GB RAM, 4.4 to 6.8 tokens/s, tool-choice 54.3% (simplified harness, 70 messages), **median call 32 s** | `VOLTA_AI_MODEL_SELECTION_REPORT.md` |
| Gemma 4 E4B | 6.6 GB, 2.0 to 3.1 tokens/s, stopped after 3/70 by the safety limit | same |
| Qwen3.5-9B | 6.6 GB, 2.8 tokens/s, not completed | same |
| Sinhala/Singlish quality of any model for open conversation | **unmeasured**; only tool-choice by language for the 4B (46.7 / 52.9 / 61.9 / 52.9%) | same |
| Router-first vs Qwen alone (English tool choice) | 89/100 vs 65/100 | `models/registry.ts` |
| Deadline | 45 s default, 120 s max | `config.ts:169` |

### 8.2 Latency arithmetic (Estimate; inputs above; tokens/s for the 6-vCPU server are partly unmeasured)

A model turn = prompt processing + generation. With the stable prefix cached and ~550 new prompt tokens at the old ~30 tokens/s prompt rate (the 6-vCPU rate is unmeasured; it may be 2 to 3× faster) that is ~6 to 18 s; generating 100 tokens at 5 tokens/s is ~20 s; **a single-round general answer ≈ 25 to 40 s; a tool turn with router prefetch ≈ the same (one model call); a tool turn where the model must decide first ≈ 2× (a decide call of 30 to 60 tokens plus the answer) ≈ 40 to 80 s.** Against a 45 s deadline and one shared slot, this is unusable for chat without streaming and larger throughput; with streaming the first token appears after prompt processing (~6 to 18 s) and the rest streams at 5 tokens/s. Longer answers ("Explain Python") are proportionally worse; concise-by-default answer policy (≤ ~100 tokens, with an offer to expand) is a UX requirement on this hardware.

### 8.3 What an LLM-first design realistically needs (options)

Cost figures marked **Estimate** are my arithmetic on vendor prices read in the audit (re-verify before any decision); hardware prices are **not** quoted because I have no verified source.

| Option | Description | Latency (Estimate) | Capacity | Cost | Privacy / policy | Verdict |
|---|---|---|---|---|---|---|
| **A. Hybrid on current hardware** | Router prefetch + short model answers + streaming; 1.7B or 4B-class (Qwen3-4B-Instruct-2507 is already allow-listed); search only via provider | first token 6 to 18 s, answer 15 to 30 s for short answers | one conversation at a time; queueing for the rest | none beyond today | no policy change except history storage | Best first step to learn; **quality of 1.7B/4B for Sinhala and general answers is the open question** |
| **B. Bigger CPU host** (more cores/RAM, same stack) | e.g. a 16+ vCPU / 32+ GB host | generation is memory-bandwidth bound: gains uncertain (Estimate: 2 to 3×); prompt eval scales better | a few concurrent conversations | monthly host cost (unquoted) | none | Helps prompt time, not a guaranteed fix for generation |
| **C. GPU host** (self-hosted, one 24 GB-class GPU) | 8 to 14B instruct models (and 4B at far higher speed) | tens of tokens/s (Estimate) | several concurrent users | monthly GPU rental/purchase (unquoted) | stays in-house | Best quality/latency for self-hosting; needs a new server decision and ops |
| **D. Hosted model API** | a provider's Flash-class model for general/search turns | seconds | provider limits | Estimate: per turn ~2,500 input + 250 output tokens at the audit's quoted Flash-class price ($0.75 in / $3.75 out per 1M until 2026-12-31, then $1.50 / $7.50) ≈ $0.0028 per turn now, ≈ $0.0056 later; at the observed ~99 chat requests/day ≈ $0.3 to $0.6 per day; grounding ($14 per 1,000 searches after 5,000 free/month, **free-tier applicability unverified**) negligible at this volume | **customer text leaves the shop to a third party; the registry deliberately has no remote provider kind** (`models/types.ts`); needs the owner's explicit policy decision, a data-processing review and a key | Cheapest to run and fastest to quality, **largest policy change**; Sinhala quality unmeasured |
| **E. Split: local small model for hints/tool-planning + hosted or GPU model for general/search answers** | | local milliseconds-to-seconds for shopping with prefetch; remote for general | | mix of A and D/C | partial | Likely end state; keeps shopping facts and store data local |

**Decision criteria** to fix before choosing: p95 time to first token (suggest ≤ 5 s on a shopping turn, ≤ 8 s on a general turn) and full answer (≤ 20 s); native-reviewed Sinhala/Singlish quality threshold; 0 store-fact hallucinations on the DEV set; monthly cost ceiling; data residency/privacy tolerance for customer text; operational complexity the owner accepts; concurrency target (simultaneous shoppers).

### 8.4 Real-model benchmark plan (separate from deterministic tests)

*Models, identical scenarios, one at a time:* Qwen3-1.7B (baseline), Qwen3-4B-Instruct-2507, Qwen3.5-4B (thinking off), Gemma 4 E4B, Qwen3.5-9B; optionally a candidate hosted model on an owner-approved key and **synthetic, non-customer text only**.
*Scenarios:* the new LLM DEV set (section 9.3): Sinhala, Singlish, English, mixed, general knowledge, calculation, multi-turn, corrections, negations, instructions, tool calling, search-needed, store-fact questions with a fixture catalogue; plus 20 prompt-injection cases (product text, search snippets).
*Measured per model:* time to first token, total time, prompt and generated tokens, tokens/s, load and unload times, **peak RSS of the Ollama process (and swap)**, context-size sensitivity (2,048 / 4,096 / 8,192), tool-call validity (native vs `format` fallback), JSON-valid rate, deterministic assertion pass rates (9.3), hallucination of store facts, citation validity, language-match rate, history-use, correction/negation compliance, repetition, concurrency at 1/2/3 simultaneous requests and the queue behaviour.
*Where:* **never the live shopper server.** (1) A portable runtime on this Windows PC (15.7 GB RAM, E: has ~115 GB free, C: ~4.9 GB; models on E:; one model at a time; the 9B and Gemma leave little room beside an IDE and browser; timings are *not* the server's) for correctness and quality; (2) the prepared private staging Agent on the server in a quiet window, one model at a time (owner approval) or a separate benchmark host (option C/B) for speed and concurrency. Existing `tests/bench/bench-core.ts` already refuses to evict the live model, load models by accident, download, or run when RAM/load is unsafe; reuse it unchanged for any server run.
*Estimated effort:* 100 scenarios × ~2 turns × ~30 s ≈ 1.7 hours per model per pass on CPU (Estimate), so a four-model pass is a working day of machine time; native review of Sinhala outputs is separate, human, and cannot be skipped for any Sinhala claim.
*Reporting:* model-backed results are reported in their own document and tables, labelled with model, host, context, date; **never merged with** deterministic, fake-model, DEV-router or frozen-set numbers (the standing rule: no blended score).

---

## 9. Migration plan and test strategy

### 9.1 Phases (each independently shippable behind the flags; effort = Estimate)

| Phase | Work | Needs | Effort | Notes |
|---|---|---|---|---|
| **M0** | Wait for R0 to land; re-baseline the old pipeline (the "old" side of every comparison) | R0 done | 0 | R0 edits the files M3 to M6 touch |
| **M1 Foundations** (no behaviour change; can start now in new directories only: `src/llm/**`, `tests/llm/**`, `ollama/client.ts` streaming, `ModelProfile`) | LlmClient interface + fake/scripted models, context assembly, history/constraints in session (behind the flag), tool-call parser, `calculate`, answer-class types, metrics counters | none | 1 to 2 weeks | Nothing is reachable with the flag off |
| **M2 Verifier v2 + general lane** | claim extraction, grounding rules, repair loop, general/`calculate` lane, system-message states; the answer-class aware `compose` | M1, R0 merged | 1.5 to 2.5 weeks | Highest regression risk: old verifier tests stay green for `off` |
| **M3 Real-model benchmark** | DEV set, harness, isolated runs, report | M1, M2, owner approval for host/staging | 1 to 2 weeks + reviewers | Produces the model/host decision (8.3) |
| **M4 Router as hint + prefetch** | hints block, prefetch policy, lane fallback rules, scope-guard reinterpretation | M2, R0 | 1 week | Measures the latency win |
| **M5 Search lane** | adapters, fetcher, extraction, fences, citations, caps, `sources` in a *test* contract | M2, provider decision + key (approval) | 1.5 to 2 weeks | No live calls before approval |
| **M6 Contract 1.4 + website** | schema mirror, widget (citations, streaming, system states), compat shaping | M2, M5 | 1 week | Agent first, website second |
| **M7 Shadow (staging/replay only)** | compare old vs new on consented test messages | M3 to M6, staging approval | 1 week | Never on live traffic (9.4) |
| **M8 Canary** | `AGENT_LLM_FIRST=on` for a small sticky share, kill switch | owner approval, alerts in place, rollback rehearsed | 1 to 2 weeks watching | Production change: separate approval each step |
| **M9 Wider rollout / retire the old lane** | | M8 evidence | — | Only if the old lane is no longer needed as a fallback |

What must **wait for R0:** anything editing `router/**`, `reasoning/**`, `verify/verifier.ts`, `pipeline/**`, `session/**` (rows 5 to 10 of section 4). What can proceed now without conflict: new directories (`src/llm`, `src/search`, `tests/llm`), `ollama/client.ts` and `ollama/models.ts` (R0 does not touch them), `tools/definitions.ts` additions (new tools only), docs.

### 9.2 Tests by layer (kept apart, reported apart)

| Layer | Subject | Runs in `npm test`? | Evidence label |
|---|---|---|---|
| **L0 Unit** | context assembly, tool-call parser, `calculate` (property/fuzz tests), claim extractors, verifier v2 rules, SSRF fetcher, fences, history/constraints, contract 1.4 shaping | yes | Tested locally (deterministic) |
| **L1 Fake-model turn loop** | scripted models via the existing fake Ollama: tool rounds, repair loop, malformed JSON fallback, timeouts, budget exhaustion, streaming, verifier rejections and degradation paths, flag/fallback rules, lane stickiness | yes | Tested locally (**fake model**: proves the plumbing, says nothing about model quality) |
| **L2 Contract/route** | website mirror and routes with a fake Agent; Agent HTTP end to end with the fake model | yes | Tested locally (mock) |
| **L3 Real-model** | the DEV set against real models | **no**: separate script `npm run test:llm`, needs `OLLAMA_URL` and a model tag, refuses a live host unless told | Model-backed (own report, per model/host) |
| **L4 Staging E2E** | website + Agent + model on the private staging host | no | Isolated staging (after approval) |
| **L5 Regression guard** | existing 1,6xx tests; old DEV sets for the `off` lane; frozen M3-B/M4/M5 sets as a **guard only** (hash tests unchanged, never tuned on, never used to pick prompts) | yes (frozen guard) | Regression guard, not held-out evidence |

### 9.3 The LLM-specific DEV set and how it is judged (no fixed-sentence matching)

A new set `tests/bench/llm-dev/**`, author-written (not derived from frozen sets), 150+ scenarios including the ten acceptance examples, multi-turn conversations with corrections/negations/instructions, Singlish spelling variants and typos, mixed language, general knowledge, calculations, search-needed and not-needed, store-fact questions, injection cases. Each scenario states **assertions**, not reference sentences:

- **Deterministic assertions (primary, hard):** tool called / not called (e.g. calculator for "15% of 2400", `web_search` for "latest official Android update", none for "capital of France"); cards present/absent and exact verified values; excluded brand never in cards or text across later turns; every URL in text ∈ `sources`; every store number ∈ tool results ∪ user message ∪ calculator; reply contains/doesn't contain required facts (for example `360`, `Paris`) matched as patterns, not sentences; reply script matches the user's script/language policy; reply does not equal the previous assistant reply (repetition); correction turn does not repeat the previous recommendation; no generic-fallback phrase from the template list; sources list non-empty for search turns and empty for non-search turns; "searched" wording only with a search trace.
- **Rubric judge (secondary, screening):** relevance to the exact question, naturalness, directness ("answers the question first"), tone, with a fixed rubric and 1 to 5 scale. **Judge model:** the strongest locally runnable model on the isolated host (e.g. Qwen3.5-9B), a different model from the one under test where possible; limitations stated: self-preference bias within a family, weak Sinhala judgement, rubric drift. **Calibration:** ≥100 outputs labelled by humans (the owner; native speakers for Sinhala/Singlish) with agreement reported (e.g. Cohen's kappa); the judge may only rank, never certify. A judged score is never combined with deterministic pass rates.
- **Human review (required for any Sinhala/Singlish quality claim):** the outputs of every Sinhala/Singlish scenario go to native reviewers; until then Sinhala stays `needsNativeReview`.
- **Metrics reported separately:** understanding/relevance, instruction following, context retention, correction handling, negation compliance, tool selection success, search relevance, source grounding, store-fact accuracy, hallucination rate, language quality (human), latency (TTFT/total), failure recovery.

### 9.4 Old-versus-new pipeline comparison

Run the **same scenarios** through the old pipeline (`off`) and the new one on an isolated host; store per-scenario outputs and traces (test environment only); compare **per metric and per category** (shopping, general, correction, negation, Sinhala/Singlish/English/mixed), paired where possible, with latency distributions, token counts, rejection/repair rates and a failure taxonomy; list **regressions where the old pipeline was right** (especially price/stock/fit and exclusions) as release blockers. No blended accuracy figure. **Shadow mode on live traffic is not proposed:** it doubles load on the one inference slot, and recording old-vs-new text would break the "no message text is stored" privacy rule; production evidence instead comes from privacy-safe counters (reply source, answer class, rejection codes, repair rate, latency, tokens) during a sticky canary with a kill switch.

---

## 10. The ten acceptance examples, designed (what must be true; not fixed sentences)

| Message | Path | Must hold (deterministic assertions) |
|---|---|---|
| "What is the capital of France?" | `general`, no tools | reply states Paris; no cards; no generic fallback; no search (stable fact; the model may answer from knowledge) |
| "15% of 2400?" | `general` + `calculate` | tool trace has `calculate`; reply contains 360; the verifier recomputes and agrees |
| "Explain Python." | `general` | a direct explanation of the language (not a shopping menu); length within the answer policy; streams |
| "kohomada oyata?" | `general`, small talk, no tools | a greeting-style reply in the user's Singlish/Sinhala; no cards; not the same sentence as a previous turn; flagged `needsNativeReview` |
| "battery eka kohomada?" | model decides from SESSION FACTS | with a product discussed: `get_product_details` and the battery spec **from the tool result** or an honest "not listed"; with none: a clarifying question or a general battery answer, never a guess about a product |
| "Don't recommend Samsung." | session constraint | acknowledged naturally; constraint stored; every later search/recommendation (cards and text) excludes Samsung until withdrawn; server-side filter proven by a test that forces the model to ask for Samsung |
| "Show me more." | `search_products` with already-shown ids excluded | new product ids only; if no more, says so |
| "mama kiwwe eka nemei." | model sees history + correction state | the previous interpretation is dropped; the reply does not repeat the previous answer; it acts on the corrected meaning or asks one short question |
| "Find the latest official Android update." | `search` class: `web_search`/`lookup_documentation` | trace shows a search ran; ≥1 source from an official Android/Google domain; citations present; if no provider is configured or quota is exhausted: the honest `search_unavailable` message and **no invented version or link** |
| "Compare these two products." | `compare_products` for the two products from the last shown/discussed ids | verified comparison card; text consistent with the card; if "these two" is ambiguous (no two products in context) the model asks which |

---

## 11. Risks, security, observability, rollback

| Risk | Mitigation (in the design) |
|---|---|
| **Prompt injection via product text** (staff-entered descriptions), tool results, history | all tool/page/product text is fenced data; tool authorisation is server-side; no tool takes a URL from the model; cart changes are confirmed proposals; output scans for leak/secret/compliance; injection corpus in the DEV set |
| **Prompt injection via web pages** | fetched text fenced and capped; never selects tools or sources; instruction patterns counted and dropped; the answer cites, it does not obey |
| **Tool abuse / loops** | ≤3 rounds, ≤3 calls per round, time budget, per-tool caps, duplicate-call refusal, `financial` never |
| **Data exfiltration** (secrets, customer data, system prompt) | output `containsSensitive`; no customer/cart/order text in search queries; order data actor-bound; leak check independent of the prompt constant |
| **Hallucinated citations** | URLs only from server-built `sources`; `[n]` markers checked; "searched" requires a trace; lexical support heuristic; judged by deterministic assertions |
| **Hallucinated store facts** | claim extraction (5.2), cards verified independently, repair then honest message |
| **Cost abuse / denial of wallet** | per-identity and global daily search/token caps, kill switches, rate limits (existing), cheap deterministic prefilters, alerts at 50%/80% |
| **Latency collapse and slot starvation** (one slot, multi-call turns) | answer-length policy, prefetch, streaming, deadlines split, degrade rules count whole turns, canary with a kill switch, capacity measured in M3 before widening |
| **Sinhala quality** | `needsNativeReview` stays; native review gate; no "production Sinhala" claim |
| **History privacy** | memory only, bounded, no logs, no persistence; owner decision and customer notice |
| **Regression of verified shopping behaviour** | `off` lane identical; regressions where old was right are blockers; frozen guard; card verification unchanged |

**Observability (counts and durations only; no message text, audio, addresses or identities):** reply source and answer class counts; tool calls and failures by tool; tool rounds per turn; repair attempts and outcomes; verifier rejections by new code; prompt/generated tokens and tokens/s per model; time to first token and total; queue wait; degrade events; search calls, results, failures, estimated cost and cap usage; history size distribution; lane (`off/on`) and fallback counts. Alerts: model/queue health, rejection or repair rate above threshold, search failure/cost at 50%/80% of cap, p95 latency over target.

**Rollback:** the flag (`AGENT_LLM_FIRST=off`) returns every new conversation to today's pipeline instantly; in-flight conversations stay on their sticky lane until they end; contract 1.4 is additive so rolling the website back first (existing order) is safe; the search lane has its own kill switch and cap; no data migration exists to undo.

---

## 12. Decisions and approvals needed from the owner

| # | Decision | Needed before |
|---|---|---|
| 1 | Approve this architecture direction (router as hint/prefetch/fallback; templates only for system messages) | M1 |
| 2 | Conversation history in server memory (bounded, not logged): yes/no; customer notice wording | M1 |
| 3 | Model path: stay local (A), larger CPU host (B), GPU host (C), hosted API (D) or hybrid (E); **if D/E: explicit approval to send customer text to a third party and to add a hosted provider kind to the registry policy** | M3 |
| 4 | Approval and a host for the real-model benchmark: this PC (E: drive, one model at a time) and/or the private staging script on the server in a quiet window, and/or a separate benchmark host | M3 |
| 5 | Search provider shape (A retrieval vs B grounded generation), account, API key, budgets/caps, and a privacy statement for outbound queries | M5 |
| 6 | Whether customers need code execution at all; if yes, an isolated sandbox host and an independent review (otherwise `run_code` stays disabled; `calculate` covers arithmetic) | later |
| 7 | Native Sinhala/Singlish reviewers for the quality gate (people) | M3/M8 |
| 8 | Whether model-driven browsing is wanted at all in the first release (it stays off until the browser review/isolation items are done) | last |
| 9 | Latency/quality/cost acceptance criteria (8.3 suggested values) | M3 |
| 10 | Canary scope, kill-switch ownership and alerting (production changes: a separate approval per step; no deployment, restart, env or tunnel change is made by this plan) | M8 |

---

## 13. What I could not verify (and assumptions)

- **All model behaviour:** no model ran for this design. Latency, quality, tool-call reliability, Sinhala/Singlish ability of every candidate model and the effect of 4,096/8,192 contexts on RAM are **Unverified**; section 8.2 is arithmetic on old-server figures.
- The 6-vCPU server's prompt-evaluation rate and the 1.7B's speed on it are not measured (registry figures for 1.7B are from the old 2-vCPU server).
- Provider terms (Gemini grounding display/caching/logging, free-tier applicability; Brave storage) were read from vendor pages in the audit and are not re-verified; prices change (the Flash-class price is quoted for the period to 2026-12-31 only).
- Hardware prices for options B/C are not quoted (no verified source).
- Token budget tables are estimates; Sinhala tokenisation cost is not measured.
- The effort sizes are engineering estimates, not commitments.
- The exact edits R0 is making were not reviewed (they are in progress); the file-ownership notes assume R0 finishes before M2.
- Real-shopper accuracy of any layer is unknown (the live catalogue is 7 placeholder products; the DEV sets are author-written).
- This design does not decide long-term cross-session memory, owner-policy records (the audit's R5), or voice interplay beyond noting that voice transcripts enter the same text path.

*Design only. Nothing implemented. Awaiting the owner's decisions in section 12.*
