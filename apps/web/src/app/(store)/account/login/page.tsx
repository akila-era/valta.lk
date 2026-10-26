import type { Metadata } from "next";
import Link from "next/link";
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
      title="Sign in"
      intro="Welcome back. Sign in to see your orders and check out faster."
      footer={<>New to VOLTA.LK? <Link href={`/account/register${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`} className="font-semibold text-brand-600 hover:underline">Create an account</Link></>}
    >
      <AuthForm mode="login" next={next} />
    </AuthCard>
  );
}
