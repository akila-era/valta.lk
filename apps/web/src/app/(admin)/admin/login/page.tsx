import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { requireAdmin } from "@/lib/admin/auth";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Staff sign-in: the store wordmark and a plain sign-in card. Only accounts listed as staff can sign in here. */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if ((await requireAdmin()).kind === "ok") redirect(next?.startsWith("/admin/") ? next : "/admin/orders");
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-baseline gap-2 text-ink" aria-label="VOLTA.LK store">
          <span className="font-display text-[2rem] font-extrabold leading-none tracking-[-0.02em]">
            V<span className="text-brand-500">O</span>LTA<span className="text-[0.82em]">.LK</span>
          </span>
          <span className="text-sm font-semibold text-muted">Admin</span>
        </Link>
        <section aria-labelledby="admin-signin" className="rounded-panel border border-border bg-bg p-6 shadow-card sm:p-8">
          <h1 id="admin-signin" className="font-display text-2xl font-extrabold tracking-title text-ink">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted">Store staff only.</p>
          <div className="mt-6">
            <AuthForm mode="admin" next={next} />
          </div>
        </section>
        <Link href="/" className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the store
        </Link>
      </div>
    </div>
  );
}
