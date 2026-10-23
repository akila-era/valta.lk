import type { Metadata } from "next";
import Link from "next/link";
import { AccountsUnavailableNotice, AuthCard } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  return (
    <AuthCard
      title="Reset your password"
      intro="Enter the email you registered with and we will send you a link to set a new password."
      footer={<Link href="/account/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>}
    >
      <AuthForm mode="forgot" />
    </AuthCard>
  );
}
