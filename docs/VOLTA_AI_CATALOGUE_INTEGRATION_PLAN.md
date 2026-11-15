# How the catalogue reaches the AI, and what was improved locally

Date: 2026-11-14. Written for: the project owner and the engineers. Status: facts below were read from the code and from the live (read-only) relay; the improvement in section 4 is **local and uncommitted**.

## 1. The path today (verified)

```
ERP store API (api.shop.hexalyte.com)         website database (ProductContent: staff-entered content)
        │ Bearer credential, on the website only          │
        ▼                                                 ▼
website erpRequest()  ── /api/internal/ai/erp/*  (signed, read-only relay: settings, products, one product, [new] content)
        │  HTTPS, HMAC (own key id "agent1"), anonymous identity only
        ▼
Agent SiteErpTransport ──► Catalogue (listing snapshot, 30 s) ──► mapProduct ──► ProductView ──► tools ──► cards
                                            ▲
                                  site content (specification rows)  ← [new, local] background refresh, 60 s
```

| Question | Answer | Evidence |
|---|---|---|
| Product ids | The ERP id, passed through unchanged; slug = name + id (the storefront's own rule) | `catalogue.ts` `productSlug` |
| Variant ids | The ERP variant `key`; the Agent never invents one | `wire.ts`, `mapProduct` |
| Prices and sale prices | Decimal strings from the ERP converted to integer cents; sale applies only while the ERP says the discount is active | `mapProduct`; verifier re-derives every card price |
| Stock | `availability` and `purchasableQuantity` per variant; details and stock checks read **live** (the ERP caps the quantity at 20 and the list-level figure is the largest variant, not a total) | `Catalogue.live`, audit |
| Freshness | The product list is a 30-second snapshot; if a refresh fails after one success the stale copy is used **with no upper age limit** (review finding F-07) | `Catalogue.raws` |
| Search | An in-memory scan of the snapshot (name, SKU, brand, model, category, variant labels): there is **no search index** and no ranking beyond the reasoning layer's own; fine for hundreds of products, to be revisited near thousands | `Catalogue.search` |
| Cache invalidation | By time only. A staff publish on the website invalidates the website's own cache at once, but the Agent learns of it at the next refresh | `content-overlay.ts`, `live-site-data.ts` |
| Specifications | Only from **staff-entered ProductContent rows** (website) and, as a fallback for three numbers, the plain-text description. The ERP supplies none | `mapProduct`, `reasoning/facts.ts` |
| Compatibility | Only from `AccessoryLink` rows (website). None exist today | audit |

## 2. Gaps found

1. **The real-data path had no website content at all** (the Agent was started with an empty site object), so even correct staff-entered specifications could never have reached an answer. *Fixed locally, section 4.*
2. The Agent's `mapProduct` keeps a spec row's name and value but drops its `group` and `unit`. The new content relay joins the unit into the value ("5000" + "mAh" becomes "5000 mAh"), which is what the number reader needs; the group is not used. *Handled at the relay.*
3. Accessory links and promotions are still not read by the real-data Agent (they stay empty), by design until the owner decides.
4. Production wiring: `src/main.ts` starts a disabled pipeline; the live service is started from the preview entry (`tests/real/preview-agent.ts`) bundled for the AI server. The deployed bundle works, but the production entry point should be moved into `src/` and the preview entry deleted (not done).
5. Review findings F-07 and F-08 (no maximum staleness, refresh stampede, no body size limit): the body limit was added locally (3 MB cap); maximum staleness and refresh de-duplication are still open.

## 3. What was verified about the contract

The relay refuses everything except four GET routes; only the anonymous identity is accepted; replay, stale, unsigned and wrong-key requests answer 404; unknown ids and query keys are refused; unit tests: `tests/unit/ai-catalogue-relay.test.ts` (9, web). The Agent side is covered by `site-transport.test.ts`, `m7-live-site-data.test.ts` and `m6-real-patterns.test.ts`. Real-catalogue behaviour was probed on a snapshot (see `AI_REAL_CATALOGUE_AUDIT.md`).

## 4. Local improvement made in this phase (not committed, not deployed)

- **Website:** a fourth read-only relay route, `GET /api/internal/ai/erp/content`, returning `{ items: [{ id, specs: [{ name, value }] }] }` from the **published** ProductContent only (never drafts), at most 5,000 items and 24 rows per item, with the same signature rules. Code: `src/lib/erp/content-overlay.ts` (`publishedSpecRows`), the route file. Tests added to `ai-catalogue-relay.test.ts`.
- **Agent:** `SiteErpTransport.getContent()` (strictly shaped, capped) and `createLiveSiteData()` (background refresh, last good copy served, a failing website never slows or breaks a chat, customer and promotion data never enter). `preview-agent.ts` now uses it when the catalogue URL is set. Test: `m7-live-site-data.test.ts` shows that **before** the first refresh the assistant says it has no camera data and **after** it ranks by the staff-entered number.
- **Effect today:** none on answers until staff publish specification rows for current products (only 1 of 7 has a content row, and it is empty).
- **Deploy order when approved:** website first (adds the route), then the Agent (uses it). An Agent that cannot reach the route simply keeps serving without specs.

## 5. Not done, and approvals needed

Deploying any of this; entering or importing specifications; changing the ERP; any data migration (see the specification schema and category proposals); moving the production entry point. Nothing was written to any database or server.
