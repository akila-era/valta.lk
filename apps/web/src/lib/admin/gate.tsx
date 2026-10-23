import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NoAccess } from "@/components/admin/no-access";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { requireAdmin } from "./auth";

/**
 * Every admin page calls this first (layouts render in parallel with pages, so the layout alone is not a guard).
 * Returns null when access is granted, otherwise something to render; signed-out visitors go to the admin sign-in.
 */
export async function adminGate(next: string): Promise<ReactNode | null> {
  const access = await requireAdmin();
  if (access.kind === "signed-out") redirect(`/admin/login?next=${next}`);
  if (access.kind === "forbidden") return <NoAccess title="No access" text="This area is for store staff. Your account is not on the admin list." />;
  return null;
}

/** The website database, or a notice to render when it is not configured. */
export function adminDb(): { db: PrismaClient; notice: null } | { db: null; notice: ReactNode } {
  const db = getDb();
  if (db) return { db, notice: null };
  return { db: null, notice: <NoAccess title="Database unavailable" text="The website database is not configured, so this data is not stored here." /> };
}
