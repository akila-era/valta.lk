# VOLTA.LK AI Shopping Assistant: M1-C Closure Report

Status: M1-C complete after the final review remediation, awaiting review. M1-D and M1-E are not started. Nothing is committed, pushed or deployed.
All data is **mock data**. No production ERP, production database or real customer data was accessed.
Detail on the earlier review round is in [AI_M1_C_REVIEW_REMEDIATION.md](AI_M1_C_REVIEW_REMEDIATION.md).

## 1. Implementation summary

- **Shopping tools (PRD-1 to PRD-7)** in `apps/agent/src/backend/mock-backend.ts`, registered in `src/tools/definitions.ts` with strict Zod arguments, a permission matrix and server-side allow-lists.
- **Pipeline:** safety filter, intent routing (router-first, Qwen fallback, `AGENT_ENGLISH_MODE=router-first|qwen`), tool validation, mock backend, fact cards, fixed template reply. The Qwen-only mode is kept for evaluation. SinhalaLLM stays disabled by default and may only polish fact-free templates.
- **Facts** reach the shopper only inside cards built from tool results (`src/backend/cards.ts`). Replies are fixed, digit-free templates.
- **Mock ERP contract:** read-only GET transport (loopback only, Bearer credential), the in-memory fixture, and the web mock ERP server, which now serves the same 25 products (section 4).
- **Cart:** proposals only (`ClientAction`, `confirm:"ask"` forced in the pipeline). The server never mutates a cart.
- **Comparison of 2 to 4 products** with a versioned contract (section 3).
- **Local mock UI demo (new)** in `apps/web`: the assistant's cards driven by a browser-only mock controller (section 5). It is **not** the real website assistant. No chat proxy route, no HMAC networking, no Agent connection exists.

## 2. Contract version: 1.1

- `CONTRACT_VERSION` is now `"1.1"`; the legacy `"1"` is still supported.
- `ChatRequest` gains an optional `contractVersion` (`"1"` or `"1.1"`). Any other value (for example `"2"`, `"1.2"`, a number or null) is rejected as a validation error (HTTP 422) and nothing runs.
- **Absent field = a 1.0 client.** It is answered with `meta.contractVersion: "1"` and never receives a comparison of more than 3 products: a larger comparison card is cut to its first 3 products, with every row's `differs` and the price difference recomputed from what remains (`src/contract/compat.ts`, applied to both JSON responses and streamed `card` events in `src/http/server.ts`).
- **`contractVersion: "1.1"`** is answered with `meta.contractVersion: "1.1"` and up to 4 products.
- The health endpoint reports the current version (`1.1`), so a website client pinned to 1.0 that checks health will see the mismatch.

## 3. Four-product comparison

Affected places and changes:

- `src/contract/schemas.ts`: `MAX_COMPARE_PRODUCTS = 4` for `ComparisonCard.products` and row `values`; version constants; the optional request field.
- `src/tools/definitions.ts`: `compare_products` accepts 2 to 4 ids (the English planner's tool schema is derived from it).
- `src/backend/cards.ts`: the card builder uses the same constant.
- `src/router/router.ts`: comparing named products now passes up to 4. `src/router/entities.ts` already matched up to 4 products; its `slice(0, 3)` concerns brand-like unknown words, not products, and is unchanged.
- `src/contract/compat.ts` (new) and `src/http/server.ts`: the 1.0 downgrade and version negotiation.
- Web UI: the comparison table renders any number of columns and was tested at 2, 3 and 4.
- Tests: 2, 3 and 4 products compare; 0, 1, 5 and 6 products are rejected at the tool with no ERP call; a missing specification is `null` ("Not available" in the UI), never invented; the 1.0 downgrade, HTTP negotiation (JSON and stream) and rejection of an unsupported version.

## 4. Mock ERP catalogue consistency

- `apps/web/tests/mock-erp/server.ts` now holds products 16 to 25 as an **opt-in extension**: they are served only when the server starts with `MOCK_ERP_CATALOGUE=extended`. By default the server still serves the original 15, so the storefront's own integration tests and Playwright specs (which hard-code counts such as "Audio, 4 products") are unchanged. The server also now passes warranty and warranty note through when an item has them.
- The agent's contract test starts the server in extended mode and compares it item by item with the agent's in-memory fixture (`mock-erp-contract.test.ts`): all 25 views are identical.
- Over HTTP against that server, each of the 25 products is checked through details, search (by its own name), stock, comparison and accessories. Every accessory link is checked against the served product ids. Warranty appears only where the ERP holds it.
- The earlier "fixture-only" limitation is resolved. The 10 extra items still have to be kept in step by hand in two files (`erp-fixture.ts` and `mock-erp/server.ts`); the contract test fails if they drift.

## 5. Local mock UI integration (what it is and is not)

- **Page:** `apps/web/src/app/(store)/assistant-demo/page.tsx`. Answers 404 unless `ASSISTANT_DEMO_ENABLED=true` (off by default, documented in `apps/web/.env.example`, tested), `noindex`.
- **Controller:** `src/lib/assistant-demo/{data,controller}.ts`: pure functions over 11 built-in demo products, with no `fetch`, storage or server. It produces the same card and action shapes as the Agent contract.
- **UI:** `src/components/assistant/demo-shell.tsx` with the cards from `cards.tsx`. Controls for search (category, budget, in-stock), details, stock, accessories (explicit links only), comparison of 2 to 4 (checkboxes), and cart proposals (add, set quantity, remove).
- **Cart:** a separate **demo cart** held in page state. A proposal is shown with Confirm and Cancel and changes nothing until Confirm; Cancel leaves the cart as it was; a confirmation applies once; invalid quantity, unknown product, out-of-stock and removing a product not in the cart are refused with a message. The real storefront cart (`valta.cart.v1`) is never read or written (checked in a real browser).
- **Labelling:** a banner states that it runs only in the browser, is not the VOLTA.LK assistant and is not connected to the ERP or any server; every card carries a "Demo data" badge and "(demo)" availability.
- **Design:** white surface, blue `#2563EB` primary, mobile-first (single column, 44px controls, scrolling tables), loading, empty and error states, provisional Sinhala labels.
- **Not done, by instruction:** no chat proxy route, no server-to-server HMAC from the website, no exposure of Agent endpoints, no deployment. The website does **not** have the assistant integrated.

## 6. Router

- Kept: "computer accessories" now searches that category (the phrase is removed from accessory-cue scoring only).
- Kept: a bare noun such as "keyboards" (and "laptops", "phones") still gets a clarification request. "show me keyboards" searches. Bare-category routing was not broadened; that needs a separate evaluation.

## 7. Changed files (this milestone, final state)

Agent (`apps/agent`):

- Source: `src/backend/{wire,transport,types,site,catalogue,mock-backend,cards}.ts`, `src/mock/{erp-fixture,site-data,stack}.ts`, `src/contract/{schemas,compat}.ts`, `src/http/server.ts`, `src/tools/definitions.ts`, `src/pipeline/routing-pipeline.ts`, `src/router/{router,types,templates}.ts`, `src/router/lexicon/concepts.ts`, `src/config.ts`, `.env.example`, `README.md`.
- Tests: `tests/unit/{wire,backend-tools,config,contract,definitions}.test.ts`, `tests/integration/{mock-erp-contract,m1c-pipeline,m1c-catalogue,m1c-remediation,m1c-compare4,routing-pipeline,http}.test.ts`, `tests/fixtures/pipeline-helpers.ts`.

Web (`apps/web`):

- New: `src/components/assistant/{types.ts,labels.ts,cards.tsx,demo-shell.tsx}`, `src/lib/assistant-demo/{data,controller}.ts`, `src/app/(store)/assistant-demo/page.tsx`.
- Tests: `tests/unit/assistant-{cards,demo-controller,confirm-interaction,demo-gate}.test.ts`, `tests/e2e/assistant-demo.spec.ts`.
- Modified: `tests/mock-erp/server.ts` (opt-in extended catalogue, warranty passthrough), `playwright.config.ts` (enables the demo flag for the e2e build only), `.env.example` (documents the flag, default false).

Docs: this report and `AI_M1_C_REVIEW_REMEDIATION.md`. Root `package.json` and `package-lock.json` carry the earlier approved workspace registration.

## 8. Test results

| Suite | Result |
|---|---|
| Agent (vitest) | 30 files, **568 tests passed**, 0 failed, 0 skipped |
| Web (vitest, unit and integration) | 16 files, **191 tests passed**, 0 failed, 0 skipped |
| New browser spec `tests/e2e/assistant-demo.spec.ts` (Playwright, desktop Chromium) | **3 passed**, 0 skipped |
| Agent typecheck (`tsc --noEmit`) | 0 errors |
| Web typecheck | 0 errors |
| ESLint, web: all changed or new files (components, lib, demo page, unit and e2e specs, mock ERP server, Playwright config) | clean |
| ESLint, agent | **not run: the agent package has no ESLint configuration**; `tsc` strict typecheck is its static check |

Coverage by area:

- Contract compatibility: `contract.test.ts` (versions, 2 to 4 card limits), `m1c-compare4.test.ts` (downgrade, JSON and stream negotiation, unsupported version rejected).
- Cart confirmation interaction: `assistant-confirm-interaction.test.ts` (Confirm and Cancel handlers, no call before a click, buttons removed after a decision), `assistant-demo-controller.test.ts` (confirmation-gated reducer) and the real-browser spec.
- Mock catalogue consistency: `m1c-remediation.test.ts`, `mock-erp-contract.test.ts` (25 products over HTTP).
- Earlier suites (search, details, comparison, stock, accessories, order isolation, injection, fact-source verification, Sinhala review, ERP failure) still pass.
- Not run: the pre-existing Playwright specs for the storefront (the extension is opt-in and the web integration tests that read the mock ERP pass), real-model (Ollama) tests, any soak test.

The browser spec caught two defects that the unit tests missed, both fixed: an error thrown inside a React state updater escaped its handler, and no feedback was shown after Confirm or Cancel.

## 9. Security results

- Unsafe prompts (injection, price manipulation, exfiltration, card, OTP, password and NIC patterns) are stopped before the ERP, any model and any tool (zero calls).
- Hostile catalogue text is treated as data and escaped by the UI.
- Guests receive no order data in any language; customers see only their own orders; a foreign reference gets a generic not-found.
- Cart actions always carry `confirm:"ask"`, and the demo cart changes only after an explicit Confirm. No code creates an order, pays, applies a discount or writes to the ERP.
- Identity comes only from the HMAC signature (a body-supplied customer id is rejected). HMAC, replay protection and logging restrictions are unchanged.
- Version negotiation fails closed: an unknown `contractVersion` is rejected before any processing.
- Production wiring never imports `src/mock` (enforced by test). The demo page is 404 unless explicitly enabled, has no server logic and does not touch the real cart.
- `needsNativeReview` is still enforced by the response contract for any Sinhala, Singlish or mixed output.

## 10. Known limitations

- **The website assistant is not integrated.** The demo is a local, browser-only harness over built-in demo data. A real integration needs the chat proxy route, HMAC signing from the website and an Agent URL, which were not authorized. See the remediation document for the proposed files and controls.
- The demo's 11 products are a separate copy of a slice of the mock catalogue (not fetched from the Agent), so it shows the cards, not the assistant's understanding of messages. It has no free-text chat.
- No screenshots were taken. Mobile layout is by design (responsive classes) and not covered by a mobile browser test.
- The 10 extended products must be kept identical in `apps/agent/src/mock/erp-fixture.ts` and `apps/web/tests/mock-erp/server.ts` by hand (a test fails on drift). The web mock ERP serves them only with `MOCK_ERP_CATALOGUE=extended`.
- Bare category nouns ("keyboards", "laptops", "phones") ask for clarification by design.
- The 89/100 English and the Sinhala evaluation results are developer-authored and in-sample. They are not production accuracy and independent evaluation is still needed.
- Sinhala, Singlish and the Sinhala UI labels are provisional and need native review. Sinhala production readiness is not claimed.
- The real ERP's behaviour beyond the repo's mock server is untested.
- Handler-level interaction tests replace React state with a recorder (the web workspace has no DOM library); the browser spec covers the real click path for the demo.
- The agent package has no ESLint setup.

## 11. Remaining M0 blockers

- B2: a staging ERP (the website host runs a `volta-mock-erp` container).
- B3: tunnel and AllowUsers approval.
- B5: native Sinhala reviewers.
- B6: legal sign-off.
- B9: root password reset. The website server's root password was shared in chat earlier and should be rotated.

## 12. Confirmation

No production ERP, production database or real customer data was accessed. Only the repo's mock ERP server (loopback, test credential), in-memory fixtures and built-in demo data were used. No checkout, order creation, payment, discount execution or server-side cart mutation exists. SSH, firewall, Ollama configuration, server networking and deployment configuration were not touched, no voice code was added, and nothing was committed, pushed or deployed.
