// Creates the isolated ERP database for VOLTA integration testing. Never touches the ERP's own "hexalyte" database.
const fs = require("fs");
const { Client } = require("../../node_modules/pg");
const ERP = process.env.ERP_DIR ?? "C:/Users/Akila/CascadeProjects/windsurf-project/apps/backend";
const NAME = "hexalyte_volta_test";
const url = new URL((fs.readFileSync(`${ERP}/.env`, "utf8").match(/^DATABASE_URL=(.*)$/m) || [])[1].replace(/^"|"$/g, ""));
url.pathname = "/postgres";
(async () => {
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  const exists = (await c.query("select 1 from pg_database where datname = $1", [NAME])).rowCount;
  if (!exists) await c.query(`CREATE DATABASE ${NAME}`);
  console.log(exists ? `${NAME} already exists` : `${NAME} created`);
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
