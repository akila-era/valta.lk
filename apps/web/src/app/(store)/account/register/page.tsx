import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountsUnavailableNotice, AuthCard } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { safeNext } from "@/lib/auth/safe-next";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if (await getCurrentCustomer()) redirect(safeNext(next));
  return (
    <AuthCard
      title="Create your account"
      intro="Save your details for faster checkout and see all your orders in one place."
      footer={<>Already have an account? <Link href={`/account/login${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`} className="font-semibold text-brand-600 hover:underline">Sign in</Link></>}
    >
      <AuthForm mode="register" next={next} />
      <p className="mt-4 text-xs leading-5 text-muted">
        By creating an account you agree to our <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy-policy" className="underline">privacy policy</Link>.
      </p>
    </AuthCard>
  );
}
