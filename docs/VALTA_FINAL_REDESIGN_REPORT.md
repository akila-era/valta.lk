# VALTA.LK: Final redesign report

Branch: `feature/storefront-redesign`. Nothing has been committed, pushed or deployed. Companion document: `docs/VALTA_FINAL_UI_UX_AUDIT.md` (route inventory, findings, scorecard).

**Testing basis.** Everything below was verified in a Chromium browser (desktop and phone emulation) against the **mock ERP** (25 sample products) with a disposable in-memory database. Nothing was tested against the real ERP or the live site, and nothing on real phones. Product photos in the mock ERP are placeholder shapes, so photographic quality is unverified.

## 1. Executive summary

The storefront was already coherent and honest, so this round was targeted rather than a rebuild. The brand moved from blue to **black and signature orange**, the homepage hero became a **real-product slider**, the header stays **white** (with the black information bar above it and a black footer, orange accents), search gained **brand and category suggestions**, category, brand and product pages gained introductions and a recently-viewed shelf, and a read-only recently-viewed API was added under tight limits. The cart, checkout, order creation, payments, authentication, ERP sync, prices, stock, variants, wishlist and order tracking were not changed.

## 2. Design system

**Colour tokens** (`apps/web/src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| ink | `#111111` | Headings, top information bar, footer, hero background |
| bg | `#FFFFFF` | Reading surface, product cards |
| surface | `#F5F5F5` | Secondary background, filters, collections |
| border | `#E5E5E5` | Dividers and outlines |
| muted | `#6B6B6B` | Secondary text (see note) |
| brand-500 | `#F97316` | Signature orange: fills (primary buttons, badges, progress) and accent on black |
| brand-400 | `#FB923C` | Hover fill |
| brand-600 | `#C2410C` | Orange text and links on light surfaces |
| brand-700 | `#9A3412` | Strong orange text, tinted chips |
| brand-50 / 100 | `#FFF7ED` / `#FFEDD5` | Light orange tints |

**Contrast rules (measured).** Black text on `#F97316` is 6.7:1, so every orange fill carries black text (class `text-on-brand`, fixed `#111111`). White on `#F97316` is only 2.8:1 and is never used. Orange text on white uses `#C2410C` (5.2:1) or `#9A3412` (7.3:1). `#F97316` on black is 6.7:1 and is used for accents on black. Info notices were blue and are now neutral grey.

**Deviation from the brief, on purpose.** The brief lists muted text as `#737373`. That is 4.74:1 on white but only 4.35:1 on the soft grey surface, which fails AA for normal text, so the slightly darker `#6B6B6B` already in the project is kept.

**Header.** The main header and navigation are white, as before, with orange accents and a black information bar above them. A black header was built with a scoped dark token set and then reverted at the owner's request; that scope was removed from the code. The black footer and the black hero are unchanged.

**Typography, spacing, radii.** Unchanged and already consistent (Inter, a large editorial display scale, 4px-based spacing, `container-wide` and `container-page`, rounded-2xl to 2rem surfaces, one soft shadow family). **Icons:** Lucide throughout.

## 3. What changed

**Homepage.** Black-and-orange hero slider ("Technology. Elevated."): up to three real, in-stock catalogue products (staff-featured, newest, and one with a real sale price), each in a lit display window with name, price, stock and a tag saying why it is there; numbered progress indicators, previous and next arrows and a pause control (WCAG 2.2.2); pauses on hover and focus; no autoplay with reduced motion; swipe on phones; branded VALTA wordmark when no photographed product exists. Brand showcase after the categories (real brands, largest range first, staff logos if uploaded, "View all brands"), recently viewed (browser-local, hidden without history), swipeable budget cards on phones.

**Header and footer.** White header with orange accents (cart and wishlist counts, search button, active states) on desktop and phone; "Brands" in the desktop header and in the phone chip strip now opens `/brands` (the homepage brand section keeps its `/#brands` anchor); footer gained Brands and My account links (account only when accounts are enabled).

**Search.** Suggestions now show real **brands** and **categories** above products, from data the search API already returns (no backend change), with ARIA groups and keyboard arrows across all rows.

**Category, brand and product pages.** Category header with photo and sub-category chips with real counts; brand header with the brand name, count, a real product photo and the staff logo if uploaded; `/brands` directory (A to Z); recently viewed on product pages.

**Recently viewed API** (`/api/store/recent`, approved with conditions). GET only; at most 12 validated product IDs; fixed allowlist of public fields; no description, variants, specs, barcode, cost or supplier data; no tenant or address from the request; only the shared published catalogue; unknown IDs ignored, duplicates removed; rate limited to 60 requests per minute; no write handlers. Seven integration tests cover this.

**Information pages (About, Contact, FAQ, Shipping, Returns, Privacy, Terms).** A visual audit of the remaining pages found the cart, checkout, account and order tracking already polished and on-brand, so their layouts were left alone. The information pages sat in a narrow left column with about a third of the desktop screen empty, so their shared layout got a soft-grey header band (matching the category and brand pages) and, on large screens, a sticky "Need a hand?" panel that shows only contact details the business has published in the site settings (today: the phone number; email and hours appear when configured; nothing is shown if neither phone nor email is set). The Contact page has no panel because it already lists those details. Their content, the approval notices and all business text are unchanged.

## 4. Business logic preserved

ERP catalogue integration, product IDs, prices, stock, variants, brands, categories, cart store, wishlist, authentication, customer accounts, checkout, payment handling, order creation, order tracking and tenant isolation were not modified. No database schema change. No unrelated backend change. The only new server code is the read-only recently-viewed endpoint.

## 5. Deliberately not built

- **Newsletter section:** the backend has no newsletter feature; it needs a separate approval.
- **Product comparison:** ERP specifications are free-form text pairs and the sample data has none, so a comparison would be empty or invented.
- **Best Sellers and Trending:** no sales or popularity data exists.
- **Trust claims such as "Genuine products", "Warranty support" and "Islandwide delivery":** not shown, because the business has not confirmed them. The site supports confirmed claims through the `SITE_HIGHLIGHTS` setting without code changes.
- **Reviews, testimonials, installment promises, invented delivery times:** none.

## 6. Test results

All results are from the **mock ERP** with a disposable in-memory database, in a Chromium browser (desktop and phone emulation). None are from the real ERP, the live site or real devices.

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Clean |
| ESLint (`src` and `tests`) | Clean |
| Production build (`next build`) | Succeeded (also run by the Playwright web server before each run) |
| Unit and integration tests (vitest) | **198 / 198 passed** (17 files), including 7 new tests for `/api/store/recent` |
| Full Playwright suite (desktop and mobile projects) | **138 / 138 passed** on the last complete run (13.5 min). That run was made BEFORE the final navigation, information-page and white-header changes. A later run on the final tree was stopped midway at the owner's request, so the final tree has **not** been verified by a full Playwright run by me; the reviewing session is to run it. |
| Responsive check, homepage and `/brands` at 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440 px | No horizontal overflow and no console errors at any width |
| Route check, 19 routes at 1440 and 390 px (38 views) | No horizontal overflow, no console errors |
| Customer journey, at 1440 and 390 px | Register, wishlist, search, filters, quick view, cart drawer, cart, three-step checkout, order confirmation, tracking, account: **0 failed steps** |
| Hero at 10 widths (taken with the black header; the hero itself is unchanged) | Height 0.99 to 1.03 screens on phones, 1.17 to 1.27 on tablets, 0.68 on desktop; both buttons 48 px tall; headline white |

**Playwright history, reported honestly.** The first full run on the finished code had 5 failures. Three were caused by my changes and were fixed: an older search test that assumed the first suggestion is a product, a footer "Brands" link that made a navigation locator ambiguous, and the pause button still showing under reduced motion. The other two (clicking "Add to cart" on a product page) passed when re-run on a calmer machine. The second full run had 6 failures: one admin-editor test timed out and its leftover state made four others fail, plus one tight 5-second order wait. The admin-editor test, a roughly 200-line walkthrough, takes about 33.5 s on this machine and its default limit is 30 s, so I raised that one test to 90 s. I do not have an earlier timing to prove my changes did not add to its duration. The third full run was clean. Host CPU swung between 14 percent and 100 percent during the session (other programs on the machine), and load is the most likely cause of the flaky tests; a reviewing session saw the same pattern.

**Not yet executed.** Three tests added after that run (Brands link in the header and phone strip, the information-page contact panel, header tap targets) have not been run. Typecheck and ESLint are clean on the final tree; vitest was last run at 198 / 198 just before these edits.

**New tests added this round.** Hero slider (real products, distinct, indicators, arrows, pause, autoplay, reduced motion), search suggestions (brands and categories, with counts, keyboard use, nothing invented), recently viewed, brand and category pages, `/brands`, sitemap, and the footer links.

**Accessibility.** Contrast ratios are listed in section 2 and were calculated. Reduced motion, tap targets and the autoplay pause control (WCAG 2.2.2) were checked by me and then independently by a second Claude session that reviewed the finished tree. Its results, with what each one covers:

| Check | Result | Basis |
|---|---|---|
| Automated axe scan, WCAG 2 A and AA (before the white-header change) | **0 violations** over 96 route and viewport combinations (32 routes at 1440, 390 and 320 px, including `/brands`, the brand filter, a category with sub-category, a product page, checkout and account) | Mock ERP, Chromium emulation |
| Layout audit at 320, 390, 1440 px (23 pages) | No horizontal overflow, no clipped text, no off-screen elements, no error pages | Mock ERP, Chromium emulation |
| Hero slider | One indicator per slide; Next and Previous work; inactive slides are `aria-hidden`; Pause stops auto-advance (watched for 9 s); with reduced motion there is no auto-advance (watched for 10 s) and no endless animation | Mock ERP, Chromium emulation |
| Header (checked while it was black) | Visible focus rings; text contrast 4.5:1 or better. **The header was then changed back to white, so these header results and the axe scan above describe the earlier black-header tree and have not been repeated for the white header.** | Mock ERP, Chromium emulation |
| Search suggestions | Brands, Categories and Products are ARIA groups; arrow keys move the active option and exactly one is selected; Enter follows it; Escape closes | Mock ERP, Chromium emulation |
| Recently viewed | Lists earlier products, leaves out the current one, keeps IDs under `valta.recent.v2`, removes the old v1 list, Clear is 40 px or more | Mock ERP, Chromium emulation |
| Recent API | Malformed IDs rejected with 400; list capped | Mock ERP, integration tests |

Two small tap-target findings from that review were fixed afterwards: the header logo link was 34 px tall at 320 px, and the desktop "Support" link was 20 px tall. Both now have a hit area of 44 px or more (the logo gains padding with a matching negative margin, so nothing moves; "Support" gains a minimum height), and a Playwright test guards both.

**What was not verified by anyone.** Real devices (phones, tablets, Safari, Firefox); screen readers (VoiceOver, TalkBack, NVDA); the real ERP; real product photographs; real-network speed. All of the above is browser emulation against the mock ERP.

**Machine notes.** The host was heavily loaded during the runs (CPU between 14 and 100 percent, other programs running), and the reviewing session recorded two sleep events that caused network errors in its earlier runs; it used a keep-awake process for its final runs.

**Performance (measured, lab only).** Production build, mock ERP on localhost, Chromium, five loads per page, median reported. Largest Contentful Paint and layout shift:

| Page | Viewport | LCP | CLS |
|---|---|---|---|
| Home | desktop 1440 | 1148 ms | 0.000 |
| Home | phone 390 | 756 ms | 0.000 |
| Product list | desktop / phone | 600 ms / 648 ms | 0.000 |
| Product page | desktop / phone | 648 ms / 412 ms | 0.000 |

The first measurement found my hero entrance animation (a fade from fully transparent) delayed the homepage LCP to 1568 ms on desktop and 1436 ms on phone; replacing it with a slide-up that does not fade cut those to 1148 ms and 756 ms. JavaScript transferred is about 0.55 to 0.58 MB per page. These numbers use placeholder product images served from localhost, so real photographs over a real network will be slower. No Lighthouse score was produced and no claim is made about real-world speed.

## 7. Remaining limitations

- **Mock data only.** Nothing was tested against the real ERP or live site. Product photography quality, galleries with several images, key features, compatibility and warranty blocks depend on real ERP data and could not be judged.
- **Real devices.** Not tested. All checks are browser emulation.
- **Not redesigned beyond the shared brand.** About, Contact, FAQ, the policy pages, cart, checkout, account and order tracking keep their existing layouts and content and take the new colours and header automatically. They were already clean and honest, and their content is limited to verified facts. FAQ search and an expanded About story were not built.
- **Recent searches** were not built.
- **Product comparison, newsletter, and unconfirmed trust claims** were deliberately not built (see section 5).
- **Screenshots.** The `after-*` images in `docs/final-audit-screenshots/` were taken with the black header and are out of date for the header area; they have not been retaken.
- **Palette notes.** The AI-assistant demo cards use the darker orange `#C2410C` because their buttons keep white text. Informational notices changed from blue to neutral grey. The old blue appears only in the "before" screenshots.
- **Admin test timeout.** One admin-editor test now has a 90-second limit.
- **Accessibility.** Verified by axe and manual checks in emulation only (see section 6); real devices and screen readers are untested.
- **Tablet hero height.** At 768 px the hero is 1.27 screens tall, near the previous 1.3 limit.
- **Business decisions open:** whether a newsletter backend is wanted; which trust claims (genuine products, warranty, islandwide delivery) the business can confirm, to be set through `SITE_HIGHLIGHTS`.

## 8. Files changed

**Black-and-orange pass and hero (this round).** New: `src/components/home/hero-slider.tsx`. Replaced: `src/components/home/hero.tsx`. Edited: `src/app/globals.css` (tokens, `.theme-dark`, `text-on-brand`, animations), `src/app/(home)/page.tsx`, `src/app/icon.svg`, `src/components/layout/{header-shell,mobile-category-chips,category-nav,footer,search-box,cart-link,wishlist-link,back-to-top}.tsx`, `src/components/products/{product-card,add-to-cart-button}.tsx`, `src/components/{checkout/checkout-form,orders/order-tracker,home/video-showcase,home/home-sections,home/device-art,brands/brand-tile}.tsx`, `src/components/admin/{shell,ui,dashboard-ui}.tsx`, `src/components/assistant/{cards,demo-shell}.tsx`. Removed: `public/images/home/valta-hero-flatlay.webp` (the earlier flat-lay hero photo, no longer used). Tests: `homepage.spec.ts`, `discovery-pages.spec.ts`, `customer-pages.spec.ts`, `storefront.spec.ts`, `product-content-qa.spec.ts`, `tests/unit/assistant-cards.test.ts`.

**Earlier rounds on this branch.** New: `/brands` page, brand and category headers, brand showcase, recently viewed (store, tracker, shelf), `src/lib/recent-products.ts`, `/api/store/recent` and its tests, `discovery-pages.spec.ts`. Edited: the category, product list and product detail pages, `sitemap.ts`.

## 9. Final quality scorecard

| Area | Score (1 to 5) | Note |
|---|---|---|
| Brand identity | 4.5 | Black and orange applied through tokens everywhere, with measured contrast |
| Homepage and hero | 4.5 | Real-product slider and editorial sections; photography unverified with real images |
| Header and navigation | 4 | White with orange accents; Brands now opens the directory; tap targets fixed |
| Search | 4 | Brands, categories and products with keyboard support; no recent searches |
| Listing, category, brand pages | 4 | Introductions, chips, filters, counts from real data |
| Product detail | 4 | Strong buy box; richer blocks need real ERP data |
| Cart, checkout, account, tracking | 4 | Preserved and honest; restyled by the shared system only |
| Information pages | 3 | Consistent and correct, not expanded |
| Mobile | 4 | Checked in emulation only |
| Honesty of data | 5 | No invented content |
| Performance | measured, lab only | See section 6; no real-world claim |
| Accessibility | 4 | Contrast and targets checked; axe rerun pending |

