/**
 * Disposable PostgreSQL for browser E2E tests: in-memory PGlite exposed over the Postgres wire protocol,
 * with the real migration SQL applied. Nothing is written to disk and no real database is touched.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const port = Number(process.env.E2E_DB_PORT ?? 5499);
  const db = await PGlite.create();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  console.log(`e2e database listening on 127.0.0.1:${port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
