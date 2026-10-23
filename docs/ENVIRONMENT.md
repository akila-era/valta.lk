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

## Header and service bar text (optional, owner-supplied)

These are business claims, so the site shows them only when the owner sets them. When blank, the site shows facts from live ERP settings (cash on delivery, delivery charge) instead.

| Variable | Description |
| --- | --- |
| `SITE_ANNOUNCEMENT` | Top-bar tagline next to the location pin. |
| `SITE_HIGHLIGHTS` | Up to 2 top-bar claims separated by `\|`, e.g. `Islandwide Delivery\|Secure Payments`. "Customer Support" is always added. |
| `SITE_SERVICE_BAR` | Up to 4 items under the hero, `Title:Subtitle\|...`. Icons follow the mockup order: truck, shield, card, headset. Do not list payment methods checkout does not offer (checkout is COD only). |
| `SITE_CONTACT_PHONE`, `SITE_CONTACT_WHATSAPP` | Top-bar phone and WhatsApp (opens wa.me). |
| `SITE_CONTACT_ADDRESS` | When set, the top bar shows "Store Locator" (links to the contact page). |

## Customer accounts

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for the **website's own** database (customer accounts, sessions, reset tokens, order links). Use a dedicated database such as `valta_web`, never the ERP database. When blank, accounts are hidden and guest checkout keeps working. |
| `ADMIN_EMAILS` | Comma-separated emails of signed-in customer accounts allowed to open `/admin/orders` (orders list, filters, ERP sync status/errors, retry). Empty = nobody is admin. Requires `DATABASE_URL`. |
| `ORDER_SYNC_SECRET` | At least 16 characters. Bearer secret for `POST /api/internal/sync-orders`, which a scheduler calls every minute to send orders that could not reach the ERP. Unset = the endpoint returns 404. Example: `curl -X POST -H "Authorization: Bearer $ORDER_SYNC_SECRET" https://<site>/api/internal/sync-orders`. |
| `ORDER_SYNC_BACKOFF_MS` | Test-only override of the retry backoff (default 1m, 5m, 15m, 1h, 3h, 6h; orders still unsent after 24h are marked "Needs attention"). Never set in production. |

Set up a new database:

```bash
# 1. create an empty database (once), e.g. in psql:  CREATE DATABASE valta_web;
# 2. put DATABASE_URL in apps/web/.env.local
cd apps/web
npx prisma migrate deploy   # applies prisma/migrations (website tables only)
npx prisma generate         # regenerates src/generated/prisma (also needed after a fresh clone)
```

Password reset emails: no email provider is configured. In development the reset link is printed to the server console; in production nothing is sent until a provider is wired into `src/lib/auth/mailer.ts`.
| `SETTINGS_ENCRYPTION_KEY` | optional | 32+ random characters. Needed to save an ERP connection from Admin > ERP Settings (the credential is stored AES-256-GCM encrypted). Without a saved connection the site uses HX_API_BASE / HX_STORE_CREDENTIAL. Losing or changing the key means re-entering the credential. |
