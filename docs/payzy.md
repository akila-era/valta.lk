# Payzy (instalment payments)

Payzy is offered at checkout next to Cash on delivery and Koko, using Payzy's **Custom Web** integration. The spec comes from Payzy's official sample project; <https://payzy.lk/dev-doc> is only an overview.

All Payzy code is server-only (`import "server-only"`, `runtime = "nodejs"`). The secret key never reaches the browser. Payzy's sample signs in frontend JS, which would expose the key, so we do not copy that.

## Flow

1. The customer picks **Payzy** on `/checkout`. The order is saved as unpaid (`paymentMethod = PAYZY`, `awaitingPayment = true`) and is held back from the ERP.
2. The browser calls `POST /api/payments/payzy/create` with only `{ orderRef }`. The server checks the caller may see the order, that it is a Payzy order and that it is unpaid. Amount, customer and delivery details are read from the stored order, never from the client.
3. `startPayzyPayment` (`src/lib/payments/payzy-service.ts`):
   - allocates attempt *n* and `x_order_id = VOLTA-<orderRef>-<n>`;
   - saves a `PayzyPayment` row (`PENDING`) with the exact JSON sent in `requestFields`;
   - signs the fields (HMAC-SHA256, base64) and POSTs them to `${PAYZY_BASE_URL}/checkout/custom-checkout` (15 s timeout);
   - stores `url` from the answer and returns `{ redirectUrl }`. The browser then does `window.location.href = redirectUrl`.
   - On 400/401/404, a network error or a missing `url`, the response body is logged (never the key), the attempt becomes `FAILED` and the customer sees a friendly error.
4. Payzy redirects the browser to `${APP_URL}/api/payments/payzy/return?x_order_id=…&response_code=…&signature=…` (GET or POST both work).
5. `applyPayzyReturn`:
   - loads the attempt by `x_order_id` (unknown → `/checkout?payment=error`);
   - restores `+` that arrived as a space in `signature`;
   - rebuilds the response sign string from the **stored** `requestFields` plus the received `response_code` and compares with `crypto.timingSafeEqual`;
   - valid and `00` → in one transaction the attempt becomes `SUCCESS` and the order is marked paid, then the order is released to the ERP once (`syncOrder`);
   - valid but another code → attempt `FAILED`, code stored in `responseCode`, logged;
   - invalid signature → no change, `[payzy] SECURITY` warning logged.
   - A refresh or replay of the same URL is a no-op (the `SUCCESS` claim is atomic).
6. The route answers `303` to `/checkout/payzy/result?orderId=<orderRef>`, which shows Success / Failed (retry Payzy or choose another method) / "not confirmed yet" **from our database**, never from query params.

### Signature

```
signature = base64( HMAC_SHA256( key = PAYZY_SECRET_KEY (raw UTF-8 string), message = signString ) )
signString = name=value pairs joined with "," in signed_field_names order,
             last pair is signed_field_names=<the list itself>; no spaces, no URL-encoding
```

Request order: `x_test_mode, x_shopid, x_amount, x_order_id, x_response_url, x_first_name … x_zip, x_phone, x_email, x_ship_to_first_name … x_ship_to_zip, x_freight, x_platform, x_version, signed_field_names`. The response list is the same with `response_code` first. Both builders live in `src/lib/payments/payzy.ts`.

**Known sample typo:** the sample's frontend signs `x_version1.0` (no `=`) in the request but `x_version=1.0` in the response. We sign the correct `x_version=1.0`. If the sandbox rejects the request with a signature/validation error, set `PAYZY_LEGACY_VERSION_SIGNING=on` to sign the sample's form for the request only, and tell Payzy support.

## Admin control (Admin → Payments → "Payzy: instalments")

Everything can be managed from the admin panel, like Koko:

- **Connection form:** environment (Sandbox `api.payzypay.xyz` / Production `api.payzy.lk`, only these two hosts are allowed), shop ID, secret key, test-mode value, public site URL and the legacy-signing switch. The secret key is stored AES-256-GCM encrypted (needs `SETTINGS_ENCRYPTION_KEY`, 32+ characters), is never shown again, and a blank field keeps the saved one. **Pasting the key here needs no `\$` escaping**, so the `$` problem below only applies to the environment fallback.
- **Show/hide at checkout:** a switch. Hiding it does not break returns for payments already started.
- **Check details / Remove saved settings:** check validates the key format; remove falls back to the `PAYZY_*` environment variables (if any).
- **Attempts list:** the 20 most recent attempts with status and response code. Attempts PENDING for over 30 minutes are highlighted, with **Mark paid** / **Mark failed** buttons for manual reconciliation after checking the Payzy merchant portal. "Mark paid" marks the order paid and releases it to the ERP once; it is logged with the admin's email.

Settings saved in the admin win over the environment variables below.

## Environment variables

| Name | Notes |
| --- | --- |
| `PAYZY_BASE_URL` | Sandbox `https://api.payzypay.xyz`. Production `https://api.payzy.lk`. |
| `PAYZY_SHOP_ID` | Sandbox `2`. Production has its own. |
| `PAYZY_SECRET_KEY` | Looks like a bcrypt hash (`$2b$12$…`, 60 chars). **See the warning below.** |
| `PAYZY_TEST_MODE` | `on` in the sandbox. Production value UNKNOWN (probably `off`): confirm with Payzy. |
| `APP_URL` | Public base URL of the site (used for `x_response_url` and redirects). |
| `PAYZY_LEGACY_VERSION_SIGNING` | Optional, `on` only if the sandbox rejects the correct request signature. |
| `PAYZY_ALLOW_WITHOUT_ERP_ONLINE` | QA only: offer Payzy even if the ERP has online payment off. |

Names (without values) are in `apps/web/.env.example`. Real values go in `.env.local` and the hosting settings, never in git. Never add `NEXT_PUBLIC_PAYZY_*`.

### The `$` warning (important)

Next.js's env loader expands `$VAR`, so an unescaped key silently turns into a short fragment (tested: it became `.EGvWy`). Write **every `$` as `\$`**:

```
PAYZY_SECRET_KEY=\$2b\$12\$<rest of the key>
```

Do the same in Vercel or any host that expands variables. At first use, `getPayzyConfig` asserts the key is 60 characters and starts with `$2b$`; otherwise it throws a `PayzyConfigError` that says so (without printing the key), and Payzy is simply not offered at checkout (the reason is logged once). If Payzy does not appear at checkout in a new environment, look at the server log first.

## Local testing

1. Put the `PAYZY_*` variables (escaped key) in `apps/web/.env.local`.
2. Payzy must be able to redirect the browser back, so expose the dev server (ngrok or cloudflared) and set `APP_URL` to that public URL. Restart `next dev`.
3. Payzy also needs the ERP to report online payments enabled, or set `PAYZY_ALLOW_WITHOUT_ERP_ONLINE=true` locally.
4. Payzy asked for **Rs 10 for every sandbox test**. Create one without touching real prices:
   `npm run payzy:test-order` (in `apps/web`). It refuses to run in production or unless `PAYZY_TEST_MODE=on`, creates a Rs 10 order in the local database and prints the Payzy sandbox URL. The order is stored as already synced, so paying it never reaches the ERP.
5. Log in on Payzy's sandbox page with the test customer account (credentials come from Payzy separately; never put them in code).
6. Check: success → order paid and result page says so; cancel/fail → order stays unpaid and "Try Payzy again" works; reloading the return URL does not process twice.

Automated tests: `npm test` (`tests/unit/payzy.test.ts`, `tests/integration/payzy-return.test.ts`). The two Payzy sign test vectors need the real sandbox key, which is not committed: run them with `PAYZY_VECTOR_KEY='<raw key>' npx vitest run tests/unit/payzy.test.ts` (they are skipped otherwise).

## Reconciliation (no webhook)

Payzy's sample has no server-to-server callback and no status API, so the browser redirect is the only confirmation. If a customer pays and closes the tab, the attempt stays `PENDING`. **Admin → Payments → "Payzy: instalments"** highlights attempts pending for over 30 minutes (and logs a `[payzy]` warning). Check each in the Payzy merchant portal, then use **Mark paid** or **Mark failed**.

`TODO(payzy)` in `payzy-service.ts` marks where a webhook or status check would plug in.

## Switching to production

1. `PAYZY_BASE_URL=https://api.payzy.lk`.
2. Production `PAYZY_SHOP_ID` and `PAYZY_SECRET_KEY` (escape every `$`).
3. Confirm the production `PAYZY_TEST_MODE` value with Payzy (probably `off`).
4. Make sure `APP_URL` is the live HTTPS site URL.
5. Do a real Rs 10 end-to-end payment before announcing it.

## Open questions for Payzy support

1. Is there a server-to-server callback/webhook or an order-status API? Without one, tabs closed after paying leave orders `PENDING`.
2. What do response codes other than `00` mean? We treat everything else as failed and log the code.
3. Production value of `x_test_mode` (probably `off`)?
4. Is `x_version=1.0` (correct) or the sample's `x_version1.0` accepted in the request signature? We send the correct form unless `PAYZY_LEGACY_VERSION_SIGNING=on`.
5. `x_amount` format: we send whole amounts as `10` and others as `12500.50`. Is that right for the signature and for your side?
6. Maximum length / allowed characters of `x_order_id` (we send `VOLTA-VLK-YYMMDD-XXXXXXXXXX-<n>`, about 30 characters), and can an `x_order_id` be reused after a failed or cancelled attempt? (We always use a new one.)
7. Are empty strings accepted for optional fields (`x_company`, `x_zip`, `x_email`, `x_ship_to_*`)? We send them empty but identical in the sign string and payload.
8. Does the sandbox accept amounts other than Rs 10, and are there minimum/maximum instalment amounts in production?
9. Does Payzy resend the customer to `x_response_url` on cancel, or only on completion?
10. Refunds and cancellations: how are they done (merchant portal only)?
