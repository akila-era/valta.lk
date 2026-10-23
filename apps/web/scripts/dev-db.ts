/**
 * Local development database for customer accounts: PGlite (embedded PostgreSQL) persisted in ./.dev-db and
 * served over the Postgres wire protocol, so the app uses the normal `pg` driver and DATABASE_URL.
 * Development only. Production must use a real PostgreSQL server.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const port = Number(process.env.DEV_DB_PORT ?? 5498);
  const dataDir = path.resolve(__dirname, "../.dev-db");
  const db = await PGlite.create({ dataDir });

  // Apply each migration once (tracked like Prisma's own table name, but separate so it never clashes).
  await db.exec(`CREATE TABLE IF NOT EXISTS "_dev_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const dir = path.resolve(__dirname, "../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    const done = await db.query(`SELECT 1 FROM "_dev_migrations" WHERE name = $1`, [m]);
    if (done.rows.length) continue;
    await db.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    await db.query(`INSERT INTO "_dev_migrations" (name) VALUES ($1)`, [m]);
    console.log(`applied migration ${m}`);
  }

  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  console.log(`dev database (${dataDir}) listening on 127.0.0.1:${port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
