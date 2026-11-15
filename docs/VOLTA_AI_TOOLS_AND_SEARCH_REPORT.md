# Tools and web-research layer for the LLM-first lane

Date: 2026-11-15. Status: **Implemented. Tested locally with fake providers and a loopback fixture server. NOT wired into the pipeline. No real search provider, key, account or paid call exists or was used.** The earlier stopped work (about 3,900 lines across three modules) was reviewed, completed, corrected and tested in this round.

## 1. What exists

| Module | Path | Role |
|---|---|---|
| Tool definitions and executor | `apps/agent/src/tools/llm/` | Provider-neutral tool declarations, tolerant parsing of small-model calls, authorisation, per-turn limits, honest failures, fencing of untrusted text, evidence |
| Evidence adapter | `src/tools/llm/verifier-evidence.ts` | Converts tool evidence into the shape verifier v2 checks against (the two shapes are **not** the same; see the verifier report) |
| Search layer | `apps/agent/src/search/` | Provider interface, a fake provider, disabled provider skeletons, the SSRF-safe page fetcher, the HTML extractor, injection detection and neutralising, query redaction, quota accounting, cache, citations |

## 2. Tools

Every tool has a name, a short description written for a small model, a strict input schema (unknown keys are dropped and counted, wrong types are refused), an authorisation class, a timeout, a result-size cap, a failure result with a stable code, and an audit record of **counts and names only** (never a query, an argument or a result).

| Tool | Class | Offered when | What it does / limits |
|---|---|---|---|
| `volta_search_products` | read | always | Thin adapter over the existing shop tool: query, category, brand, budget (LKR), limit 1 to 8. Returns the shop's own prices, availability and up to 10 specs. The only source of shop facts |
| `volta_product_details` | read | always | One product by id (`[A-Za-z0-9_-]{1,64}`); variants; says the description is withheld |
| `volta_stock_and_price` | read | always | Price, sale price, **yes/no availability (never a count)**, optional quantity (1 to 10) |
| `calculator` | read | always | Exact rational arithmetic written by hand (no `eval`, no `Function`): `+ - * / ^`, brackets, `n%`, `abs round min max sqrt`; bounded length (200 characters), tokens (100), depth (20), operations (400), number size (2,048 bits), exponent (64) |
| `recall_conversation` | read | always | Read-only view of the server's session facts (bounded depth, size and item count). Takes no arguments and cannot write |
| `web_search` | search | only if a provider is enabled **and** the quota allows | Returns result ids, titles and short snippets (never raw URLs for the model to open) |
| `lookup_documentation` | search | same | Restricted to a configured list of official documentation domains per product (Android, iOS, Windows, Samsung, Python…) |
| `fetch_page` | external | same, plus a fetch quota | Takes **only a result id from this turn**, never an address |
| `propose_cart_change` | **proposal** | **only if the lane names it** | Returns a *proposal* the shopper's browser applies after the shopper confirms. **The server has no cart**; the tool changes nothing. It tells the model in the result itself "appliedToCart: false… do not say it has been added". Uses the existing add/update/remove tools (stock, limits and the browser's cart snapshot are validated by the shop backend) |
| `get_order_status`, `get_order_history` | **disabled** | never | Return "not enabled". **Gap:** there is no backend route for order history or status, tracking works by an order reference of about 49 bits, and customer personal data would reach the model: no approved privacy design |
| `run_code` | **disabled** | never | No approved sandbox |

Checkout, payment and order placement are **not reachable from any tool** (a test asserts no tool name mentions them).

**Provider-neutral declarations.** `executor.declarations(turn)` returns `[{ name, description, parameters }]` with a plain JSON-schema object; the Ollama shape is derived from the same list. A gateway converts it to its provider's function-declaration format. **Not verified:** which JSON-schema keywords (`pattern`, `minLength`, `format`) a given hosted provider accepts; the gateway must strip what its provider rejects.

## 3. The executor

`LlmToolExecutor` runs what a model proposes under the server's authority and never throws into the model loop.

- **Parsing** accepts the shapes small models produce (`{name, arguments}`, a `function` wrapper, arguments as a JSON string, double-encoded, code fences, chatty text around the object, trailing commas, single quotes, Python literals, unquoted keys, namespaced or hyphenated names) and **repairs only what is unambiguous**, recording each repair by name. **37 malformed-call cases** are tested (parse results: repaired or refused with a reason), plus prototype-pollution keys (`__proto__`, `constructor`) which are dropped, deep nesting, a 25,000-character argument string, zero-width and full-width tricks in names, and duplicate calls.
- **Authorisation.** A tool outside the lane's enabled set cannot run; a per-turn allow list narrows it further; research tools are not even declared unless a provider and quota allow, and an attempted call says "Do not say that you searched"; `propose_cart_change` is off unless named; disabled tools never run even when listed. **Identity never comes from arguments**: a model-supplied `actor` or `customerId` is dropped and the tool sees the server's actor (tested).
- **Limits per turn:** 3 rounds, 3 calls per round, per-tool call counts (search/fetch/documentation 3, calculator 4, default 4), a 12 s total tool time, 14,000 characters of results, a timeout per tool, cancellation. Duplicate calls are refused ("use the earlier result").
- **Honest failures.** A failed, timed-out, refused or throwing tool produces a `TOOL_ERROR …` line with a stable code and "Do not claim it returned a result"; **no stack, message or secret reaches the model**; a failed call produces **no evidence**, so it can never ground a claim.
- **Fencing.** Every result is wrapped as `<<<UNTRUSTED_DATA id=<random per call> source=…` … `UNTRUSTED_DATA_END id=…>>>`; the id cannot be guessed and is removed from the body; lookalike markers and invisible, bidirectional, tag and variation-selector characters are stripped.

## 4. Search layer

### 4.1 What is real and what is fake

| Piece | State |
|---|---|
| `SearchProvider` interface, `GroundedAnswerProvider` interface | Real interfaces |
| `FakeSearchProvider` | The only provider ever run |
| `BraveSearchAdapter`, `GeminiGroundingAdapter` | **Disabled skeletons.** They refuse unless constructed with BOTH an injected `fetch` and a key (Gemini: and a model); they **never read the environment** (tested with the likely variable names set); nothing constructs them with a key; **never called**. Field names come from vendor documentation read on 2026-11-14 and are **not verified against the live services** |
| `SafeFetcher` | Real; tested against a loopback fixture server and refusal tables |
| Extractor, injection handling, query redaction, quota, cache, citations | Real, tested |

### 4.2 SafeFetcher (the research lane's page reader; deliberately not the VOLTA-only browser)

Rules enforced by this module alone: `http`/`https` only; the scheme's default port only; no credentials in the URL; **no IP-literal hosts** (decimal, octal and hex forms are normalised by the URL parser and then refused); names such as `localhost`, `*.localhost`, `*.local`, `*.internal`, trailing-dot and underscore hosts are refused without a lookup; the name is resolved **by the fetcher** (injectable resolver) and **every answer must be public** (one blocked answer refuses the whole name); the socket connects **only to the validated address** (pinning: the name is not resolved again); every redirect hop is validated like the first request (3 at most; the limit cannot be raised); a size cap (default 1 MB, clamped to 2 MB) with the rest never buffered; `text/html`, `application/xhtml+xml` and `text/plain` only (PDF refused); no cookies, no authorisation, no compression requested; a total deadline that now **also bounds the DNS lookup**; an optional robots hook.

Tests (80, `search-fetcher.test.ts`), all on the production code path or, for connections, a loopback fixture with a test-only factory that the production factory ignores (tested):

| Group | Cases |
|---|---|
| A name resolving to a blocked address (loopback, RFC 1918, link-local, cloud metadata, CGNAT, 0.0.0.0, `::1`, `fe80::`, `fc00::`, `fd00:ec2::254`, IPv4-mapped, NAT64, 6to4, Teredo, `::127.0.0.1`, site-local, multicast) | 29, all refused as `private_address`, no connection |
| IP-literal URLs (127.0.0.1, `[::1]`, `2130706433`, `0x7f.1`, `017700000001`, `127.1`, `0`, mapped, metadata, a public literal) | 13, all `ip_literal` |
| Non-http schemes (ftp, file, gopher, javascript, data, ws, blob, mailto, view-source) | 9 |
| Credentials, host-confusion (`example.test@evil.test`), non-default ports, malformed URLs, `localhost`-style names | tested |
| Redirects to a private IP, the metadata address, a `file:` URL, credentials, a bad port; more than 3 hops; loops | refused |
| **DNS rebinding** (a name answering publicly once and privately the second time) | the second hop is refused; the resolver is called once per hop; the fixture name does not exist in DNS, so a successful fetch proves the connection used the pinned address |
| Size cap, content type, charset, error status, slow server, **trickling body (slow-loris)**, never-answering resolver, cancellation, robots veto | tested |
| No cookie, no authorisation header, `accept-encoding: identity`, identifying user agent | tested (the first response sets a cookie; it is not sent back) |

Mutation checks (deliberately breaking the code and watching the tests fail): removing the pinning failed 19 tests; tolerating one blocked address among several failed 1; removing the resolver deadline failed 1; each was restored.

### 4.3 Extractor, injection handling, redaction

- **Extractor:** drops scripts, styles, `noscript`, templates, SVG, iframes, navigation, footers, forms, buttons, comments, CDATA, `hidden`, `aria-hidden`, `display:none`, `visibility:hidden`, `opacity:0`, `font-size:0`, off-screen and zero-height styling, `type=hidden` inputs; decodes entities; removes invisible characters **after** decoding. **Stated limit:** low-contrast text and text hidden by an external stylesheet cannot be detected here (a test records this); such text is fenced and scanned instead.
- **Injection detection and neutralising:** 17 hostile phrasings (ignore instructions, reveal the prompt, tool commands, new instructions, role override, chat templates, exfiltration, authority claims, a Sinhala "ignore" phrase) are flagged, also when hidden with invisible or full-width characters; six ordinary sentences are not; an instruction-like sentence is replaced by `[removed: instruction-like text]`. **Limit:** a pattern list is a second line of defence; the real defences are the fencing, the fact that retrieved text can never select a tool or authorise anything, and verifier v2 refusing an answer that obeys a page (tested end to end).
- **Query redaction:** e-mail addresses, phone numbers, NIC numbers, long digit runs and URLs are removed from a query; greetings and store price lookups are refused. **Fixed:** lists of years or specifications ("samsung 2024 2025 2026 models") were deleted as phone numbers; a phone number now needs a leading `+` or `0` with 9 to 15 digits (or the grouped 3-3-4 shape). **Limit:** a customer's name or an address typed into a query cannot be detected.

## 5. Defects found and fixed in this round

1. **High: the HTML extractor was quadratic on unclosed tags.** A hostile page of `<a "` or `<div ` repeated took 0.27 s at 4,000 repeats and about 60 s at the 60,000 a page near the 1 MB cap allows, which would have **frozen the single-threaded Agent for every shopper**. Replaced by a linear tokenizer with a 2,048-character tag limit and a total work budget (when the budget is spent the rest is treated as text, still cleaned, capped, fenced and scanned). A hostile-input timing test now covers nine patterns and was shown to fail on the old behaviour.
2. **Invisible characters written as numeric entities survived** (`&#x202E;`, `&#x200B;`, tag characters): stripping ran before decoding. Now both, in the body and the title.
3. **The DNS lookup was not bounded by the fetch deadline** (a resolver that never answers held the turn open). Now raced against the deadline; non-array or non-string resolver answers are refused.
4. **Query redaction deleted ordinary year and spec lists** (above).
5. **The tool layer's evidence type was claimed to be "structurally identical" to the verifier's; it is not.** A real adapter now exists and is tested end to end.
6. The failing calculator test expected the wrong code. Contract now documented and tested: **more than 200 characters is `TOO_LONG`; more than 100 tokens is `TOO_MANY_TOKENS`**; neither cap was weakened.
7. Added the missing tools: `propose_cart_change` (class `proposal`, off by default), `get_order_status` and `get_order_history` (disabled), and the provider-neutral `declarations`.

## 6. Quota and cost accounting

Every cap (per session, per day, per month, searches and fetches) **defaults to 0 = disabled**: nothing can search or fetch until an owner sets caps and approves a provider. Counts per UTC day and month and per conversation, in memory only; a kill switch; usage with 50 % and 80 % alerts; the cost estimate uses configured unit prices that default to 0 (**no price is invented**). A refused call is never counted. A full session table loosens only the per-conversation cap, never the day or month caps. **Limits:** memory only, so a restart resets the counts; real spend can only be reconciled against the provider's billing.

The search cache is **off by default** (a candidate provider's standard plan does not allow storing results).

## 7. Tests (all executed, all passing)

| File | Tests |
|---|---|
| `tools-llm-calculator.test.ts` | 80 |
| `tools-llm-executor.test.ts` (parsing table of 37, authorisation, limits, honest failures, fencing, declarations) | 77 |
| `tools-llm-tools.test.ts` (against the real shop tool registry on the invented catalogue; cart proposals; disabled tools) | 25 |
| `tools-llm-adapter.test.ts` (tool → evidence → verifier, end to end) | 14 |
| `search-fetcher.test.ts` | 80 |
| `search-extract-injection.test.ts` | 73 |
| `search-misc.test.ts` (provider, adapters, quota, cache, helpers, citations, query redaction) | 28 |
| **Total** | **377** |

Together with the verifier's 176, **553 tests** cover these modules. The Agent suite as a whole: **2,670 passed, 6 skipped, 0 failed** (103 files); `tsc --noEmit` is clean; the control-character guard test passes. The global `fetch` is replaced by a throwing function in these test files, so any outbound call by that route fails the test.

## 8. Public API for the turn-loop agent

```
createLlmTools({ exclude? }) -> LlmTool[]
new LlmToolExecutor({ tools, enabled?, limits? })
  .startTurn({ actor, requestId, sessionKey, deps, session?, cart?, signal?, allow?, now? }) -> TurnState
  .declarations(turn) -> { name, description, parameters }[]      // provider-neutral
  .offered(turn)      -> Ollama tool schema[]
  .unavailable(turn)  -> names of tools that exist but cannot run this turn (tell the model honestly)
  .runRound(turn, rawCalls[]) -> { round, results[], evidence[], canContinue }
     results[i]: { tool, status, code?, modelText, evidence, proposal?, audit }
  turn.evidence, turn.proposals, turn.audit
toVerifierEvidence(turn.evidence), retrievedSources(turn.evidence), searchRan(turn.audit)   // inputs for verifyAnswerV2
LlmToolDeps = { registry, search?: { provider, providerEnabled?, quota, cache, fetcher }, docDomains? }
```

## 9. Remaining gaps (not hidden)

1. **Not wired** into any pipeline; no turn loop exists; no real model has called any of it.
2. **No provider is approved**, and no search has ever run against the internet; the provider shapes are unverified.
3. **Order tools are disabled for lack of a backend route and a privacy design**, not for lack of code.
4. **Cart:** the server has no cart; proposals only. The existing cart tools were not changed.
5. **Extractor limits** (stylesheet-hidden and low-contrast text) and a **pattern-based** injection detector.
6. **Memory-only quotas.**
7. The tool descriptions have not been tested with a real small model (do they choose the right tool? unmeasured). Earlier server measurements put tool choice at 54.3 % on a simplified harness for one model.
8. **The shell tool corrupted regular expressions earlier today** (backslashes collapsed into backspace characters); a guard test now fails the build if any control character appears under `src/`. All files in this report were scanned: none.
