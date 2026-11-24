# HEXALYTE ERP integration

## Status

The client follows the authoritative ERP documents found at
`C:\Users\Akila\CascadeProjects\windsurf-project\docs\` (ERP repo, branch `feature/ecommerce-cod-launch`):
`API_INTEGRATION_GUIDE.md`, `openapi.yaml`, `ERP_API_GAP_ANALYSIS.md`, `WEBSITE_QUICKSTART.md`, `STORE_ORDER_API.md`.

**It has not been run against a staging or production ERP.** All automated tests use `apps/web/tests/mock-erp/server.ts`, a mock written from those documents (envelope, decimal strings, strict request bodies, replay semantics). A passing suite shows the client matches the documents as the mock reads them, not that a deployed ERP behaves identically. The site has additionally been run by hand against the real ERP code on a local, disposable database; see "Verification status" below.

Those ERP documents are on the ERP developer's machine and are not part of this repository, so they cannot be re-checked from here.

## Contract mapping

| Need | ERP endpoint | Where |
| --- | --- | --- |
| Connectivity | `GET /ping` | `settings.ts` |
| Checkout gate | `GET /settings` (`ordersEnabled`, `paymentMethods.COD`, `currency`, `deliveryCharge`) | `settings.ts` |
| Catalogue | `GET /catalogue/products` (`limit` ≤100, `cursor`, `updatedSince`; uses `generatedAt`, `removed[]`, `removedTruncated`) | `catalogue.ts` |
| Live price/stock for cart lines | `GET /catalogue/products/{id}` (the availability feed is a bulk cursor feed, not per item) | `availability.ts` |
| Reservations | `POST /reservations`, `POST /reservations/{ref}/release` | `reservations.ts` |
| Order | `POST /orders` (`Idempotency-Key` = `externalRef`) | `orders.ts` |
| Status/tracking | `GET /orders/{ref}` (`trackingNumber`, `carrierName`); read when an order is viewed, cached on `WebOrder` (see ARCHITECTURE.md) | `order-tracking.ts` |
| Cancel | `POST /orders/{ref}/cancel` | `order-tracking.ts` |

Auth: `Authorization: Bearer hxs_<keyId>.<secret>`, server-side only.

## Decisions that follow from the contract

- **Money** is a decimal string on the wire (`"1250.50"`); parsed to numbers on read and formatted on write (`utils/money.ts`).
- **Order body** contains only documented fields (the ERP rejects unknown ones): delivery uses `addressLine1`; empty optional fields are omitted; `variantKey` only when present.
- **No `reservationRef` on orders.** The ERP creates and owns the stock hold atomically with the order, so there is no orphan hold to clean up and no hold that can expire mid-checkout. The reservation module and `/api/store/reservations` route exist (cart-time holds) but the UI does not use them.
- **Slugs/categories/specs** do not exist in the ERP: slug = `slugify(name)-<ERP id>`, category slug = `slugify(category name)`, specs are built from brand/model/condition/warranty only. There is no gallery (one image max; relative paths are resolved against the ERP host, so set `ERP_IMAGE_HOSTS`).
- **Sale price** is shown only while `discountActive` is true.
- **Availability** is `IN_STOCK` with `purchasableQuantity > 0` (quantity capped at 20 by the ERP). `UNKNOWN`/`NOT_FULFILLABLE` are treated as unavailable.
- **Order lines have no names**, so confirmation/tracking look names up in the cached catalogue ("Item" if the product has since been unpublished).
- **Retries:** network errors and 5xx retry with the same `Idempotency-Key`; `409 IDEMPOTENCY_IN_PROGRESS` waits 1 s and repeats; other 4xx are never retried. `429` is surfaced, not retried.
- **Rate limit** is about 300 requests/min per website. A checkout makes one request per distinct cart item plus settings and the order.
- **COD:** `paymentStatus` is `COD_PENDING` until staff record cash (`COD_COLLECTED`). The website never reports payments (`POST /orders/{ref}/payment` is ONLINE only and not used).
- **Returns** are handled in the ERP and do not change the website order status.

## ERP-side prerequisites (owner of the shop)

Super Admin has approved E-Commerce; the Owner registered the store (credential shown once), enabled catalogue, reservations and orders, chose a fulfilment branch, allowed COD, set the delivery charge, and published products with website prices. COD dispatch needs the Customer Credit feature on the branch (otherwise dispatch returns `CUSTOMER_CREDIT_REQUIRED`). COD orders unconfirmed after 24 h are cancelled by the ERP.

## Not verified against the live ERP

Actual response bodies for every endpoint, image URLs, `removedTruncated` behaviour, `IDEMPOTENCY_IN_PROGRESS` timing, rate limiting behaviour, and the exact `variantKey` format for real products.


## Verification status

- **Mock ERP** (`apps/web/tests/mock-erp`): used by the automated unit, integration and browser suites.
- **Real ERP code, local, disposable** (`tools/erp-local`): the site has been run against the actual HEXALYTE backend (`/api/v1/store-api`) with a test shop. Verified: ping, settings (COD on, delivery charge), catalogue with variants, sub-categories and a sale price, a variant COD order stored with variant key `256GB::Black`, the exact total (items + delivery charge), idempotent retry (two POSTs, one order), cancellation before dispatch (hold released), confirm → dispatch → deliver with COD marked collected, tracking number and carrier shown after dispatch, website cancel refused after dispatch, no stock deducted by the website.
- **Not yet done:** a staging ERP with real products/images and the real store credential. See `docs/DEPLOYMENT.md`.
