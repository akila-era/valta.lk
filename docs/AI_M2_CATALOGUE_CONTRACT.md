# M2: read-only catalogue contract (design only)

Status: **a contract.** No code was written for it, nothing connects to any ERP, staging or production, and no customer data is involved. It becomes real only after the approvals in section 12.

Written for: the engineers who will build M2 and the owner who approves the staging connection.

## 1. What exists today (verified in the repository)

| Fact | Evidence |
|---|---|
| The Agent's shopping tools run against a **mock** backend: an in-memory ERP fixture or an HTTP transport to a local mock ERP | `apps/agent/src/backend/{transport,wire,catalogue,cards}.ts`, `src/mock/*` |
| The Agent already has strict, read-only wire types for the ERP store API (money as a decimal string, `{success, data}` envelope, additive fields ignored), and a `ProductView` with variants, prices (integer cents), availability, specifications and update time | `src/backend/wire.ts`, `types.ts` |
| The website has an ERP client with a cached catalogue snapshot, a live single-product read, settings, availability and order tracking | `apps/web/src/lib/erp/*` |
| **The website has no `/api/internal/ai/*` endpoints**; only `/api/internal/sync-orders` exists | `apps/web/src/app/api/internal` |
| The ERP endpoints the store uses: `GET /ping`, `/settings`, `/catalogue/products` (cursor, `limit` up to 100, `updatedSince`), `/catalogue/products/{id}`; orders and reservations are write endpoints the assistant never calls. Auth is a Bearer store credential; the rate limit is about 300 requests per minute per website | `docs/ERP_INTEGRATION.md` |
| The ERP integration has **not** been verified against a live ERP; the real ERP code was run locally with a test shop only | same document |
| The architecture document already defines M2 as website-side tool backends under `/api/internal/ai/*`, HMAC-verified, reusing the website's own server code | `docs/AI_AGENT_ARCHITECTURE.md` sections 8.1 and 8.2 |
| Real warranty facts exist in the ERP (`warrantyMonths`, `warrantyNote`) but the Agent's `ProductView` has **no warranty field** | `wire.ts` versus `types.ts` |

## 2. Decision: Agent to website to ERP

The Agent calls the **website's** internal endpoints; the website talks to the ERP. Reasons: one source of truth (slugs, sale-price logic, accessory links, promotions, specification content, privacy filters all live in the website); the ERP store credential stays on the website and **never reaches the AI server**; the website already enforces ERP rate limits and caching. The Agent's existing direct ERP transport stays as the mock and test path.

**Network path (needs a decision):** today the connection is only website to AI server (an SSH tunnel). M2 needs AI server to website. Options: (1) HTTPS to `https://valta.hexalyte.com/api/internal/ai/*`, accepted only with a valid signature (otherwise 404, as the existing internal route does) and, preferably, an nginx rule that allows only the AI server's address; (2) a reverse forward over the existing SSH connection. Either is an infrastructure change on the shared website server (nginx or sshd) and **needs separate approval**; until then M2 development uses loopback only.

## 3. Common rules for every endpoint

- **Authentication:** the existing request-signing scheme (headers `x-volta-key-id`, `-timestamp`, `-nonce`, `-identity`, `-client-ip`, `-signature`), replay-protected, but with a **separate key id and secret for the Agent to website direction**. Unsigned, stale, replayed or unknown-key requests answer `404`, identical to "endpoint off". The endpoints are off unless configured.
- **Method and body:** `POST` with a strict JSON body (unknown fields rejected), `GET` only for categories and vocabulary. Body at most 8 KB.
- **Envelope:** `{ "ok": true, "data": ..., "meta": { "storeId": "<opaque>", "source": "erp-live" | "snapshot", "generatedAt": "<ISO>", "ageSeconds": <int> } }` or `{ "ok": false, "error": { "code": "<code>", "retryAfterSeconds"?: <int> } }`. Error text is a code, never prose or internals.
- **Money:** `{ "cents": <int>, "text": "Rs. 129,000.00" }`, LKR, formatted by the **server**; requests use whole rupees (`minPriceLkr`, `maxPriceLkr`). The Agent and the model never compute or restate prices.
- **Text fields** (names, descriptions, specification values, offer names) are plain text, length-capped, HTML stripped, and are **untrusted data** to the Agent.
- **Identity:** the signed identity (`guest` or `customer:<id>`) is the only identity. Catalogue endpoints return public data; identity is used for rate limiting, audit and for showing customer-only offers to signed-in customers only.

## 4. Endpoints

All product objects use the shapes in section 5.

| Endpoint | Request | Response data | Notes |
|---|---|---|---|
| `GET /api/internal/ai/vocab` | none | `{ brands: string[], categories: {slug, name}[], products: {id, name, brand?, model?}[] }` | For the router's entity extraction; cached by the Agent for 5 minutes. Public names only; capped (for example 2,000 products) |
| `GET /api/internal/ai/categories` | none | `{ categories: { slug, name, productCount, subCategories: {slug, name, productCount}[] }[] }` | From the catalogue snapshot |
| `POST /api/internal/ai/search-products` | `{ query?, category?, subCategory?, brand?, minPriceLkr?, maxPriceLkr?, inStockOnly = true, onSale?, sort?: "newest" \| "price-asc" \| "price-desc" \| "name", limit: 1..8 = 5, cursor? }` | `{ items: ProductSummary[], total: int, nextCursor?: string }` | Pagination in section 7 |
| `POST /api/internal/ai/product-details` | `{ productId }` | `{ product: ProductDetail }` | Price and availability read **live** |
| `POST /api/internal/ai/compare` | `{ productIds: string[2..4] }` | `{ products: ProductDetail[] }` | Differences are computed from these facts in code, not generated |
| `POST /api/internal/ai/check-stock` | `{ productId, variantKey?, quantity?: 1..10 }` | `{ productId, variantKey?, availability, canFulfil?, requestedQuantity? }` | Always live; never reveals stock levels |
| `POST /api/internal/ai/accessories` | `{ productId, variantKey? }` | `{ sourceId, items: { kind, product: ProductSummary }[] }` | Only explicit staff-made links; never inferred from names |

The existing `cart-quote`, `cart-validate` and `order-status` endpoints from the architecture document are out of this contract's catalogue scope and stay customer-scoped.

## 5. Shared shapes

```
Money           { cents: int >= 0, text: string }
Availability    "available" | "unavailable" | "unknown"       (UNKNOWN and NOT_FULFILLABLE from the ERP map to unavailable/unknown)
ProductSummary  { id, slug, name, brand?, category?, imageUrl?, price: Money, salePrice?: Money, offerName?,
                  available: bool, updatedAt: ISO }
Variant         { key, label, storage?, color?, price: Money, salePrice?: Money, available: bool }
ProductDetail   ProductSummary + { subCategory?, model?, condition?, variants: Variant[], specs: {name, value}[],
                  description?: string (plain, capped), warranty?: { months?: int, note?: string },
                  publishedAt?: ISO, deliveryCharge?: Money (only when a live settings read succeeded) }
```
Rules: `salePrice` is present only while the ERP's discount is active and it is lower than `price`; `available` means at least one variant is purchasable; `maxQuantity` and stock counts are **not** exposed (the ERP caps purchasable quantity at 20 and the assistant must not present it as a stock level); `imageUrl` is absolute `https` on a host in `ERP_IMAGE_HOSTS`, or omitted; `slug` is the site's `slugify(name)-<ERP id>`; categories and specifications come from the ERP's brand, model, condition and warranty fields plus published website content (the ERP has no category slugs or spec table).

**Gap to close:** add `warranty` to the Agent's `ProductView`, to the wire mapping and to the product card and verifier, so warranty answers come from data and not from a model.

## 6. Backend-authoritative pricing and inventory

1. Every price, sale price, delivery charge and availability the shopper sees is read from this API in the same request that produced the card. Chat history is never a source.
2. Search listings may come from the snapshot (`meta.source = "snapshot"`, with `ageSeconds`); **product details, compare, stock checks and any cart proposal are live**.
3. If the snapshot is older than 5 minutes or the ERP is unreachable, the response is marked `degraded` and the assistant says prices or stock may have changed and to confirm on the product page; it never presents stale data as live.
4. A failed or timed-out read returns an error code; the assistant uses its fixed "could not check" template. It never invents or reuses an earlier value.
5. The Agent's existing verifier stays the last line: every card field must equal the tool result it was built from (already implemented and tested in M1-D).

## 7. Pagination

- `limit` 1 to 8 (chat cards), default 5. `nextCursor` is opaque, signed by the website, bound to the query and to the snapshot it came from, valid 10 minutes; at most 20 pages.
- A cursor for a snapshot that has since changed answers `cursor_expired` and the Agent restarts the query on page one, saying the list was refreshed. A tampered cursor answers `invalid_request` and counts towards abuse limits.
- `total` is the exact count within the same snapshot, so "show me more" cannot repeat or skip items.

## 8. Tenant isolation and authorisation

| Concern | Rule |
|---|---|
| Tenant | One website deployment serves one store (one ERP store credential). `meta.storeId` is an opaque hash of the store identity. The Agent is configured with the expected `storeId` and **rejects any response with a different one** (misrouted or cross-tenant) |
| Keys | One signing key id per tenant; keys are never shared between tenants or reused for the other direction |
| Cache | Every cache key (vocabulary, snapshot, product) includes the `storeId` |
| Customers | Catalogue data is public. Customer-only offers appear only for a signed `customer` identity; no endpoint in this contract returns personal data |
| Credentials | The ERP credential never leaves the website; no endpoint echoes it; logs never contain it |
| Abuse | Existing Agent rate limits apply; the website additionally caps AI traffic to its ERP budget (about 60 ERP calls per minute out of the shared 300) with per-tool caching |

## 9. Caching and freshness

| Data | Where | Time to live |
|---|---|---|
| Vocabulary, categories | Agent | 5 minutes |
| Catalogue snapshot (search) | Website | 60 seconds, refreshed in the background; `ageSeconds` reported |
| Product details, availability, stock check | Not cached for the answer | Live read (a 5 second coalescing window may merge identical simultaneous reads) |
| Accessory links, promotions, specification content | Website database | Read per request |

## 10. Error handling

`invalid_request` (400), `unauthorized` (404, indistinguishable from off), `not_found` (404 with body), `rate_limited` (429 plus `retryAfterSeconds`), `cursor_expired` (409), `store_mismatch` (raised by the Agent when `meta.storeId` differs), `erp_unavailable` (503 plus `retryAfterSeconds`), `upstream_changed` (502, the ERP answer did not match the expected shape; never forwarded). The Agent maps each to a fixed template and never shows an upstream message. A timeout is 8 seconds per call, one retry only for reads that are safe to repeat.

## 11. Response verification and hostile content

Strict typed parsing of every field; unknown fields ignored (additive contract); size caps (at most 8 items, strings 500 characters, descriptions 2,000, at most 40 specification rows per product); `price > 0` or `0` only for free items, `salePrice < price`, `currency` fixed to LKR; image host allow-list; control and invisible characters removed from text; hostile text (prompt injection, markup, links) kept as data and shown only inside cards, never given to a model as instructions. The existing M1-D hostile-content tests are the template.

## 12. Staging ERP integration (blocked until approved)

Nothing connects to any ERP until all of these exist (they are the open M0 blocker B2):
1. A **staging** ERP base URL (not production) and a **staging store credential** issued by the ERP owner, ideally read-only for the catalogue.
2. Staging products, prices, variants, images and warranty data seeded.
3. Your written approval to connect, and the approved network path from section 2.

Gating in code: the endpoints return 404 unless `AI_CATALOGUE_ENABLED` and the signing keys are configured, and the website refuses to start the AI routes if `HX_API_BASE` matches a production host list you provide. Production remains off.

## 13. Acceptance tests for M2

1. Contract tests for each endpoint against the **mock ERP** (success, empty, not found, ERP down, malformed upstream, slow upstream).
2. Property tests: money never negative, sale below list, no stock levels, images only from allowed hosts, nothing but allowed fields in responses.
3. Security: unsigned, replayed, stale, wrong-key and cross-direction-key requests all answer 404; tampered and expired cursors; `store_mismatch` on a response from another tenant; no credential in any response or log.
4. Hostile catalogue text fixtures through the whole pipeline (cards, verifier, Qwen prompts).
5. Pagination consistency under a changing snapshot.
6. Load check within the ERP budget; then the same suite against staging, only after section 12 is satisfied.
7. The Agent's existing 1,100-plus tests and the web browser suite stay green.

## 14. Decisions and approvals needed

1. Confirm the Agent to website to ERP design (section 2).
2. Choose the network path and approve the nginx or sshd change (section 2).
3. Staging ERP, credential and seeded data (blocker B2).
4. Approve adding warranty to the Agent's product model and cards.
5. Confirm the ERP request budget for AI traffic.
