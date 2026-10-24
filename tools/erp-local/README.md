# Local HEXALYTE ERP for VALTA.LK integration testing

A **disposable** local ERP so VALTA.LK can be tested against the real ERP code (not the mock). It never touches the ERP's own `hexalyte` database.

| Piece | Where |
| --- | --- |
| ERP repo | `C:\Users\Akila\CascadeProjects\windsurf-project` (read-only for this workflow; nothing in it is modified) |
| Database | `hexalyte_valta_test` on the local PostgreSQL (:5432), schema created with `prisma db push` |
| Redis | local Redis (:6379), logical DB `5` |
| ERP API | `http://127.0.0.1:3101/api/v1` (store API at `/store-api`) |
| ERP owner login | `owner@valta.test` / `ValtaTest#2026` (test data only) |

## One-time setup

```bash
# 1. create the isolated database (safe to re-run)
node tools/erp-local/create-db.cjs

# 2. create its tables (run from the ERP backend folder; DATABASE_URL points at the NEW database)
cd C:/Users/Akila/CascadeProjects/windsurf-project/apps/backend
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/hexalyte_valta_test npx prisma db push --skip-generate
```

## Every time

```bash
# ERP backend on :3101 (from the ERP backend folder)
DATABASE_URL=<…/hexalyte_valta_test> PORT=3101 REDIS_URL=redis://localhost:6379/5 KEYCLOAK_AUTH_ENABLED=false npx tsx src/server.ts

# seed/refresh the test shop, test catalogue and the VALTA store; writes HX_API_BASE and a fresh
# HX_STORE_CREDENTIAL into apps/web/.env.local (the credential is never printed; re-running rotates it).
# <repo> is this repository's folder, e.g. E:/volta.lk/valta.lk. VALTA_ENV must point at its apps/web/.env.local:
# without it the script writes to its built-in default E:/valta-lk/apps/web/.env.local, an older checkout location.
DATABASE_URL=<…/hexalyte_valta_test> VALTA_ERP_OWNER_PASSWORD='ValtaTest#2026' VALTA_ENV=<repo>/apps/web/.env.local npx tsx <repo>/tools/erp-local/bootstrap.ts

# VALTA site (restart it after the credential changes)
npm run dev
```

Smoke test against the real ERP (places real orders in the disposable database only):

```bash
cd apps/web && npx playwright test -c playwright.real.config.ts
```

`bootstrap.ts` refuses to run unless `DATABASE_URL` ends in `hexalyte_valta_test`.
