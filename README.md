# VALTA.LK

Sri Lankan online store (mobile phones, electronics, accessories). Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod. **Cash on delivery only.** HEXALYTE ERP is the source of truth for catalogue, prices, stock, reservations and orders.

> **ERP status:** the client follows the authoritative HEXALYTE docs (`API_INTEGRATION_GUIDE.md`, `openapi.yaml`). It has only been exercised against a mock ERP built from those docs, never a live ERP. See [docs/ERP_INTEGRATION.md](docs/ERP_INTEGRATION.md).

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

## Layout

```
apps/web/src/app/(store)/   storefront pages
apps/web/src/app/api/store/ server routes (no open ERP proxy; each route has a fixed, validated purpose)
apps/web/src/lib/erp/       ERP client + modules (server-only)
apps/web/src/lib/checkout/  order placement (prices/totals recomputed from ERP data)
apps/web/src/lib/security/  rate limiting, origin check
apps/web/src/lib/validation Zod schemas (shared by browser and server)
apps/web/tests/             unit, integration, e2e, mock ERP
docs/                       architecture, ERP integration, environment, deployment
```

No database or separate backend exists by design; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Known limitations

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#known-limitations-and-blockers).
