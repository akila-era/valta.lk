"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, FileText, Headset, RefreshCw, ShieldCheck, Store, Truck } from "lucide-react";

const LINKS = [
  { href: "/about", label: "About us", icon: Store },
  { href: "/contact", label: "Contact us", icon: Headset },
  { href: "/faq", label: "FAQ", icon: CircleHelp },
  { href: "/shipping-policy", label: "Shipping", icon: Truck },
  { href: "/returns-policy", label: "Returns", icon: RefreshCw },
  { href: "/privacy-policy", label: "Privacy", icon: ShieldCheck },
  { href: "/terms", label: "Terms", icon: FileText },
] as const;

/** Section navigation shared by every information page: icon chips on phones, a tidy card list beside the text on desktop. */
export function InfoNav() {
  const path = usePathname();
  return (
    <nav aria-label="Help and information" className="min-w-0 lg:sticky lg:top-40 lg:self-start">
      <p className="mb-2 hidden px-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted lg:block">Help &amp; info</p>
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:rounded-2xl lg:border lg:border-border lg:p-2 lg:pb-2 [&::-webkit-scrollbar]:hidden">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const on = path === href;
          return (
            <li key={href} className="shrink-0 lg:shrink">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`group relative inline-flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors lg:rounded-xl lg:px-3 ${
                  on ? "bg-ink text-white lg:bg-brand-50 lg:text-ink" : "bg-surface text-ink hover:bg-border lg:bg-transparent lg:text-ink/75 lg:hover:bg-surface lg:hover:text-ink"
                }`}
              >
                {on && <span aria-hidden className="absolute inset-y-2 left-0 hidden w-1 rounded-full bg-brand-500 lg:block" />}
                <Icon className={`h-4 w-4 shrink-0 transition-colors ${on ? "text-brand-500" : "text-muted group-hover:text-brand-600"}`} strokeWidth={1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
