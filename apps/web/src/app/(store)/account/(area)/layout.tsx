import type { ReactNode } from "react";
import { AccountShell } from "@/components/account/account-shell";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";

/**
 * Shared frame of the signed-in account pages (Overview, My orders, Profile): the banner and sidebar stay on screen
 * while only the section changes. Signed out (or accounts off), the pages are shown bare: they redirect to sign in or
 * show the "accounts unavailable" notice themselves.
 */
export default async function AccountAreaLayout({ children }: { children: ReactNode }) {
  const customer = accountsEnabled() ? await getCurrentCustomer() : null;
  if (!customer) return children;
  return <AccountShell>{children}</AccountShell>;
}
