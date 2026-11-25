# Koko (Buy Now Pay Later)

Customers can pay with **Koko: Buy Now Pay Later** ("Pay in 3 interest free instalments with Koko.") at checkout.
All Koko code is server-only (`import "server-only"`, `runtime = "nodejs"`, `node:crypto`).

## Flow

1. **Checkout** (`checkout-form.tsx`): choosing Koko posts the normal order to `POST /api/store/orders` with `paymentMethod: "KOKO"`.
   The order is validated and priced from ERP data exactly like a COD order, saved as a `WebOrder` with `awaitingPayment = true`,
   and is **not** sent to the ERP. The browser gets the usual access cookie.
2. **Create** (`POST /api/payments/koko/create`, body `{ orderRef }` only): the server checks ownership (access cookie or signed-in
   customer) and that the order is unpaid, then creates a `KokoPayment` attempt with a new unique id `<orderRef>-<n>` and returns
   `{ action, fields }`. Amount (`"12500.00"`), currency and customer details come from the database, never from the client.
3. **Redirect** (`koko-redirect.tsx`): a hidden form is built with the DOM and POSTed to `${KOKO_BASE_URL}/api/merchants/orderCreate`.
4. **Webhook** (`POST /api/payments/koko/webhook`, Koko's `_responseUrl`) is the **only** source of truth. It verifies
   `orderId + trnId + status + desc` with `KOKO_PUBLIC_KEY`. Invalid signature: 400, nothing changes. Valid SUCCESS: in one
   transaction the attempt becomes SUCCESS and the order is marked paid, then the order is released to the ERP once.
   Repeated or concurrent callbacks are no-ops.
5. **Return** (`/api/payments/koko/return`, GET or POST) never marks anything paid. It redirects (303) to
   `/checkout/koko/result?orderId=<ref>`, which shows Success / Processing / Failed from our database. While pending it asks Koko
   (`orderView`, signature verified) and refreshes itself for about a minute. Failed or cancelled: "Try Koko again" creates a new attempt.
6. **Cancel** (`/api/payments/koko/cancel`, GET or POST) marks the attempt CANCELED (never over a SUCCESS) and returns to
   `/checkout?payment=cancelled`. The cart is kept; it is only emptied once payment is confirmed.
7. **Reconciliation**: `POST|GET /api/internal/koko-reconcile` with `Authorization: Bearer $ORDER_SYNC_SECRET` rechecks attempts
   PENDING for over 15 minutes. Run it every few minutes from the same scheduler as order sync (or a Vercel Cron job).
   Admins also get a **Recheck Koko status** button on the order page.

### How an online order reaches the ERP

The ERP stays the system of record. A Koko order is created in the ERP only after payment is confirmed, with
`paymentMethod: "ONLINE"`; unpaid attempts never reach the ERP or reserve stock. Consequences to be aware of:

- Koko is offered only when the ERP has **ONLINE** payments enabled (`GET /settings` `paymentMethods.ONLINE`), Koko is configured,
  and the website database is available. For QA against an ERP without ONLINE, set `KOKO_ALLOW_WITHOUT_ERP_ONLINE=true`;
  the paid order is then refused by the ERP and shows as FAILED in admin (the payment is still recorded on the website).
- The website does **not** call the ERP's `POST /orders/{ref}/payment`: its contract is not documented in this repo. Confirm with the
  ERP team whether creating the order as `ONLINE` after payment is enough or the payment must also be reported.
- If stock runs out between payment and ERP release, the ERP rejects the order after the customer has paid. That needs a manual
  refund through Koko. Admin shows such orders as FAILED.

## Admin settings (recommended)

Koko can be fully controlled from **Admin > Payments > Koko: Buy Now Pay Later**: environment (QA / Production), merchant ID, API key,
plugin name and version, our merchant private key, Koko's public key, and the public site URL. There is also a switch that shows or hides
Koko at checkout. Saved settings win over the `KOKO_*` environment variables below.

- Needs `DATABASE_URL` and `SETTINGS_ENCRYPTION_KEY` (32+ characters). The API key and private key are stored encrypted and are never shown again.
- Leaving a key field blank keeps the saved one, so you can change the environment or site URL without pasting keys again.
- The first save leaves Koko switched **off**; turn it on when ready. Switching off only hides it at checkout: callbacks and rechecks for payments already started keep working.
- "Check details" validates the keys locally (readable RSA keys). Koko is only contacted when a payment starts or an order is rechecked.
- Switching QA to Production is the Environment dropdown plus the production credentials from Koko.

## Environment variables (alternative)

Server-only. Never prefix with `NEXT_PUBLIC_`. Names are in `apps/web/.env.example`; values go in `.env.local` (gitignored).

| Variable | Purpose |
| --- | --- |
| `KOKO_BASE_URL` | QA `https://qaapi.paykoko.com`, PROD `https://prodapi.paykoko.com` |
| `KOKO_MERCHANT_ID`, `KOKO_API_KEY` | Merchant credentials from Koko |
| `KOKO_PLUGIN_NAME`, `KOKO_PLUGIN_VERSION` | Must be identical for create and orderView (`customapi`, `1`) |
| `KOKO_MERCHANT_PRIVATE_KEY` | Our RSA private key, signs requests |
| `KOKO_PUBLIC_KEY` | Koko's public key, verifies callbacks |
| `APP_URL` | Public https base URL Koko can reach (falls back to `SITE_URL`) |
| `ORDER_SYNC_SECRET` | Also protects the reconcile endpoint |
| `KOKO_ALLOW_WITHOUT_ERP_ONLINE` | QA only, see above |

Keys may use real newlines or escaped `\n`.

## Test locally with a tunnel

Koko must reach the webhook over public HTTPS.

1. Start the site (`npm run dev`) with `DATABASE_URL` set and migrations applied (`npm run db:migrate`).
2. Start a tunnel, for example `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.
3. Set `APP_URL` to the tunnel URL and restart. Return, cancel and webhook URLs are built from it.
4. Add Koko to cart, check out with Koko, and pay on Koko's QA page. The webhook marks the order paid and the result page shows success.
5. Try cancel and a failed payment: both return to the site and allow a retry.

Tests: `npm test` (`tests/unit/koko.test.ts`, `tests/integration/koko-webhook.test.ts`). The known-good Koko callback vector
(`ONL24052603430`) is verified against the real `KOKO_PUBLIC_KEY` read from the environment or `.env.local`; it is skipped when the key is absent.

## Switch to PRODUCTION

1. Get production credentials from Koko (merchant id, API key, merchant key pair registration, Koko production public key).
2. Set `KOKO_BASE_URL=https://prodapi.paykoko.com` and replace every other `KOKO_*` value with the production ones.
3. Set `APP_URL` to the live https domain, and make sure `KOKO_ALLOW_WITHOUT_ERP_ONLINE` is unset.
4. Schedule the reconcile endpoint. Run one small real payment and check the webhook, result page and ERP order.
