"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Heart, LayoutDashboard, Package, PackageSearch, UserRound, type LucideIcon } from "lucide-react";
import { StoreHeroBanner } from "@/components/ui/store-hero-banner";
import { SignOutButton } from "./sign-out-button";

type AccountSection = "overview" | "orders" | "profile";

const NAV: { href: string; label: string; icon: LucideIcon; section?: AccountSection }[] = [
  { href: "/account", label: "Overview", icon: LayoutDashboard, section: "overview" },
  { href: "/account/orders", label: "My orders", icon: Package, section: "orders" },
  { href: "/account/profile", label: "Profile", icon: UserRound, section: "profile" },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/track-order", label: "Track an order", icon: PackageSearch },
];

const TITLES: Record<AccountSection, { title: string; crumb: string; intro: string }> = {
  overview: { title: "My account", crumb: "Account", intro: "Your orders, delivery progress and profile in one place." },
  orders: { title: "My orders", crumb: "Orders", intro: "Every order placed while signed in, with live delivery progress." },
  profile: { title: "Profile", crumb: "Profile", intro: "Your name and phone, used to fill in checkout for you." },
};

const sectionFor = (pathname: string): AccountSection =>
  pathname.startsWith("/account/orders") ? "orders" : pathname.startsWith("/account/profile") ? "profile" : "overview";

/**
 * The signed-in account area, rendered once by the account layout: the page banner and a sidebar that stays in view
 * while the page scrolls. Moving between Overview, My orders and Profile only swaps the section beside it (the site-wide
 * click spinner shows meanwhile, once), so the banner and sidebar never disappear. The highlight follows the address.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const t = TITLES[section];
  return (
    <div className="space-y-8">
      <StoreHeroBanner
        title={t.title}
        breadcrumbs={section === "overview" ? [{ label: "Home", href: "/" }, { label: "Account" }] : [{ label: "Home", href: "/" }, { label: "Account", href: "/account" }, { label: t.crumb }]}
        intro={t.intro}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--hdr-sticky,7rem)+1.5rem)]">
          <nav aria-label="Account" className="rounded-panel border border-border bg-bg p-2.5">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
              {NAV.map((item) => {
                const on = item.section === section;
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={on ? "page" : undefined}
                      className={`group relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-control px-3.5 text-sm font-semibold transition-colors ${
                        on ? "bg-brand-50 text-brand-700" : "text-ink/75 hover:bg-surface hover:text-ink"
                      }`}
                    >
                      {on ? <span aria-hidden className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-brand-500 lg:block" /> : null}
                      <item.icon className={`h-[18px] w-[18px] ${on ? "text-brand-600" : "text-muted group-hover:text-brand-600"}`} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 hidden border-t border-border px-1.5 pt-3 lg:block">
              <SignOutButton className="btn-ghost min-h-10 w-full justify-start px-2 text-sm text-danger hover:bg-danger/5" />
            </div>
          </nav>
        </aside>
        <div className="min-w-0 space-y-8">{children}</div>
      </div>
    </div>
  );
}
