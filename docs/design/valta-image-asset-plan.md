# VALTA.LK image asset plan

Status: plan only. No image has been generated, downloaded or replaced. Audit date: 2026-10-24, against the working tree on `main` (uncommitted redesign).

## 1. How images are served today

- Homepage art lives in `apps/web/public/images/home/` and is rendered with `next/image` (`fill` + `sizes`), so Next resizes and re-encodes on request.
- `next.config.ts` sets no `images.formats`, so the optimiser serves **WebP** (AVIF is off). Keep source files as WebP; AVIF would only help if `formats: ["image/avif", "image/webp"]` were added, which is a separate decision.
- Product photos always come from the ERP (`ERP_IMAGE_HOSTS`). This plan never replaces them; it only covers campaign and category art.
- Staff can already upload their own promo-card and wide-banner pictures in the admin (`/admin/marketing/banners`, max 2 MB, JPEG/PNG/WebP). Those are served `unoptimized`, so uploads should be exported at the final size.
- Every decorative image uses `alt=""`; hero slides carry descriptive alt text in `hero-slides.tsx`. New assets must follow the same rule.

## 2. Inventory (measured pixel sizes vs rendered sizes)

Rendered sizes were measured in the running app at 1920×1080 @1x, 1536×864 @1.25x, 1440×900 @2x and 390×844 @3x. "Needed" is the rendered size multiplied by the device pixel ratio.

| ID | Used by | File | Source px | Largest needed px | Verdict |
|---|---|---|---|---|---|
| hero-1 | `hero-slides.tsx` slide 1 | `valta-hero-match.webp` | 1280×720 | 2054×888 @1x (Ken Burns adds 7 %), 3082×1392 @2x | **Too small**: upscaled ~1.6× on a 1920 screen |
| hero-2 | slide 2 | `valta-hero-audio.webp` | 1280×720 | 1920×830 @1x, 2880×1300 @2x | **Too small** |
| hero-3 | slide 3 | `valta-hero-watch.webp` | 1280×720 | as above | **Too small** |
| hero-4 | slide 4 | `valta-hero-electronics.webp` | 1280×720 | as above | **Too small** |
| cat-phones | `category-art.ts` → Shop by Category | `valta-category-smartphones.webp` | 1024×1024 | 320×320 @2x | OK, reuse |
| cat-audio | as above | `valta-category-audio.webp` | 1024×1024 | 320×320 | OK, reuse |
| cat-wearables | as above | `valta-category-wearables.webp` | 1024×1024 | 320×320 | OK, reuse |
| cat-tablets | as above | `valta-category-tablets.webp` | 1024×1024 | 320×320 | OK, reuse |
| cat-accessories | as above | `valta-category-accessories.webp` | 1024×1024 | 320×320 | OK, reuse |
| promo-fallback | `sections.tsx` `bannerPhoto()` (only when staff banners exist without a picture) | `valta-hero-cinematic.webp`, `valta-banner-audio.webp` | 1280×720 | ~550 px wide (36vw) | OK, but dark cinematic look no longer matches the light theme |
| unused | none | `valta-hero-banner.webp`, `valta-hero-tablet.webp`, `valta-banner-laptop.webp` | 1280×720 | — | Not referenced in code |
| unused | none | `apps/web/src/asset/*.png` (5 files, ~5.5 MB) | up to 1983×793 | — | Not referenced; outside `public/`, never served |

Hero geometry: the hero fills the first screen below the header, so its box is wider than 16:9 on desktop (about 2.3:1 at 1920×1080, 2.5:1 at 1536×864) and about 1.5:1 on phones. The current 16:9 sources are cropped top and bottom by `object-cover` (`object-[70%_50%]` on desktop, `object-[center_60%]` on phones).

## 3. Gaps that matter

1. **Hero resolution** (highest impact). All four slides are upscaled on every desktop screen and look soft on high-density laptops.
2. **Missing category art.** `category-art.ts` only matches phones, audio, wearables, tablets and accessories. Gaming, Laptops and Power Banks would fall back to the ERP's first product photo or a line icon. These categories do not exist in the current catalogue, so the art is only needed when the ERP adds them.
3. **Promo-card fallback art** is dark and cinematic, out of step with the light theme. Low priority: it only shows when staff create a card without uploading a picture.
4. **Hot Deals** needs no new image. Its cards show real ERP product photos, and a decorative picture behind them would compete with the products. The warm panel gradient already sets it apart.
5. **Why VALTA and FAQ**: no imagery recommended. They are text-led trust content; pictures would add page weight and scrolling without new information.

## 4. Art direction (all new assets)

- Bright, clean studio product photography on warm neutral surfaces (stone, linen, `#f6efe7`-like backgrounds that blend with the hero fade).
- One restrained orange accent per frame (fabric, light rim or a prop) in the brand neon orange `#FF5C00`, never a full orange background.
- Generic, unbranded devices: no real brand logos, model names, screen UI or specifications. No text, prices, badges or "sale" graphics baked into images (copy stays in HTML so it can be translated and kept truthful).
- Products sit in the **right 55 %** of hero frames with calm negative space on the left for the headline; keep the subject inside the central 60 % height so phone and ultra-wide crops both work.
- Category art: single product centred, soft shadow, same light direction (key light from upper left) and the same warm background so the row reads as one set.
- Do not use generated images as product photos for items on sale.

## 5. Asset manifest

| Priority | ID | Component | Status | Subject | Ratio / minimum | Desktop / mobile use | Filename (WebP) |
|---|---|---|---|---|---|---|---|
| P1 | hero-1 | `hero-slides.tsx` | Replace | Phones, earbuds, watch and headphones arranged on warm stone with orange fabric (same composition as today, higher resolution) | 21:9, **3200×1370** min (safe area 16:9 centred-right) | Desktop full-bleed, phones crop to ~1.5:1 | `valta-hero-lineup-3200.webp` |
| P1 | hero-2 | `hero-slides.tsx` | Replace | Open earbud case and earbuds on linen, orange rim light | 21:9, 3200×1370 | as above | `valta-hero-audio-3200.webp` |
| P1 | hero-3 | `hero-slides.tsx` | Replace | Smartwatch on a stone plinth, warm studio | 21:9, 3200×1370 | as above | `valta-hero-watch-3200.webp` |
| P1 | hero-4 | `hero-slides.tsx` | Replace | Smartphone with earbuds, warm studio | 21:9, 3200×1370 | as above | `valta-hero-phone-3200.webp` |
| P2 | cat-gaming | `category-art.ts` (new rule `/gam|console|controller/i`) | Missing | Unbranded game controller | 1:1, 1024×1024 | Card art 80–160 px (×2–3 density) | `valta-category-gaming.webp` |
| P2 | cat-laptops | `category-art.ts` (new rule `/laptop|notebook/i`) | Missing | Unbranded open laptop, blank screen | 1:1, 1024×1024 | as above | `valta-category-laptops.webp` |
| P2 | cat-powerbanks | `category-art.ts` (new rule `/power ?bank/i`, placed before the accessories rule) | Missing | Unbranded power bank with cable | 1:1, 1024×1024 | as above | `valta-category-power-banks.webp` |
| P3 | promo-light-1 | `sections.tsx` `bannerPhoto()` fallback | Replace | Light version of the phone lineup, product right | 16:9, 1600×900 | Promo card picture, ~550 px wide | `valta-promo-phones-1600.webp` |
| P3 | promo-light-2 | `sections.tsx` `bannerPhoto()` fallback | Replace | Headphones and accessories, light | 16:9, 1600×900 | as above | `valta-promo-accessories-1600.webp` |
| — | hot-deals | `BestDeals` | Not needed | Uses ERP product photos | — | — | — |
| — | why / faq | `more-sections.tsx` | Not needed | Text-led | — | — | — |

Category art stays at 1024×1024: the largest render is 160 CSS px (320 px at 2x), so the existing size already has headroom.

## 6. Export and naming rules

- Format: WebP, quality ~80, sRGB, no metadata. Target under 250 KB for heroes and under 60 KB for category art.
- Names: `valta-<section>-<subject>[-<width>].webp`, lowercase, hyphenated, in `apps/web/public/images/home/`. Add the width suffix to hero and promo sources so a later re-export does not reuse a cached URL.
- Keep one source file per asset; let `next/image` produce the responsive sizes. Do not add separate mobile crops unless a test shows the shared crop fails on phones.
- When replacing a hero, update the matching `alt` text in `hero-slides.tsx` so it describes the new picture, and update the e2e checks that look for that alt text (`tests/e2e/homepage.spec.ts`).

## 7. Generation and replacement sequence

1. **Generate the four hero frames** at 3200×1370 with the shared art direction. Review all four side by side for consistent light and background.
2. **Check crops before shipping**: preview each frame at 1920×1080, 1536×864, 1440×900 and 390×844. The products must stay clear of the headline area on desktop and fully visible on phones.
3. **Swap the hero sources** in `hero-slides.tsx`, update alt text and the related e2e assertions, then compare before/after screenshots.
4. **Add the three category images** only when the ERP adds Gaming, Laptops or Power Banks; extend `category-art.ts` with the new name rules at the same time.
5. **Replace the promo-card fallbacks** with light versions (optional, low priority).
6. **Clean up** after the swap: remove the unused `valta-hero-banner`, `valta-hero-tablet`, `valta-banner-laptop` and the replaced hero files, and decide whether `apps/web/src/asset/*.png` (~5.5 MB, unreferenced) should be deleted. Remove nothing before the replacements are verified.
7. Optional, separate change: enable AVIF with `images.formats: ["image/avif", "image/webp"]` in `next.config.ts` and measure the byte savings.
