# Deployment

Nothing has been deployed. Staging steps:

1. Set the variables in [ENVIRONMENT.md](ENVIRONMENT.md) in the host's secret/config store (staging ERP tenant and test credential only).
2. `npm ci && npm run build && npm run start` (Node 20+; developed on Node 24).
3. Smoke test: `/`, `/products`, a product page, add to cart, `/checkout` (confirm delivery charge and COD match ERP settings), place one test order against the **staging** ERP, then `/track-order`.
4. Put the app behind HTTPS (the HSTS header is set).

Customer accounts need a website-only PostgreSQL database: set `DATABASE_URL` and run `npx prisma migrate deploy` from `apps/web` against the **staging** database before starting the app. Never run migrations against production without an approved plan.

## Staging prerequisites (all must come from the project owner)

1. **Staging website host**: hostname, TLS/reverse proxy, and how the app is run (Node process, container, or platform). None is documented.
2. **Deployment access** for that host (SSH/CI/platform account) and explicit approval to deploy.
3. **ERP staging API base** `https://<staging-erp-host>/api/v1/store-api` (a separate ERP stack, e.g. `COMPOSE_PROJECT_NAME=hx-staging`, per the ERP's `docs/STAGING_REHEARSAL.md`; not production).
4. **A staging store credential** `hxs_<keyId>.<secret>`, issued once by the staging ERP Owner. Put it only in the host's secret store.
5. **Staging ERP configured**: store enabled; catalogue, reservations and orders on; fulfilment branch; COD allowed; delivery charge set; products published with website prices; Customer Credit enabled on the branch; shop staff available to confirm, dispatch (with tracking) and deliver a test order; the store worker running if expiry behaviour is to be tested.
6. **Site values**: `SITE_URL`, `ERP_IMAGE_HOSTS` (the ERP host serving product images), optional contact details.

Then: `npm ci && npm run build && npm run start`, and run the smoke journey below.

## Staging smoke journey

1. `/` and `/products` show staging products with correct prices.
2. `/api/store/settings` returns `enabled: true` and the ERP delivery charge.
3. Add a variant product, change quantity, checkout, place **one** test COD order.
4. Confirmation shows the reference and "payment is pending"; the order appears in the ERP under E-Commerce, Online Order Management.
5. Re-submit with the same reference (browser back/refresh): no second ERP order.
6. Staff confirm and dispatch with a tracking number: `/track-order` shows status, carrier and tracking number.
7. Cancel a second `PLACED` test order from the tracking page: ERP shows `CANCELLED` and the hold is released.
8. Deliver and collect cash in the ERP: tracking shows delivered and payment collected.

## Rollback

Redeploy the previous build artifact and restore the previous environment values. The website database holds accounts, website order records, product content, marketing content and settings (see ARCHITECTURE.md). Most migrations only add tables, columns or indexes, but not all: `20261022090000_product_content_v2` drops two `ProductContent` columns after copying their data, and `20261022153000_accessory_variant_key` replaces a unique index. Back up the database before `prisma migrate deploy`. Roll back the app first; only roll back the schema with an approved plan. Test orders live in the staging ERP and are cancelled there.

## Known limitations and blockers

- **Never run against a staging or production ERP.** The contract is implemented from the ERP docs, tested automatically against a mock and by hand against the real ERP code on a local disposable database. See [ERP_INTEGRATION.md](ERP_INTEGRATION.md).
- Cached ERP order statuses on `WebOrder` refresh only when an order is viewed, so admin reports (especially "COD collected") can lag behind the ERP. See ARCHITECTURE.md.
- Rate limiting is per-instance memory; use a shared store for multiple instances.
- Catalogue snapshot is held in process memory (refreshed every 60 s); with many instances each keeps its own copy.
- Order tracking polls every 30 s only while the tab is visible and stops at `DELIVERED`/`CANCELLED`.
- No product images are bundled; items without images show a neutral placeholder. Set `ERP_IMAGE_HOSTS` for real images.
- Orders create their own ERP stock hold; cart-time reservations exist in code (`/api/store/reservations`) but the UI does not use them, so abandoned carts never hold stock.
- Legal pages (terms, privacy, returns, shipping) are plain starter text and need business/legal review. Return eligibility periods and delivery times are intentionally not stated.
- Business contact details are not invented; they appear only when configured.
- No online payments or reviews. Password-reset email needs a provider (`src/lib/auth/mailer.ts`). No accessibility audit with assistive technology was done; only semantic markup, labels, focus styles and keyboard-reachable controls.

## Orders and admin (added with the cart/checkout work)

- Run `prisma migrate deploy` against the website database to add the `WebOrder` table (migration `20261020120000_web_orders`). Not run automatically.
- Set `ADMIN_EMAILS` and `ORDER_SYNC_SECRET` (see ENVIRONMENT.md) and schedule the sync call every minute.
- Orders contain customer PII (name, phone, address); decide a retention period for synced rows before launch. `/admin` pages must not be indexed.
- Online payment is not implemented: no gateway or credentials exist. Cash on delivery only.

## Product content migration

`prisma migrate deploy` also applies `20261021090000_product_content` and `20261022090000_product_content_v2` (product content documents and uploaded images). Existing rows from the first version become live content automatically. Back up the website database first.
