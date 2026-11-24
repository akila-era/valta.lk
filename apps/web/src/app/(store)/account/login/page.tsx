import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountsUnavailableNotice, AuthCard } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { safeNext } from "@/lib/auth/safe-next";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if (await getCurrentCustomer()) redirect(safeNext(next));
  return (
    <AuthCard
      tabs={{ active: "login", next: next ? safeNext(next) : undefined }}
      title="Sign in"
      intro="Welcome back. Sign in to see your orders and check out faster."
    >
      <AuthForm mode="login" next={next} />
    </AuthCard>
  );
}
