import { defineConfig } from "prisma/config";

// DATABASE_URL comes from the environment (.env.local in development, the host's secret store in production).
// Never point development migrations at a production database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
