# VOLTA.LK

Sri Lankan online store (mobile phones, electronics, accessories). Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod. **Cash on delivery only.** HEXALYTE ERP is the source of truth for catalogue, prices, stock, reservations and orders.

> **ERP status:** the client follows the authoritative HEXALYTE docs (`API_INTEGRATION_GUIDE.md`, `openapi.yaml`). The automated tests use a mock ERP built from those docs; the site has also been run against the real ERP code locally with a disposable test shop (`tools/erp-local`). It has not been run against a staging or production ERP. See [docs/ERP_INTEGRATION.md](docs/ERP_INTEGRATION.md).

## Quick start

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # then fill in values
npm run mock-erp          # terminal 1: local mock ERP on :4010 (dev/test only)
npm run dev               # terminal 2: http://localhost:3000
```

To use the mock ERP, set in `apps/web/.env.local`:

```
HX_API_BASE=http://localhost:4010/api/v1/store-api
HX_STORE_CREDENTIAL=hxs_test.testsecret
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + integration (starts the mock ERP itself) |
| `npm run e2e` | Playwright (builds the app, starts mock ERP + app on :3100/:4010). First run: `npx playwright install chromium` |
| `npm run build` | Production build |
| `npm run dev-db` | Optional local website database (embedded PostgreSQL on :5498, applies the migrations); development only |

## Layout

```
apps/web/src/app/(home)/       homepage
apps/web/src/app/(store)/      storefront pages
apps/web/src/app/(admin)/      staff console (/admin), for accounts listed in ADMIN_EMAILS
apps/web/src/app/api/store/    storefront routes (no open ERP proxy; each route has a fixed, validated purpose)
apps/web/src/app/api/admin/    admin routes (every one checks the admin session)
apps/web/src/app/api/internal/ scheduler endpoint (order sync), bearer-secret protected
apps/web/src/lib/erp/          ERP client + modules (server-only)
apps/web/src/lib/checkout/     order placement (prices/totals recomputed from ERP data)
apps/web/src/lib/orders/       website order records and their ERP sync
apps/web/src/lib/admin/        admin access, reports and admin APIs
apps/web/src/lib/security/     rate limiting, origin check
apps/web/src/lib/validation    Zod schemas (shared by browser and server)
apps/web/prisma/               website database schema and migrations
apps/web/tests/                unit, integration, e2e, mock ERP
docs/                          architecture, ERP integration, environment, deployment
```

There is no separate backend. An optional website-only PostgreSQL database (Prisma) holds customer accounts, the website's own order records, product presentation content, marketing content and staff settings; it never stores products, stock or prices as a source of truth. Without `DATABASE_URL` the site runs guest-only. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Known limitations

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#known-limitations-and-blockers).
