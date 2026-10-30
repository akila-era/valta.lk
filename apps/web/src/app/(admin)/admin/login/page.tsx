import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Boxes, ClipboardList, Lock, RefreshCw, type LucideIcon } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { AuthForm } from "@/components/account/auth-form";
import { requireAdmin } from "@/lib/admin/auth";
import { accountsEnabled } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ClipboardList, title: "Orders and cash on delivery", text: "New orders, dispatch and COD collection." },
  { icon: Boxes, title: "Products and content", text: "Photos, descriptions, deals and reviews." },
  { icon: RefreshCw, title: "ERP connection", text: "Live catalogue, stock and order sync." },
];

/**
 * Staff sign-in: the store's dark brand panel beside a clean sign-in card (stacked on phones). Only accounts listed as
 * staff can sign in here; the form and its checks are the shared account form in admin mode.
 */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  if ((await requireAdmin()).kind === "ok") redirect(next?.startsWith("/admin/") ? next : "/admin/orders");
  return (
    <div className="grid min-h-svh bg-surface lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <section aria-label="VOLTA.LK store admin" className="relative isolate flex flex-col justify-between overflow-hidden bg-ink px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12">
        <span aria-hidden className="pointer-events-none absolute -left-24 -top-28 -z-10 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 -z-10 h-[28rem] w-[28rem] rounded-full border border-white/10" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 -right-8 -z-10 h-72 w-72 rounded-full border border-brand-500/30" />

        <div className="flex items-center gap-2.5">
          <span className="font-display text-[1.7rem] font-extrabold leading-none tracking-[-0.02em]">
            V<span className="text-brand-500">O</span>LTA<span className="text-[0.82em]">.LK</span>
          </span>
          <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">Admin</span>
        </div>

        <div className="my-10 max-w-md lg:my-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-500">Store admin</p>
          <p className="mt-3 font-display text-[clamp(2rem,1.4rem+2.4vw,3.2rem)] font-extrabold leading-[1.05] tracking-title">
            Run your store from one place.
          </p>
          <ul className="mt-8 hidden space-y-4 sm:block">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-brand-500">
                  <p.icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{p.title}</span>
                  <span className="block text-sm text-white/60">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-white/40 lg:block">© {new Date().getFullYear()} VOLTA.LK</p>
      </section>

      {/* Sign-in card */}
      <section aria-labelledby="admin-signin" className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-panel border border-border bg-bg p-6 shadow-card sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-neon">
              <Lock className="h-5 w-5" aria-hidden />
            </span>
            <h1 id="admin-signin" className="mt-5 font-display text-2xl font-extrabold tracking-title text-ink">Admin sign in</h1>
            <p className="mt-1 text-sm text-muted">For VOLTA.LK store staff only.</p>
            <div className="mt-6">
              <AuthForm mode="admin" next={next} />
            </div>
          </div>
          <Link href="/" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the store
          </Link>
        </div>
      </section>
    </div>
  );
}
