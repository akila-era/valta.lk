import "server-only";
import { getDb } from "./db";

/** Brands are matched case-insensitively on the name the ERP gives the product. */
export const brandKey = (name: string) => name.trim().toLowerCase();

export const brandLogoUrl = (id: string) => `/api/brand-logo/${id}`;

/** brandKey -> logo URL. Empty when the website database is missing or unreachable: logos are optional decoration. */
export async function brandLogoMap(): Promise<Map<string, string>> {
  const db = getDb();
  if (!db) return new Map();
  const rows = await db.brandLogo.findMany({ select: { id: true, brandKey: true } }).catch(() => []);
  return new Map(rows.map((r) => [r.brandKey, brandLogoUrl(r.id)]));
}
