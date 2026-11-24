import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Website database (customer accounts only). Returns null when DATABASE_URL is not configured. */
const g = globalThis as unknown as { __voltaDb?: PrismaClient; __voltaDbUrl?: string };

export function getDb(): PrismaClient | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!g.__voltaDb || g.__voltaDbUrl !== url) {
    g.__voltaDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    g.__voltaDbUrl = url;
  }
  return g.__voltaDb;
}

export class AccountsUnavailable extends Error {
  constructor() {
    super("Customer accounts are not configured");
    this.name = "AccountsUnavailable";
  }
}

export function requireDb(): PrismaClient {
  const db = getDb();
  if (!db) throw new AccountsUnavailable();
  return db;
}
