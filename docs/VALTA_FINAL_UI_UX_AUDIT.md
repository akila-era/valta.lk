# VALTA.LK: Final UI/UX audit

Audit date: 23 Nov 2026. Branch: `feature/storefront-redesign`. Scope: every customer-facing page.

**How this was done.** The storefront was run locally against the mock ERP (25 sample products) with a disposable in-memory database, never a real ERP or database. Every route was loaded at 1440px and 390px in a Chromium browser (desktop and phone emulation, not real devices). The full customer journey was also driven end to end: register, wishlist, search, filters, quick view, cart drawer, cart, three-step checkout, order confirmation, order tracking and the signed-in account. Screenshots are in `docs/final-audit-screenshots/` (`before-*` were taken at the time of this audit, `after-*` on the finished production build).

**Limits of this audit.** Product photos in the mock ERP are placeholder shapes, so photography quality, gallery thumbnails with several images, key-feature lists, compatibility and warranty blocks could not be judged. Those depend on real ERP data. Performance was not measured. Real-device behaviour was not tested.

**Reference sites.** Studied with a real browser, not copied:
- *Accenova.lk*: a full-width slider hero (cinematic blue studio scene, brand-supplied product artwork, numbered progress indicators and arrows) above a row of dark category tiles. The artwork is theirs and is not reproduced.
- *UGREEN Sri Lanka*: a three-layer WooCommerce-style header, a sidebar hidden behind a toggle, thin filters (stock status and category only), no search suggestions, numbered pagination, and delivery and warranty information placed far from the buy box. Its product page shows conflicting prices and mixed currency labels. VALTA already does better on filters, suggestions and buy-box trust information, and should not copy those weaknesses.

---

## 1. Route inventory

| Route | Purpose | Notes |
|---|---|---|
| `/` | Homepage | Hero, categories, brands, discovery tabs, budget, recently viewed, benefits, campaigns, ordering, FAQ |
| `/products` | All products, filters, sort, pagination | `?brand=` shows a brand introduction |
| `/categories/[slug]` | Category listing | Header with photo and sub-category chips (`?sub=`) |
| `/brands` | All brands, A to Z | Added this branch |
| `/products/[slug]` | Product detail | Gallery with thumbnails, options, quantity, add to cart, buy now, delivery information, related, recently viewed |
| `/search` | Search results | Header search shows live suggestions |
| `/wishlist` | Saved products | Browser-stored |
| `/cart`, `/checkout` | Cart and three-step checkout | Cash on delivery |
| `/order-confirmation/[ref]` | Confirmation | |
| `/track-order` | Order status by reference | |
| `/account`, `/account/login`, `/register`, `/forgot-password`, `/reset-password` | Customer account | Overview, orders, profile, addresses note |
| `/about`, `/contact`, `/faq`, `/shipping-policy`, `/returns-policy`, `/privacy-policy`, `/terms` | Information pages | |
| `/assistant-demo` | Local demo page | Off in normal builds |

Public APIs used by the storefront: `/api/store/products`, `/api/store/recent` (read-only, public fields only), `/api/store/availability`, `/api/store/settings`, `/api/store/recommendations`, `/api/store/accessories`, `/api/store/reservations`, `/api/store/orders`, account routes, `/api/brand-logo/[id]`, `/api/banner-image/[id]`, `/api/media/[id]`. Admin routes are out of scope.

## 2. What exists and works well (preserve)

- **One coherent system.** Black, white, soft grey and one accent (blue at the time of this audit; changed to signature orange #F97316 with black text in the pass that followed this audit); consistent radii, type scale, buttons, chips and focus rings. The muted text colour is deliberately slightly darker than the brief's #737373 to keep AA contrast on grey surfaces.
- **Listing.** Sort control, price range, brand filter, availability filter, **active-filter chips with Clear all**, phone filter drawer, numbered pagination, helpful empty state with a category shortcut.
- **Product cards.** Wishlist, quick view and add to cart on hover or always visible on touch; genuine discount badges only; real stock labels.
- **Search.** Live suggestions with thumbnails, brand, SKU and price; "See all results" link; keyboard operable.
- **Quick view and cart drawer.** Phone bottom sheet and desktop modal; accessible dialogs.
- **Product page.** Thumbnails in the gallery, option chips with unavailable states, quantity, add to cart and buy now, delivery and returns facts beside the buy box.
- **Cart and checkout.** Clear price breakdown with the ERP delivery charge, three-step checkout with inline validation, order summary on top for phones, honest cash-on-delivery messaging.
- **Order tracking and account.** Four-step progress using the real status; it states that step times are not recorded rather than inventing them. The account says addresses are entered at checkout and not stored, rather than faking an address book. Order history, order details, profile.
- **Honesty.** No invented reviews, sales figures, discounts or stock levels anywhere.

## 3. Findings

All findings come from the evidence above. "Evidence" is a screenshot or measured result.

| # | Finding | Where | Evidence | Priority |
|---|---|---|---|---|
| 1 | Homepage hero was a static split layout; the brand wants a premium, product-led, studio-lit hero with real catalogue photography and, where genuinely useful, a slider | Homepage | `docs/homepage-redesign-screenshots/` | **P1**, done: real-product slider |
| 2 | Search suggestions list products only. No brand or category suggestions, although both exist in the catalogue | Header search, phone search | `before-final-390-search-overlay` | **P1**, done |
| 3 | Category pages were only a title and count. No imagery or sub-category navigation above the grid | `/categories/*` | `audit-1440-category` | Done in this branch |
| 4 | A brand-filtered list had the heading "All products" with no brand context | `/products?brand=` | `audit-390-brand-filter` | Done in this branch |
| 5 | Product pages had no recently viewed shelf | `/products/[slug]` | `audit-1440-product` | Done in this branch |
| 6 | Empty cart: the first "New arrivals" image is the Largest Contentful Paint but is not loaded eagerly (Next.js dev warning, reproduced 4 of 4 loads) | `/cart` | console warning | P2 |
| 7 | React hydration mismatch warning seen once on `/account/register` in development, not reproduced in five later loads | `/account/register` | console, single occurrence | P2: watch, investigate if it recurs |
| 8 | Information pages (About, Contact, FAQ, policies) sit in a narrow left column with about a third of the desktop screen empty and no visual anchor. Content is verified, so it cannot be expanded with claims | `/about`, `/contact`, `/faq`, policies | `audit-1440-about`, `audit-1440-contact` | P3, done: header band and a published-details contact panel |
| 9 | No recent-searches list (optional in the brief; would need to stay local to the browser) | Search | | P3 |
| 10 | Header "Brands" link went to `/#brands`; `/brands` was not linked from the footer or phone menu | Navigation | | P3, done: header and phone chip now open `/brands`, footer links it |
| 11 | No newsletter section. The backend has no newsletter feature, so none can be built without a backend change | Homepage | | Needs approval |

No accessibility violations, horizontal overflow, console errors or clipped text were found by my route checks at 1440px and 390px. A second review session reported zero axe WCAG A/AA violations across 96 route and width combinations; that is its measurement, not mine.

## 4. Design scorecard (1 to 5, with the reason)

| Area | Score | Reason |
|---|---|---|
| Visual consistency | 4 | One system across all pages; small gaps only in the information pages |
| Homepage | 4, 5 once the hero lands | Strong sections, honest data; the hero was the weakest part |
| Product listing and filters | 4 | Complete filtering with chips; clean mobile drawer |
| Category and brand pages | 4 | Headers added this branch |
| Product detail | 4 | Strong buy box and trust facts; richer blocks depend on ERP data |
| Search | 3 | Good suggestions but products only |
| Cart and checkout | 4 | Clear, honest, mobile-friendly |
| Account, orders, tracking | 4 | Real status only; nothing invented |
| Information pages | 3 | Readable, correct, but plain |
| Mobile | 4 | Dedicated phone patterns: bottom sheets, filter drawer, sticky purchase bar, swipe rows |
| Honesty of data | 5 | No invented data found |
| Performance | not measured | No claim is made |

## 5. Prioritised plan

1. **Hero slider** (P1): real in-stock products from the catalogue shown one at a time in a lit display window, with numbered progress indicators, arrows and a pause control; no motion for reduced-motion users; branded fallback when no photographed product exists.
2. **Search suggestions** (P1): add brand and category groups drawn from the catalogue.
3. Cart LCP image priority and the register hydration watch (P2).
4. Information page structure (P3); recent searches (P3, local only).
5. Decisions for the business: footer and phone-menu link to `/brands`; whether a newsletter backend is wanted.

## 6. Things deliberately not changed

Cart, checkout, order creation, payment handling, authentication, ERP sync, prices, stock, variants, wishlist, order tracking and the database schema are unchanged. The `/api/store/recent` endpoint is read-only, accepts at most 12 validated product IDs, takes no tenant or address from the request, is rate limited, and returns only a short list of public fields.

## 7. Status after the redesign pass

P1 items 1 and 2 are done. Findings 3 to 5 were done earlier on the branch. Findings 6 (empty-cart image priority) and 7 (single register-page hydration warning) were not changed in this pass: 6 is a development-only warning that could not be confirmed in the production build, and 7 did not recur. Findings 8 to 11 remain open as listed. See `docs/VALTA_FINAL_REDESIGN_REPORT.md` for results, measurements and limitations.

## 8. Remaining pages review (cart, checkout, account, order tracking)

Reviewed after the palette change at 1440 and 390 px. Cart, three-step checkout, order confirmation, the signed-in account and order tracking are clean, on-brand and honest (the tracker says step times are not recorded; the account says addresses are not stored). Orange fills carry black text, the current checkout and tracking step is an orange dot with a black number, and links are in the darker orange. No layout change was needed and none was made. Tap-target findings from the second review (logo link at 320 px, "Support" link at 1440 px) were fixed. The empty-cart first-image priority warning (finding 6) remains a development-only note.

Note: the screenshots named `after-*` were captured with a black header that was later changed back to white at the owner's request, so the header area in them is out of date.
