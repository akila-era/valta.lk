# Environment variables

All are server-side. None use the `NEXT_PUBLIC_` prefix. Never commit real values.

| Variable | Required | Description |
| --- | --- | --- |
| `HX_API_BASE` | yes | ERP base URL ending in `/api/v1/store-api`, no trailing slash |
| `HX_STORE_CREDENTIAL` | yes | `hxs_<keyId>.<secret>`; supply via the deployment secret manager |
| `SITE_URL` | yes (prod) | Public origin, used for canonical URLs, sitemap, Open Graph |
| `ERP_IMAGE_HOSTS` | if products have images | Comma-separated hostnames allowed by `next/image` |
| `SITE_CONTACT_PHONE`, `SITE_CONTACT_EMAIL`, `SITE_CONTACT_ADDRESS` | optional | Shown in footer/contact when set; hidden when blank |
| `SITE_PAYMENT_METHODS` | optional | Footer "We accept" brands: comma list of `visa, mastercard, amex, frimi, ezcash, mcash, koko, genie`. Official logos are used from `public/payments/<id>.svg` when present, otherwise the name is shown. List only methods checkout really offers (the ERP supports cash on delivery only today) |
| `SITE_BUSINESS_HOURS` | optional | Opening hours in the footer; separate lines with `|`. Hidden when blank |
| `SITE_ANNOUNCEMENT` | optional | Announcement bar text; hidden when blank |

If `HX_API_BASE` / `HX_STORE_CREDENTIAL` are missing or malformed the site renders "unavailable" states and disables checkout. It never substitutes fake products or stock.

## Homepage configuration (optional)

| Variable | Description |
| --- | --- |
| `HOME_BANNERS` | JSON array of up to 4 promo banners: `{variant: "dark"\|"light", eyebrow?, headline, text?, ctaLabel, href, categorySlug?}`. `href` must be an internal path. A banner whose category does not exist in the ERP catalogue is hidden. When unset, two neutral banners are derived from real categories (phones; gadgets/accessories) with no discount or offer wording. |
| `SITE_SOCIAL_FACEBOOK`, `SITE_SOCIAL_INSTAGRAM`, `SITE_SOCIAL_TIKTOK`, `SITE_SOCIAL_YOUTUBE` | `https://` profile URLs shown in the footer. Hidden when unset. |
| `HOME_VIDEOS` | JSON array of up to 4 YouTube videos: `{id: "<11-character video id>", title, channel?, thumbnail?}`. `thumbnail` may be an internal path or an `i.ytimg.com` URL. The player (youtube-nocookie.com) loads only after the visitor presses play. Hidden when unset or invalid. |
| `HOME_VIDEOS_TITLE` | Heading above those videos (default "Watch and learn"). |

## Header and service bar text (optional, owner-supplied)

Business claims appear only when the owner sets them. Everything else in the header and the service bar under the hero comes from live ERP settings or fixed site links.

| Variable | Description |
| --- | --- |
| `SITE_ANNOUNCEMENT` | Shown first in the slim announcement bar above the header, before the ERP facts (delivery charge, cash on delivery), the phone number and "Track order". |
| `SITE_CONTACT_PHONE` | Announcement bar, footer, contact page, and the "Customer Support" item of the service bar. |
| `SITE_CONTACT_ADDRESS` | Footer and contact page. |
| `SITE_HIGHLIGHTS`, `SITE_CONTACT_WHATSAPP` | Read into the site settings (`lib/site-config.ts`) but **not displayed anywhere at the moment**. |

The service bar under the hero is not configurable (`SITE_SERVICE_BAR` is not read by the code). It always shows the ERP delivery charge, "Cash on Delivery" when the ERP allows COD, "Track Your Order", and "Customer Support".

## Customer accounts

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for the **website's own** database (customer accounts, sessions, reset tokens, order links). Use a dedicated database such as `volta_web`, never the ERP database. When blank, accounts are hidden and guest checkout keeps working. |
| `ADMIN_EMAILS` | Comma-separated emails of signed-in customer accounts allowed into the whole admin console (`/admin`: dashboard, orders and sync retry, products and content, marketing, reports, ERP settings). Empty = nobody is admin. Requires `DATABASE_URL`. |
| `SETTINGS_ENCRYPTION_KEY` | 32+ random characters. Needed to save an ERP connection from Admin > ERP Settings (the credential is stored AES-256-GCM encrypted). Without a saved connection the site uses `HX_API_BASE` / `HX_STORE_CREDENTIAL`. Losing or changing the key means re-entering the credential. |
| `ORDER_SYNC_SECRET` | At least 16 characters. Bearer secret for `POST /api/internal/sync-orders`, which a scheduler calls every minute to send orders that could not reach the ERP. Unset = the endpoint returns 404. Example: `curl -X POST -H "Authorization: Bearer $ORDER_SYNC_SECRET" https://<site>/api/internal/sync-orders`. |
| `ORDER_SYNC_BACKOFF_MS` | Test-only override of the retry backoff (default 1m, 5m, 15m, 1h, 3h, 6h; orders still unsent after 24h are marked "Needs attention"). Never set in production. |

Set up a new database:

```bash
# 1. create an empty database (once), e.g. in psql:  CREATE DATABASE volta_web;
# 2. put DATABASE_URL in apps/web/.env.local
cd apps/web
npx prisma migrate deploy   # applies prisma/migrations (website tables only)
npx prisma generate         # regenerates src/generated/prisma (also needed after a fresh clone)
```

For local development without PostgreSQL, `npm run dev-db` starts an embedded database (PGlite) on port 5498 (`DEV_DB_PORT` to change it), stored in `apps/web/.dev-db`, and applies the migrations itself. Point `DATABASE_URL` at it. Development only.

Password reset emails: no email provider is configured. In development the reset link is printed to the server console; in production nothing is sent until a provider is wired into `src/lib/auth/mailer.ts`.

## Operational and test switches

| Variable | Description |
| --- | --- |
| `COOKIE_SECURE` | `true` / `false` forces the `Secure` flag on session and order-access cookies. Default: secure in production only. |
| `DEMO_READ_ONLY` | `true` makes the site a browse-only demo: `src/proxy.ts` refuses every non-GET request (checkout, sign-in, admin changes, order sync) with 403. |
| `NEXT_DIST_DIR` | Build output folder (default `.next`). The Playwright config sets `.next-e2e` so E2E builds never overwrite a running dev server's files. |
| `DEV_DB_PORT` | Port for `npm run dev-db` (default 5498). |
