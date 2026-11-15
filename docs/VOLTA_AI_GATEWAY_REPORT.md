# VOLTA AI gateway report (Gemini provider, budget controller, resilience)

Date: 2026-11-15. Written for: the project owner and the engineer who will wire the gateway into the Agent. **Local implementation only.** The gateway is not connected to anything: no Agent code calls it, Gemini is disabled by default, **no real call to any Google API was made**, no key was requested, used or stored, and nothing was committed, pushed or deployed. Status labels: **Implemented, Tested locally (fake provider), Not integrated, UNVERIFIED (against the live service), Pending approval.**

## 1. Architecture

```
caller (future turn loop)                         src/gateway/
  |  GatewayRequest {class, system, messages, tools, caps}
  v
gateway.ts  createGateway()   status gate (disabled | not_configured | misconfigured | ready)
  |   -> validate request (size, roles, tool count)  -> per-session + global rate limit
  |   -> circuit breaker allow()  -> budget directives (downgrade model, shorten history, no voice/search)
  |   -> model selection by class (GEMINI_MODEL | GEMINI_FAST_MODEL | GEMINI_VOICE_MODEL)
  |   -> concurrency slot (bounded queue)
  |   -> withRetry { reserve -> provider.generate (timeout) -> settle | release | charge }
  v
provider.ts  ModelProvider interface  <-  FakeModelProvider (tests)   <-  gemini-provider.ts GeminiProvider (injected fetch)
budget.ts    BudgetController  <-  budget-store.ts MemoryBudgetStore | FileBudgetStore (atomic, fails closed)
prices.ts    price table (seed, NOT verified), cost math, token estimates
config.ts    loadGatewayConfig(env) -> status + typed config      secret.ts  Secret wrapper + redaction
errors.ts    taxonomy + fixed user messages (EN/Si, native review flag)      schema.ts  tool-schema conversion
resilience.ts withRetry, CircuitBreaker, ConcurrencyLimiter, SlidingWindowLimiter, timeoutSignal
factory.ts   buildGateway(env, opts): reads no file and opens no connection unless the status is "ready"
```

Guarantees (each has tests): the provider is **never** called unless the status is `ready`; a failure is never reported as a success (`ok:false`, `degraded:true`, a fixed user-safe message, never provider text); no secret, message text, tool argument or address reaches a log, metric, error or status output; spend is reserved before and settled after every call; an unreadable or unwritable ledger refuses every call (fail closed).

## 2. Environment configuration

Placeholders only, added to `apps/agent/.env.example` (a test asserts it holds no credential). In production the key comes from the host's root-owned environment file or a secret manager.

| Variable | Meaning | Default |
|---|---|---|
| `GEMINI_ENABLED` | master switch; only the word `true` enables | `false` |
| `GEMINI_API_KEY` | the credential (server side only) | none |
| `GEMINI_MODEL`, `GEMINI_FAST_MODEL`, `GEMINI_VOICE_MODEL` | model identifiers (configuration, never code); fast and voice fall back to the main model | none (main model required) |
| `GEMINI_API_BASE_URL` | https and a `googleapis.com` host unless `GEMINI_ALLOW_CUSTOM_API_HOST=true`; no credentials, IP literal or odd port | Google's default host |
| `GEMINI_MAX_INPUT_TOKENS` / `_OUTPUT_` / `_THINKING_` | per-request caps (the gateway clamps callers to these) | 12000 / 800 / 0 |
| `GEMINI_ALLOW_UNVERIFIED_PRICES` | paid calls are refused while a model's price is not marked verified, unless true | `false` |
| `GATEWAY_BUDGET_MONTHLY_LKR`, `_SOFT_`, `_HARD_`, `_RESERVE_`, `_DAILY_` | budget (rules: soft <= hard, hard + reserve <= monthly) | 3000 / 2400 / 2700 / 300 / daily cap 300 |
| `GATEWAY_LKR_PER_USD` | **UNOFFICIAL** rate (from a garbled central-bank PDF dated 2026-11-09); a person must confirm it | 337.05 |
| `GATEWAY_BUDGET_VOICE_SHARE`, `_SEARCH_SHARE` | category shares of the hard limit inside the one shared budget | 0.15 / 0.10 |
| `GATEWAY_BUDGET_TZ` | day/month boundary: `UTC` or `Asia/Colombo` (+05:30) | `UTC` |
| `GATEWAY_BUDGET_STORE_PATH` | ledger file (so a restart never resets spend); unset means memory only | memory |
| `GATEWAY_PRICE_TABLE_PATH` | reviewed price table JSON replacing the seed | seed |
| `GATEWAY_REQUEST_TIMEOUT_MS`, `_MAX_ATTEMPTS`, `_BACKOFF_BASE_MS`, `_BACKOFF_MAX_MS`, `_BREAKER_FAILURES`, `_BREAKER_COOLDOWN_MS`, `_MAX_CONCURRENT`, `_MAX_QUEUE`, `_RATE_SESSION_PER_MIN`, `_RATE_GLOBAL_PER_MIN`, `_RESERVATION_TIMEOUT_MS` | resilience and limits | 30000, 3, 500, 8000, 5, 30000, 4, 16, 20, 120, 120000 |

Status is a discriminated union: `disabled`, `not_configured` (missing variable names), `misconfigured` (rule messages naming variables, never values), `ready`. `describeStatus()` reports which variables are set (booleans) and never a value.

## 3. Secret management

Allowed: a server environment file (root-owned, mode 600) or an approved secret manager. **Never** in Git, frontend environment variables, a database, browser storage, logs, documentation, reports or test fixtures (tests use the obviously fake `FAKE_TEST_KEY_not_a_secret_...`). The key is wrapped in `Secret` (string, JSON, template, `inspect` and spread all print `[redacted]`), reaches the network only in the `x-goog-api-key` header, and `redactSecrets` scrubs known values plus anything shaped like a Google credential from error bodies before they are parsed. Use separate keys for development, staging and production. **A key was pasted into the chat earlier in this project: it must be revoked and replaced; this work never used it.** Rotation: create the new key, update the environment file, restart the service, revoke the old key, check the provider console for use of the old key.

## 4. Gemini wire format: what was verified and what was not

Sources (Google's documentation, read through a summarising fetch tool on 2026-11-14 and 2026-11-15; a person should re-read them): https://aistudio.google.com/api-reference/generate-content (the old `ai.google.dev` address answers 301 to this), https://aistudio.google.com/docs/quickstart, /docs/function-calling, /docs/text-generation, /api-reference/interactions, /docs/thought-signatures.

**Verified (as reported):** `POST /v1beta/models/{model}:generateContent` and `:streamGenerateContent` exist; Content has `role` (`user` or `model`) and `parts` with `text`, `inlineData`, `functionCall {name, id, args}`, `functionResponse {name, response, id, parts}`; tools have `functionDeclarations[]` with `parametersJsonSchema`; `generationConfig` names `maxOutputTokens`, `temperature`, `topP`, `topK`, `seed`, `responseMimeType`, `thinkingConfig {thinkingBudget, thinkingLevel, includeThoughts}`; response `candidates[].content.parts`, `finishReason` values, `promptFeedback.blockReason`, `usageMetadata {promptTokenCount, cachedContentTokenCount, candidatesTokenCount, toolUsePromptTokenCount, thoughtsTokenCount, totalTokenCount}`, `modelVersion`; auth header `x-goog-api-key` and host `generativelanguage.googleapis.com` (from the Interactions quickstart).

**UNVERIFIED (marked in code comments):** the generateContent REQUEST body page (not reached); `toolConfig.functionCallingConfig` and its mode values; the role for function-result turns (the adapter uses `user`); `thoughtSignature` handling (the adapter replays the raw model part untouched via `ToolCall.providerData`, the safe choice); `?alt=sse` for generateContent (verified only for the Interactions endpoint); whether `candidatesTokenCount` already includes thinking tokens (the adapter sums them, which can only over-estimate cost); the case of `thinkingLevel`.

**Important:** the current docs present the **Interactions API** (`POST /v1beta/interactions`, header `Api-Revision`, `generation_config.max_output_tokens`, `thinking_level`, steps, `function_result`) as the primary interface, and do not say whether generateContent is deprecated. The gateway's `ModelProvider` interface isolates this: an Interactions adapter can be added without touching the gateway. **The hand-written fixtures in the tests prove the adapter matches the documented shapes, not that Google's live service accepts the requests. Only one approved, capped test call can show that.**

## 5. Model selection

No model is chosen. Names are configuration; the seed price table lists the candidates found by the research (cheap chat class, a larger class, transcription, text-to-speech, live) with their prices and the scheduled changes (two models reroute on 2026-12-01, one shuts down on 2027-05-07, two prices double on 2027-01-01). The price lookup uses the dearer of "now" and "the next 35 days" for reservations, so a scheduled rise is never under-reserved. Verify names, availability and prices against Google's current pages at deployment time.

## 6. Token and cost controls

* Caps: input estimate (pessimistic; Sinhala counts one token per character because its real ratio is unknown), output and thinking caps, clamped by the gateway.
* Reserve before, settle after: the estimate is the worst case (all input at the dearer price plus the full output and thinking allowance). `reserve` is atomic: a test runs 1,000 concurrent reservations of LKR 5 against the LKR 2,700 hard limit and the total never exceeds it (at most 540 succeed).
* Settlement uses real `usageMetadata` (input, cached, output, thinking, tool-use, audio seconds). **Unknown usage (no metadata, a dropped stream, a timeout) is charged at the reserved estimate.** A clean 4xx/5xx response (not billed) releases the reservation. An abandoned reservation is swept after a timeout and counted as spent.
* Limits: soft (LKR 2,400) turns on directives (downgrade model, shorten history to the last 6 messages, disable search, disable voice); a daily soft rule (spend today above twice the average daily allowance left in the soft budget) triggers the same directives; the daily cap and the hard limit (LKR 2,700) refuse; the LKR 300 reserve is never spendable by normal traffic; voice and search have shares of the one shared hard limit.
* Persistence: a `BudgetStore` interface; `FileBudgetStore` writes a temp file and renames it; a missing file is a fresh ledger, a corrupt or unwritable ledger makes every reservation fail closed (`ledger_unavailable`) and never resets spend; a restart keeps spend.
* Reconciliation: `reconcile({providerReportedUsd, apply})` records drift against the figure typed in from the provider's console or billing export, flags drift above a threshold (default 10%) and can apply a correcting offset.
* Alerts: callbacks at 50/80/100% of the soft limit and 80/100% of the hard limit, once each per month, carrying a level, a month and a number only.
* **Stated plainly: application-side enforcement cannot guarantee exact provider billing.** Prices and tokenisation can change, thinking and tool-use tokens are known only after a call, usage metadata may differ from the bill, exchange rate, card fees and tax are outside the ledger, and the provider's bill lags up to a day. Provider-side controls found in the research (a prepaid balance that returns HTTP 402 at zero, tier caps, an experimental project spend cap with about 10 minutes of lag) and `reconcile()` exist for that reason.

## 6a. Privacy of the one file that writes to disk

The Agent's existing invariant (a test in `tests/integration/m1e-reliability.test.ts`) is that it writes nothing to disk: no messages, sessions, counters or logs. The budget ledger legitimately needs persistent counters, so the invariant was **narrowed, not weakened**: the scan still covers every source file except one named file, `src/gateway/budget-store.ts`, with a comment explaining why. That file stores **numbers and fixed fields only** (micro-USD counters per day and month, reservation ids, model names, timestamps, alert level names). A test runs real traffic containing message text, a session id and an address-like string and asserts that none appears in the file and that every string value matches a fixed pattern. If you prefer no disk write at all, use `MemoryBudgetStore` and accept that a restart resets spend (not recommended).

## 7. Files

New under `apps/agent/src/gateway/`: `secret.ts`, `errors.ts`, `config.ts`, `provider.ts`, `prices.ts`, `schema.ts`, `budget-store.ts`, `budget.ts`, `resilience.ts`, `gemini-provider.ts`, `gateway.ts`, `factory.ts`, `index.ts`. New tests under `apps/agent/tests/unit/`: `gateway-helpers.ts`, `gateway-config.test.ts`, `gateway-gemini-adapter.test.ts`, `gateway-schema.test.ts`, `gateway-resilience.test.ts`, `gateway-budget.test.ts`, `gateway-facade.test.ts`. Changed: `apps/agent/.env.example` (additive, placeholders), `apps/agent/tests/integration/m1e-reliability.test.ts` (the narrow allow-list above). Not touched: `src/config.ts`, `src/http`, `src/pipeline`, `src/router`, `src/reasoning`, `src/verify`, `src/tools`, `src/search`, `src/llm`, `src/voice`, `apps/web`, `tools/`, any frozen benchmark.

## 8. Tests and results

Executed 2026-11-15 on the working tree: the six gateway test files give **236 passed, 0 failed** (config 42, Gemini adapter plus schema 76, resilience plus budget 86 including the numeric-only ledger test, facade 32). `npx tsc --noEmit` in `apps/agent` reports **0 errors**. The existing `tests/integration/m1e-reliability.test.ts` passes with its narrowed allow-list. The full Agent suite on the same tree reported **2,499 passed, 4 failed, 6 skipped (105 files)**; the 4 failures are all in files this work did not create or touch: three in `tests/unit/search-extract-injection.test.ts` (HTML-extractor entity decoding, a ReDoS timing bound, the fence id) and one in `tests/unit/zz-perf-tmp.test.ts` (a temporary timing file), i.e. unfinished work in `src/search`, which another agent owns. Every gateway test installs a guard that makes the global `fetch` throw, and fails if it was called. The provider is always a fake, or the real adapter over an injected fake `fetch`. **Nothing here tests Gemini's behaviour, quality, latency or Sinhala handling.**

## 9. Security review of the gateway (own review; an independent review has not been done)

| Area | Finding |
|---|---|
| Key exposure | Wrapped, redacted everywhere tested (results, events, errors, logs, metrics, status, config JSON, `inspect`). Header only. The key shape scrubber is a backstop, not the control. |
| SSRF / host | Base URL: https, Google host by default, no credentials, no IP literal, no odd port, no query; a custom host needs an explicit flag and still obeys the rest. Redirects are refused (`redirect: "error"`). Model ids are validated before they enter a URL path. |
| Provider text | Never forwarded: errors carry fixed codes; user messages are fixed text (Sinhala needs native review). Provider output is untrusted data for the caller. |
| Denial of wallet | Per-session and global rate limits, concurrency slot with a bounded queue, per-request caps, reservation before every call, daily cap, category shares, stream overrun cut-off. Shared single-instance limits: a multi-instance deployment needs a shared store for rate limits and a shared ledger. |
| Replay of billed work | Retries are budgeted (each attempt reserves again); unknown outcomes are charged. |
| Ledger integrity | Fail closed on corruption; a human must repair or move the file. Anyone who can edit the file can edit the budget: protect it with file permissions (written with mode 600). Single writer assumed (one process). |
| Prompt injection | Out of scope here: this layer moves text; fencing and the verifier are the caller's job (see the verifier v2 and tool layer work). |
| Not covered | No authentication of callers (the Agent's HMAC layer sits above); no content moderation; no per-customer quota; no cross-process locking of the ledger file. |

## 10. Real versus fake, unverified, remaining work

**Real:** the code and its behaviour under the fake provider and fake fetch (retries, breaker, limits, budget arithmetic, redaction, persistence, SSE parsing, schema conversion). **Fake:** every provider response. **UNVERIFIED:** acceptance by Google's live API (request shapes, tool config, role for tool results, SSE for generateContent, thought signatures), usage field semantics, price numbers (seed marked unverified; refused for paid calls unless a person verifies or the flag is set), the exchange rate, Sinhala token cost, latency, quotas and rate limits per model. **Remaining:** an Interactions API adapter if the owner prefers it; one approved, capped real call to validate shapes and usage fields; verifying and loading the price table; a shared store for multi-instance rate limits; wiring into the Agent behind the off/shadow/on switch (not done); the privacy and billing approvals described in the architecture document.
