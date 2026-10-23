import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountsUnavailableNotice, AuthCard } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { requireAdmin } from "@/lib/admin/auth";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if ((await requireAdmin()).kind === "ok") redirect(next?.startsWith("/admin/") ? next : "/admin/orders");
  return (
    <AuthCard title="Admin sign in" intro="For VALTA.LK store staff only.">
      <AuthForm mode="admin" next={next} />
    </AuthCard>
  );
}
