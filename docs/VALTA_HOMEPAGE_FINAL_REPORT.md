# VALTA.LK: Complete homepage report

Branch: `feature/storefront-redesign`. Nothing from this round is committed, pushed or deployed. Companion documents: `docs/VALTA_FINAL_REDESIGN_REPORT.md` and `docs/VALTA_FINAL_UI_UX_AUDIT.md`.

**Testing basis.** Mock ERP (25 sample products) and a disposable in-memory database, in a Chromium browser (desktop and phone emulation). Nothing was tested against the real ERP, the live site or real devices. Product photos in the mock ERP are placeholder shapes, so photographic quality is unverified.

## 1. What UGREEN's homepage contains (studied in a real browser, top to bottom)

Hero slider, Shop by Category (12 tiles), New Arrivals carousel, customer reviews ("What People Say About Us"), a brand-story block, a Headphones and Earbuds collection, "Why Choose", Most Popular Products, a Fast-Charging collection, press quotes ("What the Pros Are Saying"), a Contact Us section and the footer. VALTA builds an original version of each relevant section, with its own black-and-orange identity, and leaves out anything the store has no genuine data for.

## 2. The homepage, top to bottom

| # | Section | VALTA version | Data it uses |
|---|---|---|---|
| 1 | Announcement bar | Black information bar: store note, delivery charge, cash on delivery, support, phone, Track Order, **About**, **Contact** | site settings and ERP settings |
| 2 | Header | White header: logo, search with brand, category and product suggestions, account, wishlist, cart, All Categories drawer (mega menu), **Shop**, Deals (only when real offers exist), Brands, New Arrivals; phone version with chip strip | ERP |
| 3 | Hero slider | Full-width black studio scene with an orange light; up to three real products one at a time; numbered progress indicators, previous and next, pause; no autoplay with reduced motion | ERP |
| 4 | Trust strip | Delivery charge, cash on delivery, order tracking, support number, plus any claim the business typed into `SITE_HIGHLIGHTS` | ERP and site settings |
| 5 | Shop by category | Photographic bento with real product counts and a link to all products | ERP |
| 6 | Shop by brand | Real brands, largest range first, staff logos if uploaded, View all brands | ERP, uploaded logos |
| 7 | New arrivals | Swipeable carousel with arrows, View all, Quick View, wishlist, add to cart | ERP |
| 8 | Special offers | Black panel quoting the real best saving, with the products; **hidden when there are no offers**; one or two offers share a compact band | real sale prices |
| 9 | Collection 1 | Photographic banner beside a row of products | largest real category |
| 10 | Staff picks | Large feature tile plus products; **hidden below three featured products** | products staff marked Featured |
| 11 | Collection 2 | Black band with the products in white tiles | second real category |
| 12 | Shop by budget | Three ranges (under 8,000; 8,000 to 35,000; over 35,000), swipeable on phones | real prices |
| 13 | Collection 3 | Text column beside a swipeable carousel (appears when a third category has four in-stock products) | third real category |
| 14 | Why shop with VALTA | Black panel with four columns and large orange figures: cash on delivery, delivery charge, live prices and stock, track and cancel online | ERP settings |
| 15 | Good to know | Only the lines the business entered in `SITE_HIGHLIGHTS`; **hidden when none** | business-entered |
| 16 | Recently viewed | Browser-local history, live prices and stock, Clear button; **hidden without history** | shopper's own history |
| 17 | Staff banners and wide banner | Campaign banners created in the admin, shown as written | admin |
| 18 | How ordering works | Three-step visual journey | real product photos |
| 19 | Videos | When the business configured any | site config |
| 20 | Need help choosing? | Replaces a reviews block: Quick answers, Track your order, and the published contact details | site settings |
| 21 | FAQ | Answers from ERP settings | ERP settings |
| 22 | Final call to action | "Find your next favourite." | ERP |
| 23 | Footer | Shop categories (with a Brands link), support, company, contact, order tracking, FAQ, shipping, returns, privacy, terms, verified social links, accepted payments | ERP, site settings |

Quick View, wishlist, add to cart, search suggestions, brand discovery, category discovery and the category drawer are the existing working features and were reused, not rewritten.

## 3. Skipped on purpose, with reasons

| UGREEN section | Why it is not built |
|---|---|
| Customer reviews and "What People Say About Us" | The ERP and site have no review data. Fictional testimonials, ratings or counts are not allowed. Replaced by the "Need help choosing?" support section. |
| "What the Pros Are Saying" press quotes | No verified press or expert source exists. Not invented. |
| Most Popular Products | The ERP holds no sales or popularity data. Replaced by **Staff picks** (products staff marked Featured), hidden when there are none. |
| Sale end dates, "weekly deals" wording | The ERP has no sale end date. None is shown or implied. |
| Warranty and assurance banner | Only appears if the business enters the text in `SITE_HIGHLIGHTS` ("Good to know" and the trust strip). Nothing is claimed on the shop's behalf. |
| Brand-story text block | The store has no approved brand story to publish. |
| Newsletter form | There is no newsletter backend; it needs a separate approval. |
| Product comparison | ERP specifications are free-form and unreliable for a comparison table. |
| Real logos for brands | Only logos uploaded by staff are used. No logo is fetched or invented. |

## 4. Design decisions

- **Rhythm.** Black bands (hero, offers, a collection, final call to action) alternate with white and soft-grey sections so the page never becomes a long run of identical product grids. Three collections use three different compositions (photo banner, black band, carousel) and can sit at different points of the page.
- **Brand system.** Black `#111111`, signature orange `#F97316` for fills with **black text** (6.7:1), `#C2410C` for orange text on light backgrounds (5.2:1), white, soft grey. White text on `#F97316` (2.8:1) is never used. The muted text colour is kept slightly darker than `#737373` because that value fails AA on the soft grey.
- **Navigation.** Shop was added to the main navigation; About and Contact were added to the information bar. The header stays white.
- **Motion.** The hero uses a slide-up without a fade, because content that starts invisible is not counted as painted, which delayed the largest paint by roughly half a second. All animation stops with reduced motion.

## 5. Files changed (this round)

**New:** `src/components/home/trust-strip.tsx`, `product-sections.tsx` (new arrivals, special offers, staff picks), `collections.tsx`, `support-assurance.tsx`.

**Edited:** `src/app/(home)/page.tsx` (new section order, no tabs), `src/components/home/home-sections.tsx` (old tabbed showcase removed), `src/components/home/sections.tsx` (old campaign panels removed), `src/lib/home-data.ts` (unused campaign data removed), `src/components/layout/header.tsx` (About and Contact), `category-nav.tsx` (Shop), `footer.tsx` (Brands link and orange accents), `src/components/products/product-card.tsx`, `src/components/brands/brand-tile.tsx`, `src/components/home/hero.tsx` and `hero-slider.tsx` (accessible names).

**Tests:** `tests/e2e/homepage.spec.ts`, `discovery-pages.spec.ts`, `storefront.spec.ts`, `admin.spec.ts`, `product-content-qa.spec.ts`, `product-content.spec.ts`.

**Removed code:** the tabbed "Featured products" section and the old editorial campaign panels. Nothing in cart, checkout, orders, accounts, payments, ERP sync, prices, stock or any API route was changed.

## 6. Test results

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | Clean |
| ESLint (`src` and `tests`) | Clean |
| Production build (`next build`) | Succeeded (rebuilt by the Playwright web server before each full run) |
| Unit and integration tests (vitest) | **198 / 198 passed** (17 files) |
| Full Playwright suite (desktop and mobile projects) | **146 / 146 passed** on the final run (8.3 min, quiet machine, after the last code change) |
| Homepage at 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440 px | No horizontal overflow and no console errors at any width (production build) |
| Hero at the same widths | 0.99 to 1.03 screens tall on phones, 1.17 to 1.27 on tablets, 0.68 on desktop; both buttons 48 px; headline white |
| Axe automated scan (WCAG 2 A, AA, 2.1 and 2.2 AA rules), 6 pages at 1440, 820, 390 and 320 px (24 combinations: home, products, brands, category, FAQ, cart) | **One rule hit per page, the same everywhere: the logo link ("VALTA.LK home" is spoken, but the visible text is "VALTA.LK" with a stylised "A")**. All other findings were fixed (see below). |

**Accessibility fixes made during this round.** An axe scan of the first production build showed the "Label in Name" rule (WCAG 2.5.3) failing on 14 elements on the homepage and 10 on `/brands`: product, category and brand links had a spoken name ("Pulse Wireless Earbuds, LKR 14,900", "Audio, 4 products") that differed from the words on screen, and the hero indicators were spoken without their visible numbers. These links are now named by their visible content, and the slide indicators start with their number ("01, ..."). Tests were updated for the new names. The remaining hit is the logo, noted in the limitations.

**Playwright history, reported honestly.** The first full run on the new homepage had 5 failures: three were tests still describing the removed tabbed section and campaign panels (updated), one was a strict-locator clash with the new footer "All brands" link (fixed), and one was a ten-width loop that needed a longer limit. A later full run had 1 failure: the admin "every sidebar entry opens" test needs about 19 s on a quiet machine and 45 s or more under load against a 30 s limit (that test now has a 120 s limit), and my hero slider test counted slides before the page finished streaming (it now waits for the slider). Another full run had 3 failures in the product-content tests, which change a price in the mock ERP and then read pages: the website caches the ERP catalogue for about a minute, so a test could still see the previous test's price. Those tests now wait for the reset price before starting. The next two full runs were clean (146 / 146 and 146 / 146). Load on the machine varied between about 14 and 100 percent during the session; most timeouts happened when it was heavily loaded.

**Performance (measured, lab only).** Production build, mock ERP on localhost, Chromium, five loads per page, median: homepage largest contentful paint 492 ms on desktop and 612 ms on a 390 px phone, product list 356 and 480 ms, product page 260 and 288 ms; layout shift 0.000 on all of them; JavaScript transferred about 0.55 to 0.59 MB per page. These use placeholder product images from localhost, so real photographs over a real network will be slower. No Lighthouse score was produced and nothing is claimed about real-world speed.

**What was not tested.** The real ERP and live site; real devices (phones, tablets, Safari, Firefox); screen readers (VoiceOver, TalkBack, NVDA); real product photography.

**Screenshots.** `docs/homepage-final-screenshots/`: full-page homepage at 1440, 820 and 390 px (`home-*`), sections at 1440 and 390 px (`s-*`), the trust strip (`trust-*`), the hero at four widths. They are untracked image files and were taken from the production build with the mock ERP.

## 7. Remaining limitations

- **Mock data only.** Real product photography, real brand logos and real offer counts will change how some sections look. Special offers, Staff picks, Good to know and the third collection appear or disappear with real data.
- **Real devices and screen readers** were not tested.
- **Logo.** The wordmark's stylised "Λ" is a Greek letter standing in for "A", so its spoken label ("VALTA.LK home") differs from its visible letters. It is the one remaining axe finding on every page; fixing it means changing the logo's visible text or accepting the spoken name.
- **Mobile LCP on real photos and real networks** is unmeasured; the numbers below are lab figures on localhost.
- **A homepage with many sections is long** (about 9,700 px on desktop and 11,500 px on phones with the mock data); the sections that need data are hidden when it is missing, so a real store may be shorter or longer.
- **Integration with production.** The reviewing session reports the live server runs a different line of the code (`feature/ai-widget`) with many commits not in this branch. This round is not in the commit the other session is merging; it is held uncommitted until the owner decides.
