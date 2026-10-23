import type { Metadata } from "next";
import Link from "next/link";
import { AccountsUnavailableNotice, AuthCard } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if (!token) {
    return (
      <AuthCard title="Link missing" intro="This page needs the link from your password reset email.">
        <Link href="/account/forgot-password" className="btn-primary">Request a new link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set a new password" intro="Choose a new password. You will be signed out on your other devices.">
      <AuthForm mode="reset" token={token} />
    </AuthCard>
  );
}
