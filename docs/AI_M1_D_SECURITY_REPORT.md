# VOLTA.LK AI Shopping Assistant: M1-D Security and Verification Report

Status: M1-D complete, awaiting review. M1-E is not started. Nothing is committed, pushed or deployed.
Mock data only: no production ERP, production database or real customer data was accessed. No port, SSH, firewall, Ollama or server networking setting was changed. SinhalaLLM remains disabled by default and Sinhala production readiness is not claimed.

## 1. Threat model

Trust boundaries: browser, then the website backend (BFF), then the Agent API, then tool backends and Ollama. The Agent is reached only by the BFF with an HMAC signature. Everything a shopper types, every catalogue text and every model output is **untrusted data**.

| # | Threat | Where it is stopped |
|---|---|---|
| T1 | Flooding, brute force, a stuck request holding resources | Abuse guard: per-IP, per-session, per-customer and concurrency limits, cooldown, failed-auth throttle, body and message limits, global in-flight cap, inference queue limit |
| T2 | Spoofed identity or client IP | Identity and client IP are covered by the HMAC signature; forwarded-for style headers are never read |
| T3 | Replay of a captured request | Nonce cache (fails closed when full), 60 s clock window |
| T4 | Session hijack or fixation, reading another shopper's state | State keyed by (signed identity, session id); session id bound to its first identity; idle and absolute expiry |
| T5 | Guests reaching order data, a customer reaching another's order | Router hand-off, tool permission matrix, ownership check in the backend, and the verifier (an order card is refused for a guest) |
| T6 | Prompt injection: overrides, role play, prompt extraction, hidden instructions in product data | Pre-filter before any model or tool; the model never writes shopper text, never sees descriptions, and suspicious names are withheld; tool and argument validation |
| T7 | Model-invented tools, ids, prices, stock | Closed tool allow-list, strict Zod arguments, id and filter allow-lists from the catalogue, and the response verifier |
| T8 | Secrets and personal data: cards, OTPs, passwords, NICs, API keys, tokens | Pre-filter refuses and discards them; fixed templates never echo input; logger allow-list; outgoing text scan |
| T9 | Fabricated or tampered facts in a response (bug or compromised component) | Response verifier checks every card, action, link and sentence against this request's tool results, then fails safe |
| T10 | Cart, checkout, payment, order or discount actions | None exist: cart tools only emit browser proposals that always ask; no write method exists in the backend or ERP transport |
| T11 | Old clients receiving shapes they cannot handle | Contract version negotiation and a final shape check |

Out of scope for M1: TLS and network exposure (loopback only, no port opened), the real BFF, real authentication, WAF and DDoS protection beyond the application, and denial of service by an attacker with valid signing keys.

## 2. Controls implemented

New or changed code (all under `apps/agent/src`):

- `security/rate-limit.ts` (new): `AbuseGuard`, `MemoryRateStore`, the `ChallengeProvider` interface.
- `security/sessions.ts` (new): `SessionRegistry` (ownership, idle and absolute expiry).
- `session/store.ts`: absolute lifetime (8 h) in addition to the 30-minute sliding idle expiry.
- `verify/verifier.ts` (new): `verifyResponse` and `verifyVersionShape`.
- `pipeline/routing-pipeline.ts`: every answer goes through the verifier before anything is emitted or remembered; actions are taken only from a real `proposal` tool result.
- `http/server.ts`: auth-failure throttle (before verification), per-IP, per-customer, concurrency, challenge, per-session and new-session checks, session ownership, version shaping with a final check, for JSON and streamed responses.
- `router/lexicon/safety.ts` and `router/safety.ts`: secret and token patterns, `containsSensitive`, and fixes to two weak patterns (section 6).
- `pipeline/english-planner.ts`: a catalogue name that reads like an instruction or secret is withheld from the model.
- `router/templates.ts`, `router/types.ts`: the `verification_failed` template (English and provisional Sinhala).
- `observability/logger.ts`: `verifierFailureLogger` (code only).
- `config.ts`, `.env.example`: rate limit and challenge settings.

## 3. Rate-limit configuration

All values are environment variables with the defaults below, validated at startup (a bad value stops the service from starting).

| Setting | Default | Range | Key used |
|---|---|---|---|
| `AGENT_RATE_IP_PER_MIN` | 40 | 1 to 1000 | signed client IP |
| `AGENT_RATE_SESSION_PER_MIN` | 15 | 1 to 1000 | (identity, session id) |
| `AGENT_RATE_IDENTITY_PER_MIN` | 30 | 1 to 1000 | signed customer id, across all sessions |
| `AGENT_MAX_CONCURRENT_PER_IDENTITY` | 2 | 1 to 20 | customer id, or client IP for guests |
| `AGENT_NEW_SESSIONS_PER_HOUR` | 10 | 1 to 200 | identity |
| `AGENT_AUTH_FAIL_PER_MIN` | 20 | 1 to 1000 | the socket's own remote address |
| `AGENT_COOLDOWN_AFTER` | 3 | 1 to 100 | violations inside one minute |
| `AGENT_COOLDOWN_SEC` | 60 | 1 to 3600 | cooldown length |
| `AGENT_MAX_MESSAGE_CHARS` | 800 | 1 to 800 | message length (existing) |
| `AGENT_MAX_BODY_BYTES` | 20000 | 1000 to 100000 | request body (existing) |
| `AGENT_MAX_IN_FLIGHT` | 16 | 1 to 256 | global concurrent requests (existing) |
| `AGENT_QUEUE_MAX_DEPTH` | 6 | 0 to 50 | inference queue (existing) |
| `AI_CHALLENGE_MODE` | `off` | `off`, `on-abuse` | see below |

Behaviour: a refusal is `429 RATE_LIMITED` with `Retry-After`; repeated violations start a cooldown during which the key is refused without counting; an exhausted queue or in-flight cap is `503 QUEUE_FULL` with `Retry-After`. Message length and body size are refused before any pipeline work (422 and 413).

**Fails safe:** if the counter store is full or throws, the request is refused with a generic 503 busy response (never allowed through, and the error text never contains the storage error). A full replay cache also refuses.

**CAPTCHA-ready, no provider:** `ChallengeProvider.verify(token, clientIp)` is the interface a provider would implement. In `on-abuse` mode a client that recently hit a limit must send `challengeToken` and the provider must accept it; with no provider configured the gate stays closed (it never accepts an unverified token), and a throwing provider counts as a failed challenge. Nothing was purchased or integrated.

**Trusted keys only:** keys come from the signed client IP, the signed identity, the validated session id and (before authentication) the socket address. `X-Forwarded-For`, `X-Real-IP`, `Forwarded` and `CF-Connecting-IP` are never read (tested: a spoofed header neither dodges a limit nor charges someone else). No raw message text is stored in any counter or log.

## 4. Session security decisions

- The session id is a **handle, not a credential**. Authority always comes from the signed identity.
- **Validation:** 16 to 64 characters of `A-Z a-z 0-9 _ -`; anything else is 422 and nothing runs.
- **Ownership:** an id is bound to the first identity that uses it. Any other identity (a guest, another customer, the same shopper after login) gets 422 and the pipeline is not called. Conversation state is also keyed by (identity, id), so even a guessed id exposes nothing.
- **Fixation:** an id an attacker started as a guest can never become the victim's logged-in session.
- **Expiry:** 30 minutes idle (sliding) and 8 hours absolute for both the binding and the conversation state; activity cannot extend the absolute limit. An expired id starts fresh.
- **New sessions** per identity per hour are limited, so session flooding cannot churn the bounded stores.
- **Replay:** nonce cache, 60 s skew, fail closed when full. A wrong key, an unsigned request and an altered body all return the same generic 401.
- **Guests** never receive order details (router hand-off to `/track-order`, permission matrix, verifier).

**Decision needing approval (D1):** because a session id is bound to one identity, the website backend must issue a **new session id when a shopper logs in or out**. This is what prevents fixation, but it means a guest conversation does not continue after login.

## 5. Prompt-injection test results

All through the full mock pipeline with a fake Ollama, in `m1d-injection.test.ts` (58 tests):

- 17 override and role-manipulation attacks (English, Sinhala, structural markers such as `<|im_start|>` and `[SYSTEM]`) are refused before any model, tool or ERP call: zero model requests, zero ERP calls.
- 7 prompt and configuration extraction attempts are refused; and when a model is made to leak a fake prompt or key in free text, the shopper still only sees a fixed template.
- Hidden instructions in product names and descriptions: the description never reaches the model; a hostile name is withheld from the model's context; a model that obeys anyway and asks for `place_order`, `apply_discount` or `set_price` runs nothing; the hostile name appears on a card only as escaped, capped text with the real price.
- 16 tool-argument manipulations (unknown ids, SQL and path ids, `__proto__`, extra fields such as `price` or `customerId`, negative, huge and fractional quantities, a `confirm` flag, too many ids): none reaches the backend or creates a proposal.
- 9 price, stock or discount manipulations are refused; a model's false free-text claim never reaches the shopper and cards carry the live ERP value.
- Other customers' data: bulk requests are refused, a foreign order reference gets "not found" with no ERP read, and a guest gets no order data by any route.

These tests found two real gaps, now fixed: the pattern for "50% off" never matched (a trailing word boundary after `%`), and a Singlish OTP phrase ("otp eka is 559900") was not recognised.

## 6. Sensitive-data test results

`m1d-sensitive.test.ts` (41 tests) and `m1d-abuse-http.test.ts`:

- 26 sensitive inputs (card numbers with spaces, dashes and none, CVV, OTP, password, PIN, old and new NIC, bearer token, JWT, `sk_`, AWS, GitHub and Slack tokens, the store credential format, session cookie, named API keys and secrets, private key header, long hex, and Sinhala and mixed forms) are each detected and refused with a fixed template. For each: the secret is not in the response or events, no model or ERP call happens, and no cards or actions are returned.
- The stored conversation state has no field that could hold text and does not contain the secret.
- Card detection uses the Luhn check, so ordinary long numbers pass; the whole legitimate-message pack and common product, price, order and phone wording are not flagged.
- **Outgoing:** a catalogue name carrying an API key is caught by the verifier (`sensitive_leak`), the answer is replaced and the secret is not in the output.
- **Logs and errors:** a secret in a message, in malformed JSON or in an invalid field is never echoed in a response or written to a log. Authentication failures reveal nothing about which part was wrong. Logs contain only the allow-listed fields (no message, session id, customer id, IP, nonce or signature).
- **Retention and consent stay disabled:** startup fails if any switch mentioning retention, consent, message logging or training is set to anything but false. There is no consent code.

## 7. Fact verification architecture

Only backend results are a factual source. The model chooses tools at most; it never writes shopper text and never sees product descriptions.

```
message -> safety filter -> router (or Qwen tool choice) -> allow-lists and Zod validation -> permission check
        -> mock backend (tool results) -> cards built from results -> RESPONSE VERIFIER -> fixed template -> emit
```

Facts and what checks them:

| Fact | Checked against |
|---|---|
| Product id, slug, name, brand | the tool result product, field by field |
| Price, list price, offer | integer cents from the source, formatted by the verifier's own formatter (not the card builder's) |
| Stock status, variants, quantities | source availability, variant labels, prices and availability |
| Specifications and warranty | each card spec must exist in the source specs; nothing else is allowed, so an invented warranty fails |
| Compatibility and accessories | an accessory card needs an explicit link in this request's accessories result, with the same kind and source product |
| Comparison | every product from the compare result, every row recomputed (a missing spec must be `null`), price difference recomputed |
| Cart totals and delivery charge | cart result lines, subtotal, and a delivery charge only if the result had one |
| Orders | only for a customer, and equal to an order the tool returned |
| Missing information | shown as `null` or unavailable, or a clarification; never filled in |

## 8. Response verifier design

`verify/verifier.ts`, run in `compose()` on every answer before any card or action is emitted and before any state is remembered.

Checks: (1) every card traces to a tool result of this request and every shown fact equals it; (2) every cart action equals a tool proposal exactly and asks for confirmation, and every link is one of `/checkout`, `/cart`, `/track-order` or a product page returned by a tool (an order reference link is not allowed); (3) the reply is the exact fixed template for its key, or a polished Sinhala text with no digits, currency, link or `@`; a model-sourced reply is always refused; (4) no card number, OTP, password, NIC, key or token anywhere in outgoing text, including catalogue text; (5) any Sinhala, Singlish or mixed text requires `needsNativeReview`; (6) `verifyVersionShape` confirms nothing a 1.0 client cannot understand (more than 3 comparison products) is sent, for JSON and each streamed card.

Failure behaviour: the whole answer is replaced by the fixed `verification_failed` template in the shopper's language, with **no cards, no actions and nothing remembered**; the rejected content is neither returned nor logged, only a code such as `product_mismatch` (through `verifierFailureLogger`). Nothing is repaired or substituted from a guess, and the true value is not substituted either. A polished Sinhala text that fails keeps the original fixed template.

Failure codes: `card_without_source`, `unknown_product`, `product_mismatch`, `variant_mismatch`, `stock_mismatch`, `accessory_unauthorized`, `comparison_mismatch`, `cart_mismatch`, `order_unauthorized`, `order_mismatch`, `action_unauthorized`, `link_not_approved`, `reply_unsupported`, `sensitive_leak`, `review_flag_missing`, `contract_version`.

Verification quality: 37 unit tests mutate each fact of genuine answers (wrong price, amount, name, id, link, spec, warranty, variant, stock, accessory, cart, order, action, reply, secret, review flag, version), and 17 pipeline tests tamper with the card builder. Over about 280 messages for guests and customers (over 150 cards) the verifier rejected **zero** genuine answers.

## 9. Tool execution authorization

- Closed allow-list of ten tools (`search_products`, `get_product_details`, `compare_products`, `check_stock`, `get_accessories`, `get_cart`, `add_to_cart`, `update_cart_quantity`, `remove_from_cart`, `get_order_status`); each is a read or a browser-side proposal. No tool name contains checkout, pay, order creation, discount or admin.
- Every schema is strict (unknown fields rejected, never dropped); 25 invented or malformed names (case, spaces, traversal, `constructor`, `__proto__`, non-strings) are unknown tools and the backend is untouched.
- Permission before execution: a guest cannot run `get_order_status`; the actor comes from the signed identity and no argument can name or change it; a customer reads only their own orders and a foreign reference is "not found".
- Product id, category and brand allow-lists from the catalogue; at most 3 calls per turn; an exact repeat is refused.
- Cart tools return only a proposal that asks; invalid, negative, zero, fractional, oversized and non-numeric quantities, unavailable items and removing something not in the cart are refused.
- The backend class and the ERP transport have no write method (asserted by test); the only actions that exist are `cart.add`, `cart.setQuantity`, `cart.remove` (all `confirm:"ask"`) and navigation to three pages.

## 10. Test results

| Check | Result |
|---|---|
| Agent tests (vitest) | 37 files, **792 passed**, 0 failed, 0 skipped (was 568; 224 new or changed) |
| Web tests (vitest, unit and integration) | 16 files, **191 passed**, 0 failed, 0 skipped |
| Browser spec `tests/e2e/assistant-demo.spec.ts` (Playwright, Chromium) | **3 passed** (the only browser test relevant here; no web code changed in M1-D) |
| Agent typecheck | 0 errors |
| Web typecheck | 0 errors |
| ESLint | the agent package has no ESLint configuration, so there was nothing to run; no web file changed in M1-D (web ESLint was clean at the previous milestone) |
| Not run | real Ollama tests, load or soak tests (M1-E), the pre-existing storefront e2e specs |

New test files: `tests/unit/rate-limit.test.ts` (21), `tests/unit/verifier.test.ts` (37), `tests/integration/m1d-abuse-http.test.ts` (34), `m1d-injection.test.ts` (58), `m1d-sensitive.test.ts` (41), `m1d-tool-authz.test.ts` (14), `m1d-verifier-pipeline.test.ts` (17), plus helpers `tests/fixtures/{http-helpers,mock-stack-helpers}.ts`. Updated: `config.test.ts` (challenge mode and rate limits), `http.test.ts`, `m1c-pipeline.test.ts`, `routing-pipeline.test.ts` and `stub-backend.ts`.

Regression: all M1-A to M1-C suites pass. Intentional behaviour changes that needed test updates: a session id can no longer be shared between identities (tests now use one id per identity), and a cart action is only taken from a real `proposal` tool result (the stub backend now returns well-formed proposals).

Coverage of the requested list: rate-limit boundaries, concurrent requests, queue exhaustion, invalid and expired sessions, guest and cross-customer order access, prompt injection, sensitive leakage, invalid tool arguments, fact manipulation, wrong prices and quantities, invalid links, missing data, verifier failure behaviour and Sinhala `needsNativeReview`: all covered, as listed in sections 3 to 9.

## 11. Known limitations

- **Single process memory.** Rate counters, cooldowns, the replay cache, the session registry and conversation state live in one process; a restart resets them, and they are not shared across instances. Fine for the planned single Agent, not for a scaled-out one.
- **Pre-authentication throttle uses the socket address.** Behind a tunnel or proxy, the BFF and any attacker who reaches the port directly would share that address only if they come through the same hop. A burst of bad signatures from a misconfigured BFF could throttle the BFF itself (decision D2).
- **Pattern-based detection.** The injection, price and secret filters are regular expressions: a paraphrased attack can pass the filter. The architecture is the real defence (the model cannot write shopper text, execute anything, or see descriptions, and the verifier checks facts), but the filter is not complete. They can also wrongly block a legitimate message that looks like a secret (for example "token: " followed by a long word).
- **Sinhala and Singlish patterns and fixed texts are provisional** and need native review (B5). The Sinhala `verification_failed` text is new and unreviewed.
- **The verifier checks facts and form, not intent.** It cannot tell whether the router or Qwen picked the most helpful tool; that is an accuracy question for the independent evaluation.
- **Free text is not supported.** Because the reply is always a fixed template, there is nothing to verify beyond that; any future free-form text would need new verification rules.
- **No real CAPTCHA, WAF or TLS.** The challenge is an interface only; with no provider, `on-abuse` mode closes the gate for flagged clients.
- Session ids are chosen by the BFF; the registry holds at most 5,000 bindings (least recently used first).
- The mock catalogue only was tested; the real ERP's data quality (odd characters, very long texts) is untested.
- Real Ollama and any load behaviour were not tested.

## 12. Remaining M0 blockers

- B2: a staging ERP (the website host runs a `volta-mock-erp` container).
- B3: tunnel and AllowUsers approval.
- B5: native Sinhala reviewers.
- B6: legal sign-off.
- B9: root password reset. The website server's root password was shared in chat earlier and should be rotated.

## 13. Decisions requiring approval

- **D1:** the BFF must rotate the session id on login and logout (section 4).
- **D2:** keep the failed-authentication throttle keyed by socket address, or disable it for the BFF's known address once the tunnel exists.
- **D3:** the default limits in section 3 (they are conservative guesses, not measured; M1-E can tune them under load).
- **D4:** whether `on-abuse` challenge mode should stay available while no provider exists (it fails closed for flagged clients).
- **D5:** the new Sinhala `verification_failed` wording needs reviewer approval with the other templates.

## 14. Confirmation

Mock data and loopback fake services only. No production ERP, database or customer data was accessed. No checkout, payment, order creation, discount execution or server-side cart change exists. Message retention and consent collection remain disabled and absent. Logging remains allow-listed and contains no message text. HMAC authentication, replay protection and `needsNativeReview` are preserved. SSH, firewall, Ollama, server networking and deployment configuration were not touched. No voice code was added. Nothing was committed, pushed or deployed, and M1-E has not begun.
