# VOLTA.LK AI Shopping Assistant: M1-C Review Remediation

Scope: the five review items only. M1-D and M1-E are not started. Nothing is committed, pushed or deployed.
No production system, real ERP data or customer data was accessed; no network, SSH, firewall, Ollama or deployment setting was touched.

> **Update after final authorization:** items 1 to 3 below were later approved and implemented in part: a local, browser-only mock demo (not the chat proxy route), 2 to 4 product comparison with contract version 1.1, and products 16 to 25 in the web mock ERP (opt-in). See [AI_M1_C_CLOSURE_REPORT.md](AI_M1_C_CLOSURE_REPORT.md) for the current state. The text below is the review-time assessment and is kept for the record.

## Summary of outcomes

| # | Item | Outcome |
|---|---|---|
| 1 | UI integration | Assessed and documented. **Nothing implemented**, awaiting approval of the exact files below. |
| 2 | Compare 4 products | Assessed. **Nothing changed.** The change is feasible and small, but it alters the contract, so it needs approval. |
| 3 | Catalogue consistency | Verified by a new test: all 25 products work through every tool. Impact of the 10 fixture-only products documented. |
| 4 | Router coverage | "computer accessories" fixed (narrow, deterministic). "keyboards" left as a clarification, by design. |
| 5 | Regression | Agent 554 of 554, web 166 of 166, typechecks and ESLint clean. |

## 1. UI integration assessment

### Current state (verified in the repo)

- `apps/web` has **no Agent client and no assistant route or page**. The only `/api/internal/*` route is `sync-orders`, a Bearer-secret job endpoint that returns 404 when its secret is unset, with rate limiting. It is the precedent the architecture cites.
- The browser cart is `cartActions` in `apps/web/src/store/cart.ts` (`add`, `setQuantity`, `remove`, localStorage, no server cart).
- The shopper's session is the `valta_session` cookie, resolved by `customerForSession(db, token)` in `apps/web/src/lib/auth/accounts.ts`.
- The Agent API verifies HMAC-signed requests (`apps/agent/src/auth/hmac.ts`: key id, timestamp skew 60 s, nonce replay cache, identity claim `anon` or `cust:<id>`). The architecture fixes the trust boundary: browsers never call the Agent; a same-origin website route authenticates the shopper and forwards a signed request.
- The new components (`apps/web/src/components/assistant/`) are presentational. They take card data and callbacks as props and do not fetch.

### Smallest safe connection (proposal, not implemented)

Two pieces, both inside `apps/web`, with no public Agent exposure and no networking change:

1. **A same-origin chat proxy route** `apps/web/src/app/api/assistant/chat/route.ts` (POST). It:
   - returns 404 unless `AI_ASSISTANT_ENABLED=true` and the signing key env vars are set (disabled by default, like `sync-orders`);
   - requires a same-host `Origin` and rate-limits per client (reusing `lib/security/rate-limit`);
   - validates the body with a small Zod schema (message length, cart snapshot, `sessionId`) and rejects any customer id in it;
   - takes identity **only** from the cookie (`customerForSession`), never from the body, and signs `anon` or `cust:<id>` with a new `apps/web/src/lib/assistant/sign.ts` (HMAC, same canonical string as the Agent);
   - forwards to the Agent base URL from env and returns the response after re-validating it with a web-side copy of the card and action schemas, so unexpected shapes and non-allow-listed `href` values are dropped.
2. **A client panel** `apps/web/src/components/assistant/assistant-panel.tsx` that posts to that route, renders `AssistantCards`, and applies a cart action through `cartActions` **only inside the `CartProposalConfirm` `onConfirm` callback**, once per `actionId`.

A **local, mock-only** variant needs no deployed Agent: run the Agent with `createMockStack` (needs a small `apps/agent/src/dev-mock-server.ts` that wires the mock pipeline into `createAgentServer` on loopback only, never imported by `main.ts`) and point the proxy at `127.0.0.1`. The existing test that `src/main.ts` never imports `src/mock` stays in force.

### Exact files that would change

New: `apps/web/src/app/api/assistant/chat/route.ts`, `apps/web/src/lib/assistant/sign.ts`, `apps/web/src/lib/assistant/schema.ts`, `apps/web/src/components/assistant/assistant-panel.tsx`, `apps/agent/src/dev-mock-server.ts`, plus tests for each.
Edited: `apps/web/.env.example` (documents the new vars, all disabled by default); one layout or page to mount the panel behind the flag (to be chosen with you).

### Security implications

- The route is a new **public** website endpoint (browser to website), even though the Agent stays private. It is the main new attack surface and needs the controls above: disabled by default, same-origin check, rate limits, strict validation, no identity from the body, output re-validation, no message text in logs.
- The signing secret must exist only in the website server env, never in client code or the repository.
- The cart applies only after an explicit click, once per `actionId`, with `href` allow-listed.
- With `DEMO_READ_ONLY=true`, `proxy.ts` already refuses non-GET requests, so the demo site would also refuse the chat POST unless it is deliberately excepted.
- It needs your approval of P3 (internal and assistant routes in `apps/web`), and of a dev flag. A real Agent URL (tunnel or WireGuard, blockers B3 and M0) is **not** needed for the local mock variant.

## 2. Comparison of 4 products

**Can the contract support 4 safely? Yes.** Four product cards are small, `cards` is capped at 8, and no model or resource limit is affected. The limit of 3 appears in nine places, all consistent (a design choice, not a technical one):

| Place | Now | Change |
|---|---|---|
| `apps/agent/src/contract/schemas.ts` | `ComparisonCard.products` `.max(3)`; row `values` `.max(3)` | `.max(4)` (**contract change**, `CONTRACT_VERSION` bump recommended: an older web client built for 3 would reject a 4-product response) |
| `apps/agent/src/tools/definitions.ts:86` | `productIds` `.max(3)` | `.max(4)` |
| `apps/agent/src/backend/cards.ts:80` | `products.slice(0, 3)` | `slice(0, 4)` |
| `apps/agent/src/router/router.ts` (`named.slice(0, 3)`), `entities.ts` (`slice(0, 3)` of named products) | 3 | 4 |
| `apps/agent/src/pipeline/routing-pipeline.ts:160` | last 3 shown for "both/these" | consider 4 |
| `apps/agent/tests/unit/definitions.test.ts` | "four products" is an **invalid** case | becomes valid; add "five products" invalid |
| `apps/agent/tests/unit/contract.test.ts` | "requires 2 or 3" | "2 to 4" |
| `apps/web/src/components/assistant/cards.tsx` | table already iterates `products` | four columns need horizontal scroll on phones (`min-w` already set); add a render test with 4 |
| Qwen planner prompt/tool schema | derives from the registry | no manual change expected; re-run the English eval |

Risks: more named products per message raises the chance that entity extraction picks up a wrong product (mitigated by the id allow-list and the clarification path); comparison tables of four are cramped on a phone. Recommendation: approve as a contract bump to v1.1 with the table changes above. No change was made.

## 3. Catalogue consistency

**Verified** by `apps/agent/tests/integration/m1c-remediation.test.ts`:

- The fixture lists exactly 25 products (`cm0item00000001` to `cm0item00000025`).
- For each of the 25: `get_product_details` succeeds, `search_products` finds it by its own name (stock filter off), `check_stock` answers, `compare_products` with another product succeeds, and `get_accessories` answers without error (an empty list where nothing is linked).
- Every accessory link (source and accessory) points at an existing product, so no link is silently dropped.
- Accessories are offered only from explicit links, only in stock (existing tests), and the laptop and tablet mappings are checked in `m1c-catalogue.test.ts`.

**Fixture-only products.** Products 16 to 25 (laptops, the second tablet, ANC earbuds, the case and screen protector for the new items, the laptop charger, mouse, keyboard, hub) exist only in `apps/agent/src/mock/erp-fixture.ts`. The repo's mock ERP server (`apps/web/tests/mock-erp/server.ts`) seeds 15. Impact:

- The contract test against the real mock ERP server covers products 1 to 15 only; the fixture-to-server equality check is restricted to those 15. Products 16 to 25 are proven consistent through the same code paths but not over HTTP against the server.
- If the agent is later pointed at that mock server, the Zen laptops, the mouse and other new items will not exist and the related tests would not apply.
- To close the gap the mock ERP seed would need the same 10 products (a change in `apps/web/tests/mock-erp`, a test-support folder, not production). Not done; it needs your approval.
- This is mock data only; no production ERP dependency was introduced.

## 4. Router coverage

Probed before the change (all through the full pipeline, router-first):

| Input | Before | After |
|---|---|---|
| `Show me computer accessories` | clarification ("not sure what you'd like") | **searches Computer Accessories** (mouse, keyboard, hub) |
| `do you have computer accessories` | clarification | searches (same rule) |
| `computer accessories under 5000` | clarification | searches (budget applied) |
| `show me keyboards` | search | search (unchanged) |
| `keyboards`, `laptops`, `phones` (bare noun) | clarification | clarification (unchanged, deliberate) |
| `accessories` / `show me accessories` | asks "Which product should the accessory fit?" | unchanged (correct) |
| `what accessories fit the Zen Book 14` | accessory cards | unchanged |

**Cause:** the word "accessories" in the category name scored as an accessory-recommendation cue, which tied with the search cue and made the router abstain.
**Change:** `apps/agent/src/router/router.ts` removes the exact English phrases "computer accessory/accessories" and "pc accessory/accessories" from the cue text only (entity extraction still resolves the category). No other wording is affected; the safety filter and permission checks are untouched. Sinhala wording is not affected.
**"keyboards" not changed:** a bare noun abstains for *every* category by design (a minimum evidence score). Special-casing one noun would be inconsistent, and treating all bare category nouns as searches is a policy change across every category, so it is documented rather than done. The shopper gets a clarification that lists what to ask. A bare-noun rule would need your approval and a re-run of the evaluation sets.

## 5. Changed files (this remediation)

- `apps/agent/src/router/router.ts`: category-name phrase handling (one constant, one line in `routeMessage`).
- `apps/agent/tests/integration/m1c-remediation.test.ts` (new): 7 tests for catalogue consistency and router behaviour.
- `docs/AI_M1_C_REVIEW_REMEDIATION.md` (new): this document.
- Earlier M1-C files are unchanged by this pass. `docs/AI_M1_C_CLOSURE_REPORT.md` still lists "computer accessories" as an open router gap; that line is now out of date and the closure report was not edited here.

## 6. Test results

- Agent: 29 files, 554 tests, all passing (was 547; +7 new). The Sinhala and English evaluation sets and the router tests pass unchanged.
- Web: 13 files, 166 tests, all passing.
- Typecheck: agent 0 errors, web 0 errors. ESLint on `apps/web/src/components/assistant` and its test: clean. ESLint was not run over the whole web app or the agent package.
- Stray control-character scan of the agent: clean (a backspace slipped into the new regex during editing and was fixed before the tests ran).
- Preserved: the safety pre-filter ordering, mock-only wiring (test that `src/main.ts` does not import `src/mock`), `needsNativeReview` enforcement, forced `confirm:"ask"` on cart proposals, guest order isolation.

## 7. Remaining limitations

- No assistant page or Agent client exists in the website, so shoppers cannot use the cards yet; no screenshots were taken.
- Comparison remains 2 to 3 products.
- Products 16 to 25 are fixture-only (section 3).
- Bare category nouns ask a clarification question.
- The in-sample evaluation figures are not production accuracy, Sinhala remains provisional and needs native review, and blockers B2, B3, B5, B6 and B9 remain. The website server root password shared earlier in chat should still be rotated.

## 8. Recommendations requiring approval

1. **UI integration:** approve the files and controls in section 1 (P3 for `apps/web`), starting with the local, mock-only variant.
2. **Four-product comparison:** approve the contract bump and the changes listed in section 2.
3. **Mock ERP seed:** approve adding products 16 to 25 to `apps/web/tests/mock-erp` so the HTTP contract test covers all 25.
4. **Bare category nouns:** decide whether "keyboards" and similar should search directly (affects all categories, needs an evaluation re-run) or keep asking.
5. Correct the stale router-gap line in `docs/AI_M1_C_CLOSURE_REPORT.md` once you accept this remediation.

Stopping here. Waiting for explicit approval.
