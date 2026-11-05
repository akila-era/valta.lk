"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The store's information pages, listed beside every text page so the page uses the full width. */
const INFO_LINKS = [
  { href: "/about", label: "About us" },
  { href: "/faqs", label: "FAQs" },
  { href: "/shipping-policy", label: "Shipping policy" },
  { href: "/returns-policy", label: "Returns policy" },
  { href: "/warranty-policy", label: "Warranty & refund policy" },
  { href: "/privacy-policy", label: "Privacy policy" },
  { href: "/terms", label: "Terms & conditions" },
  { href: "/track-order", label: "Track your order" },
  { href: "/wholesale", label: "Apply for wholesale" },
  { href: "/contact", label: "Contact us" },
] as const;

/** Side list on wide screens; a row of chips that scrolls sideways on phones. The current page is marked. */
export function InfoNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Information pages">
      <h2 className="mb-3 hidden text-[15px] font-semibold uppercase tracking-[0.02em] text-ink lg:block">Information</h2>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
        {INFO_LINKS.map((l) => {
          const on = pathname === l.href;
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors lg:rounded-control lg:border-0 lg:px-3 lg:py-2 ${
                  on ? "border-ink bg-ink font-semibold text-white lg:bg-surface lg:text-ink" : "border-border text-ink/75 hover:text-ink lg:hover:bg-surface"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
