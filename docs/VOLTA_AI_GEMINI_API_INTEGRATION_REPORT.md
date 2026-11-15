# VOLTA AI 2.0: Gemini API integration report (implementation preparation, local only)

Date: 2026-11-15. Written for: the project owner. **Scope of this phase: implementation preparation and local testing only.** Nothing was committed, pushed, merged or deployed; no production server, DNS record, tunnel, firewall, environment variable, model or VPS was touched; **no Gemini API call was ever made and no API key was used** (a key pasted in chat earlier was never used, is not in any repository file (scanned: 0 files), and must be revoked). Every Gemini path below runs against a **fake provider**. Companion documents: `VOLTA_AI_GEMINI_CLOUD_ARCHITECTURE_AND_MIGRATION.md` (decisions, budget model), `VOLTA_AI_GATEWAY_REPORT.md`, `VOLTA_AI_VERIFIER_V2_REPORT.md`, `VOLTA_AI_TOOLS_AND_SEARCH_REPORT.md`, `VOLTA_AI_OLLAMA_VPS_REMOVAL_PLAN.md`, `VOLTA_AI_SESSION_RECOVERY.md`, `VOLTA_AI_TASK_PROGRESS.md`.

## 1. Verdict in one paragraph

The **software scaffolding for a Gemini-powered, LLM-first assistant is built and passes its tests**: a gateway with a budget controller, a verifier that checks free-form answers against the shop's own data, a safe tool layer, a search layer (disabled), a conversation turn loop, and an `off | shadow | on` switch. **None of it has ever talked to Gemini**, so nothing proves that Gemini understands Sinhala/Singlish, answers well, stays inside the budget in practice, or that the request shapes are accepted by Google. The new lane is **OFF by default** and, even switched on, **cannot serve customers** until contract 1.4 gives model text an honest `source`. **Not production-ready; not enabled; blocked on owner decisions and real-API validation** (section 11).

## 2. Gemini API architecture (built)

```
customer message
   -> existing HTTP layer (HMAC, rate limits, pre-auth reads)           [unchanged]
   -> pipeline chosen by AGENT_LLM_FIRST  (src/llm/factory.ts)
        off    : the legacy pipeline object itself                       [default; byte-identical behaviour]
        shadow : legacy answers the customer (not delayed); then the new lane runs in the background and only COUNTS
        on     : new lane answers; falls back to legacy when it degrades; FAIL-CLOSED today (no truthful reply source yet)
   new lane (src/llm/turn.ts):
        original message (verbatim) + bounded history + prompt (language, honorific rule, exclusions, tools offered / unavailable)
          -> Gateway.generate()  (src/gateway: config/status, rate limits, budget reserve->call->settle, retries, circuit breaker, redaction)
               -> ModelProvider  (GeminiProvider over fetch: DISABLED unless configured; FakeModelProvider in tests)
          -> tool calls -> LlmToolExecutor (schema validation, authorisation, per-turn limits, timeouts, fenced untrusted results)
               -> existing shop tool registry (catalogue/price/stock = the authority), calculator, research tools (disabled)
          -> final text -> verifier v2 (claims grounded in THIS turn's tool evidence, citations, exclusions, honorific policy, safety classes)
          -> repair: autofix -> regenerate once with verified facts -> redact failing sentences -> honest notice (never a shopping template)
```
Deterministic and NOT model-driven: HMAC identity, rate limits, tool authorisation, the shop backend as the only source of price/stock/specs, confirmations, the budget hard limit. Model-driven: understanding, tool choice, wording.

## 3. Environment configuration

Documented with empty placeholders in `apps/agent/.env.example` (no real value anywhere).

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_ENABLED` | `false` | master switch; anything but exactly `true` is off |
| `GEMINI_API_KEY` | empty | secret; server-side only (section 4) |
| `GEMINI_MODEL`, `GEMINI_FAST_MODEL`, `GEMINI_VOICE_MODEL` | empty | model ids are configuration (names and prices change on a schedule) |
| `GEMINI_API_BASE_URL` | Google host | https and `*.googleapis.com` unless `GEMINI_ALLOW_CUSTOM_API_HOST=true` |
| `GEMINI_MAX_INPUT_TOKENS` / `_OUTPUT_TOKENS` / `_THINKING_TOKENS` | 12000 / 800 / 0 | per-request caps (thinking tokens bill like output: keep 0 until measured) |
| `GEMINI_ALLOW_UNVERIFIED_PRICES` | unset | the shipped price table is `verified:false`: paid calls are refused until a person replaces it from a reviewed file (`GATEWAY_PRICE_TABLE_PATH`) or sets this |
| `GATEWAY_BUDGET_MONTHLY_LKR` / `_SOFT_` / `_HARD_` / `_RESERVE_LKR` | 3000 / 2400 / 2700 / 300 | the owner's budget |
| `GATEWAY_LKR_PER_USD` | 337.05 | **unofficial** exchange rate: confirm before use |
| `GATEWAY_BUDGET_STORE_PATH` | unset (memory) | ledger file so a restart cannot reset spend |
| `AGENT_LLM_FIRST` | `off` | `off` / `shadow` / `on` (invalid value stops the start, naming the variable, never the value) |
| `AGENT_LLM_HISTORY` / `_HISTORY_TURNS` | `off` / 6 | in-memory history for the model (RAM only, TTL 30 min, LRU 5,000 conversations, per-conversation key) |
| `AGENT_LLM_SHADOW_SAMPLE` | 1 | share of conversations the shadow lane tries |
| `AGENT_LLM_LEGACY_SOURCE_LABEL` | unset | **test-only shim**, mislabels model text as the existing `qwen` source: never for customers |

Status is typed: `disabled` / `not_configured` / `misconfigured` / `ready`; `describeStatus()` reports names and booleans only.

## 4. Secret management

The key is read only from the environment object passed in (the gateway never touches `process.env`), wrapped in a `Secret` whose `toString`/`toJSON`/`inspect` print `[redacted]`, with **one** `reveal()` call site (the `x-goog-api-key` request header). Never in a URL, body, log, error, metric, status output or test snapshot (tests plant a fake key and grep every output). Never in Git, the frontend, a database, localStorage, docs or fixtures. Separate development/staging/production keys; rotation guidance: any key pasted anywhere is revoked and replaced. **The key pasted in chat on 2026-11-14 must be revoked** (it is also saved as an image under this session's temporary folder).

## 5. Model selection

Not made. Names are configuration; the research (docs section 6 of the architecture document) lists candidates with their announced reroute/shutdown dates; pricing and model availability must be re-read from the official pages at deploy time (the research read summarised pages). Roles: fast/cheap chat, reasoning, transcription, speech output, live voice. **No quality, latency or Sinhala evidence exists.**

## 6. Token and cost controls (built, fake-provider tested)

Per-request input/output/thinking caps; **concurrency-safe reservation before every call** (1,000-concurrent test: the hard limit is never exceeded), settlement from `usageMetadata`, unknown usage charged at the reserved estimate, retries charged, release on failure; soft limit directives (`downgrade_model`, `shorten_history`, `disable_search`, `disable_voice`), hard limit = honest unavailable; text/voice/search in ONE budget; daily and monthly windows; ledger persisted atomically and **fails closed** if corrupt; reconciliation function (drift against the Google console figure); alerts at 50/80/100%. **Application-side enforcement cannot guarantee exact Google billing**: Google's own caps are weak (experimental spend caps with ~10 minutes of latency; prepaid balance is the only real hard stop; the minimum prepay is already ~62% of the LKR 2,700 limit), so reconciliation and provider-side controls are required.

## 7. Business integration status

| Capability | State |
|---|---|
| Product search, details, price/stock, specs | tools adapt the EXISTING shop registry (authority); tested on the invented fixture catalogue; **the real catalogue has 7 placeholder-quality products** |
| Comparison, categories, accessories | comparison/accessory via existing tools only; no category listing route (gap) |
| Cart | **no server cart**: only a PROPOSAL tool (disabled by default) that the browser applies after the shopper confirms; no add/remove/update API exists |
| Order tracking/history/status | **disabled stubs**; no backend route; privacy approval pending (guests never get order data) |
| Warranty/returns/delivery | page text only, starter content: owner must confirm it is real before an AI quotes it |
| Browser control | local only, blocked (see browser reports); not part of this lane |
| Web search / documentation retrieval | **provider interface + disabled adapter skeletons** (Brave, Gemini grounding): no key, no call; SSRF-safe fetcher and injection fencing built and tested against loopback fixtures |
| Voice (STT/TTS) | existing routes with local-engine interface; Gemini speech = **inert placeholders** (request shapes unverified, budget-by-seconds adapter not built); Sinhala/Singlish **unevaluated, blocked on native recordings** |

## 8. Files (this phase; all uncommitted)

New source: `apps/agent/src/gateway/` (13 files, 2,426 lines), `src/verify/v2/` (13, 1,765), `src/tools/llm/` (9, 1,490), `src/search/` (11, 1,097), `src/llm/` (7, 795), `src/voice/gemini.ts`. Changed: `src/main.ts` (switch wiring, 3 edits; unset = no change), `apps/agent/.env.example` (additive placeholders), `tests/integration/m1e-reliability.test.ts` (one narrow, documented allow-list entry for the budget ledger file). New tests: `tests/unit/gateway-*` (+helpers), `verify-v2-*`, `tools-llm-*`, `search-*`, `llm-basics`, `llm-turn`, `llm-lane`, `voice-gemini-placeholder`, `tests/integration/llm-main-wiring`. Also restored: `src/voice/audio.ts` (see recovery document). Docs: this report, the gateway/verifier/tools reports, the removal plan, recovery and progress files.

## 9. Test results (all executed 2026-11-15; separated by evidence type)

**Passed (automated, no network):**
- Agent full suite: **2,736 passed, 0 failed, 6 skipped** (114 files); `tsc --noEmit` clean. Website: **515 passed** (38 files), `tsc` clean.
- By module (run separately): gateway **236** (config matrix, redaction, schema conversion, resilience, breaker, budget races, persistence, facade); verifier v2 **176** (grounding, citations, safety classes, honorific policy, fuzz, 44-answer old-vs-new comparison); tool layer **196** (calculator, executor against 25+ malformed model outputs, adapters over the real registry); search layer **181** (SSRF cases incl. DNS rebinding with a pinned IP, redirects, size/content-type caps, injection fencing, quota); LLM lane **57** (config 4, history 8, prompt 10, turn loop 22, lane/switch/factory 13); Gemini speech placeholders **4**; entry wiring **5**; the disk-write privacy invariant passes with one explicit exception.
- Acceptance-style turn tests (scripted model): a general question needs no tool; "15% of 2400?" goes through the calculator; a shop price is accepted only when it matches the tool result; an invented price is repaired by regeneration or degraded, never delivered; an excluded brand is not recommended; a claimed search that never ran is not delivered; unrequested "Sir/Madam" is removed; the customer's message reaches the model byte-for-byte (Sinhala included); a correction is sent verbatim with prior turns; model unavailable, safety block, empty answer, expired deadline, model-call cap: all become honest notices, never a canned shopping reply.
- Guards: frozen benchmark files unmodified (`git status tests/bench` shows only the new `m8-intelligence`, `r0-local-rules` directories); no zero-byte files; no stray control characters in new code; 0 repository files contain the pasted key.

**Failed:** none in the final run. Defects found and fixed during this phase: a truncated `src/voice/audio.ts` (restored, cause unknown); regex corruption (`\b` -> backspace) in `src/verify/v2/safety.ts` (fixed); a request array shared by reference in the turn loop (fixed: a copy is sent); tests with wrong expectations (corrected, listed in the session notes).

**Not tested / untested:** any real Gemini request or response; Sinhala, Singlish or English quality of any Google model; function-calling behaviour of Gemini; latency, token usage and real cost per turn; the budget against Google billing; streaming against the real API; request shapes of the "Interactions"/generateContent endpoints (hand-written from documentation; some fields marked UNVERIFIED in code); real search providers; Gemini speech; the browser path with this lane; real shoppers; load/concurrency against a real provider; the real-browser suite and the contract 1.3 browser e2e were not re-run in this segment.

## 10. Mock-only functionality (everything model-related)

The `FakeModelProvider` scripts every model answer; the verifier, tool executor and loop are real code but only ever see scripted model output. The search layer talks to a fake provider and loopback fixtures. The catalogue is the invented fixture. Shadow/`on` behaviour is tested with fake runners and a scripted gateway. **No test shows how a real model behaves.**

## 11. Features requiring real Gemini API testing (need an approved key, a capped test budget and no customer data)

1. Do the hand-written request/response shapes work (generateContent vs Interactions, tool config names, function-result role, thought signatures, streaming parameter)?
2. Understanding and answer quality in Sinhala, Singlish, English, mixed; corrections, negations, references.
3. Function-calling reliability and tool choice; how many model calls a typical turn really needs; thinking-token behaviour.
4. Latency distribution and cost per conversation type (the budget model assumes numbers that are unmeasured; a 3x Sinhala token ratio would cut headroom below observed volume).
5. Verifier v2 false-positive/negative rates on REAL model output (it is only checked on scripted answers).
6. Search grounding, citation display terms, and Gemini speech (separate approvals).
7. Budget reconciliation against the real billing console.

## 12. Security review (self-review by the orchestrator; NOT an independent review)

Held up in tests: key confined to one header and never printed; gateway disabled by default and unreachable with an empty environment; no outbound call with Gemini off in any mode (entry-point tests); shadow records counts only (a test searches the statistics for the message, session id, address and answer text and finds none); tool results fenced as data; research tools not offered unless a provider and quota exist (the model is told which are unavailable); identity never comes from model-supplied arguments; payment, order placement and cart changes are never performed by the model (cart = proposal); original message preserved; history per-conversation, RAM only, off by default; verifier keeps secret/PII/injection/payment-claim classes and adds grounding. **Open risks:** (a) **shadow mode sends the customer's text to Google**, so it needs the privacy approval, DPA review and customer notice before any real use; (b) the verifier's grounding is heuristic for free text (it cannot catch every claim type; limits in its report); (c) `on` would mislabel the reply source until contract 1.4; (d) the budget ledger is a local file: single-instance only (a multi-instance gateway needs a shared store); (e) **no independent security review** of the new modules has been done; (f) earlier production findings still apply (client-IP trust and port 8090 unproven, shared guest counter live, no alerting); (g) truncation of an untracked source file happened during this phase: commit the work.

## 13. Remaining dependencies and blockers

Owner decisions (architecture document, section 22): gateway placement, privacy approval + customer notice + legal review, billing account (owner, currency, prepay), budget numbers, model choice after live re-verification, search provider and key, browser host, voice scope, native Sinhala reviewers, old-server fate. Engineering: contract 1.4 (`source` for model text, optional citations) and website schema mirror; connect the lane's context hook to the legacy session state (exclusions, honorific preference, standing preferences) and map cards/proposals into the lane's output; budget ledger store for multi-instance; Interactions-API adapter if needed; Gemini speech adapters behind the budget; independent security review; real-API test campaign. Data: the real catalogue (7 placeholder products) and confirmed policy text.

## 14. Production migration requirements (nothing below is authorised)

Commit and review the work; close the earlier production security items (Step A/B, port 8090, preview logging, credential rotation); approvals in section 13; verify prices and models live; a capped real-API test campaign; shadow on test traffic only; gradual cutover gated on turn counts and days (1% of ~99 chats/day is meaningless); rollback drill (website first, then Agent); then the removal plan (`VOLTA_AI_OLLAMA_VPS_REMOVAL_PLAN.md`: stop before delete, one change at a time, zero-dependency soak). **Do not enable `AGENT_LLM_FIRST`, `GEMINI_ENABLED` or any key in production without the owner's explicit approval.**
