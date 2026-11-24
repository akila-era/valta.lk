import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, KeyRound, Mail, MapPin } from "lucide-react";
import { AccountsUnavailableNotice } from "@/components/account/auth-card";
import { ProfileForm } from "@/components/account/profile-form";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

/** Name and phone (used to fill in checkout), with the password and address notes beside them. */
export default async function AccountProfilePage() {
  if (!accountsEnabled()) return <AccountsUnavailableNotice />;
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/account/login?next=/account/profile");

  return (
    <>
      <section aria-labelledby="profile-title" className="rounded-panel border border-border bg-bg p-6 sm:p-8">
        <p className="eyebrow">Your details</p>
        <h2 id="profile-title" className="font-display text-2xl font-extrabold tracking-title text-ink">Personal information</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 max-w-lg">
            <p className="mb-5 text-sm text-muted">Your name and phone fill in checkout for you.</p>
            <ProfileForm name={customer.name} phone={customer.phone} />
          </div>
          <ul className="space-y-3 text-sm">
            <li className="rounded-card bg-surface p-4">
              <p className="flex items-center gap-2 font-bold text-ink"><Mail className="h-4 w-4 text-brand-600" aria-hidden /> Email</p>
              <p className="mt-1 break-all text-xs font-semibold text-ink">{customer.email}</p>
              <p className="mt-1 text-xs leading-5 text-muted">Used to sign in. It cannot be changed.</p>
            </li>
            <li className="rounded-card bg-surface p-4">
              <p className="flex items-center gap-2 font-bold text-ink"><KeyRound className="h-4 w-4 text-brand-600" aria-hidden /> Password</p>
              <p className="mt-1 text-xs leading-5 text-muted">Change it with a reset link sent to your email.</p>
              <Link href="/account/forgot-password" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline">
                Reset password <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
            <li className="rounded-card bg-surface p-4">
              <p className="flex items-center gap-2 font-bold text-ink"><MapPin className="h-4 w-4 text-brand-600" aria-hidden /> Delivery address</p>
              <p className="mt-1 text-xs leading-5 text-muted">Entered at checkout for each order. No address book is stored.</p>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
