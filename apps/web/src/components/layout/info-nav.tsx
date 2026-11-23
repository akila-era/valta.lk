"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
  { href: "/faq", label: "FAQ" },
  { href: "/shipping-policy", label: "Shipping" },
  { href: "/returns-policy", label: "Returns" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/** Section navigation shared by every information page: chips on phones, a quiet list beside the text on desktop. */
export function InfoNav() {
  const path = usePathname();
  return (
    <nav aria-label="Help and information" className="min-w-0 lg:sticky lg:top-40">
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {LINKS.map((l) => {
          const on = path === l.href;
          return (
            <li key={l.href} className="shrink-0 lg:shrink">
              <Link
                href={l.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 w-full items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors lg:rounded-xl ${on ? "bg-ink text-white" : "bg-surface text-ink hover:bg-border lg:bg-transparent lg:text-muted lg:hover:bg-surface lg:hover:text-ink"}`}
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
