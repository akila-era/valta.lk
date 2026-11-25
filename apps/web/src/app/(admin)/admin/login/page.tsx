import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3, Lock, Package, ShieldCheck } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { Wordmark } from "@/components/layout/header";
import { requireAdmin } from "@/lib/admin/auth";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const points = [
  { icon: Package, text: "Manage orders, products and stock" },
  { icon: BarChart3, text: "Control banners, deals and home sections" },
  { icon: ShieldCheck, text: "Staff access only, every sign-in is protected" },
];

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if ((await requireAdmin()).kind === "ok") redirect(next?.startsWith("/admin/") ? next : "/admin/orders");
  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: desktop only. */}
      <aside className="relative isolate hidden overflow-hidden bg-dark p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-[#34b673]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 right-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-[#06793d]/45 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
        <Wordmark dark className="text-3xl" />
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#5fcf93]">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Store admin
          </p>
          <h2 className="mt-5 max-w-md text-4xl font-semibold leading-[1.1] tracking-[-0.03em] xl:text-5xl">
            Run your store, <span className="text-[#5fcf93]">all in one place.</span>
          </h2>
          <ul className="mt-10 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-white/75">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#5fcf93]">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-white/40">VOLTA.LK</p>
      </aside>

      {/* Sign-in card. */}
      <section className="relative flex flex-col px-5 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden"><Wordmark className="text-2xl" /></span>
          <Link href="/" className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to store
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-on-brand shadow-[0_14px_28px_-14px_rgba(6,121,61,0.9)]">
            <Lock className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink sm:text-3xl">Admin sign in</h1>
          <p className="mt-2 text-[15px] leading-6 text-muted">For VOLTA.LK store staff only.</p>
          <div className="mt-7 rounded-3xl border border-border bg-white p-5 shadow-[0_24px_48px_-32px_rgba(17,17,17,0.35)] sm:p-7">
            <AuthForm mode="admin" next={next} />
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Secure sign-in. Unauthorised access is not permitted.
          </p>
        </div>
      </section>
    </main>
  );
}
