# Architecture

## Decisions

- **Single Next.js app** (`apps/web`). Route handlers under `/api/store/*` are enough; no separate backend, admin app or shared package was created.
- **Small website database for customer accounts only** (PostgreSQL + Prisma, `apps/web/prisma`). Tables: `Customer`, `Session`, `PasswordResetToken`, `CustomerOrder`. `CustomerOrder` only links a website order reference to a customer, because the ERP has no "orders by customer" endpoint; order contents and status are always read from the ERP. No products, stock, prices or payments are stored. Without `DATABASE_URL` the site runs guest-only.
- **Auth:** email + password (scrypt), opaque session token in an httpOnly SameSite=Lax cookie (only its SHA-256 hash is stored), 30-day sessions, lockout after 5 failed logins for 15 minutes, single-use 30-minute reset tokens that also sign out all sessions, same-origin + rate limits on every account route, generic errors that never reveal whether an email is registered.
- **ERP is authoritative** for products, prices, stock, delivery charge, COD eligibility, orders and statuses. The site never stores stock or payment records.

## Request flow (checkout)

1. `/checkout` (server) reads ERP settings fresh and requires `ordersEnabled`, `paymentMethods.COD` and currency `LKR` (a disabled store or paused integration surfaces as 401/403 and also disables checkout). Otherwise it shows an unavailable state.
2. Browser posts `{externalRef, lines[productId, variantKey, quantity], customer, delivery, expectedTotal, acceptTerms}` to `POST /api/store/orders`. Origin check, rate limit (10/min/IP), Zod validation.
3. `placeOrder` (server): re-reads settings, reads live availability and **authoritative unit prices** (`GET /catalogue/products/{id}`), computes subtotal + delivery charge + total in integer cents. If the total differs from `expectedTotal`, it returns 409 `PRICE_CHANGED` with refreshed prices and creates nothing.
4. Creates the order with `Idempotency-Key = externalRef` and no `reservationRef`; the ERP holds the stock atomically with the order.
5. Transient failures (network, timeout, 5xx) and `IDEMPOTENCY_IN_PROGRESS` are retried with the same key. Other 4xx are not retried.
6. In-flight duplicates for the same `externalRef` share one promise; the browser also guards double-submit and keeps the same reference until a definitive outcome.

## Security

- Credential only in `lib/erp/client.ts` (`server-only`), never logged, never sent to the browser. Verified absent from `.next/static`.
- Order references are ~49-bit random tokens and act as the tracking secret; lookups are rate limited and responses are filtered by `toPublicOrder` (no internal IDs, customer data, tenant or branch info).
- Mutating routes require a same-host `Origin`. Security headers are set in `next.config.ts`.
- Rate limiting is in-memory (single instance). Use a shared store if scaled horizontally.

## Caching

Catalogue: in-memory snapshot refreshed at most every 60 s using the ERP's incremental `updatedSince` watermark; removed IDs are dropped. Cached availability is shown only as "Available / Out of stock" and is never treated as a reservation; stock is re-checked live in the cart and at order time.

## Orders: persist first, then ERP

Checkout saves the order in the website database (`WebOrder`: exact ERP payload, display lines, sync status) before calling the ERP, so an ERP outage never loses an order. The ERP call uses `Idempotency-Key` = the order reference and resends the identical payload, so retries cannot duplicate. Retries come from: the inline attempt at checkout, `POST /api/internal/sync-orders` (scheduler), viewing a pending order, and the admin "Retry sync" button. Definitive ERP rejections at checkout discard the local row and show the reason; later rejections become FAILED ("Needs attention") for staff. The ERP stays authoritative for status, payment status and tracking; the website only caches them. Delivery details are shown only to the placing browser (hashed access-token cookie), the owning account, or admin. The ERP exposes no separate order id (our reference is the identity), no order list and no webhooks, so status is polled on view.

## Product content (website-owned)

The ERP owns product identity, SKU, price, stock and availability. Everything shown on the product page that is presentation (display title, subtitle, short and rich description, gallery with alt text, features, grouped specifications, labels, warranty and delivery notes, SEO fields, chosen related products) is a `ProductContent` document in the website database, keyed by the ERP product id.
- `draft` is what staff edit and preview (`/products/<slug>?preview=1`, admin session only); `published` is the only copy customers see. `version` guards against two editors overwriting each other.
- The published document is layered over every fresh ERP catalogue snapshot (`lib/erp/content-overlay.ts`), so an ERP sync can never overwrite it, and the overlay never touches name, SKU, price, stock or availability. The cart and orders always use the ERP name.
- Descriptions are rich text, sanitised with an allow-list on save and again on render (`lib/content/sanitize.ts`). Images are validated by their bytes (JPEG/PNG/WebP, 2 MB, max 8) and stored in the `MediaAsset` table, served from `/api/media/<id>`.
- Not implemented because the backend does not exist: payment offers/installments (no gateway), per-variant images, a change audit trail beyond `updatedBy`, editable URL slugs.
