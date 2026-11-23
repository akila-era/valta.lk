import type { Metadata } from "next";
import Link from "next/link";
import { Link2Off, LockKeyhole } from "lucide-react";
import { AccountsUnavailableNotice, AuthCard } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if (!token) {
    return (
      <AuthCard icon={Link2Off} title="Link missing" intro="This page needs the link from your password reset email." footer={<Link href="/account/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>}>
        <Link href="/account/forgot-password" className="btn-primary w-full">Request a new link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard icon={LockKeyhole} title="Set a new password" intro="Choose a new password. You will be signed out on your other devices." footer={<Link href="/account/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>}>
      <AuthForm mode="reset" token={token} />
    </AuthCard>
  );
}
