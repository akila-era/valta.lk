import Link from "next/link";
import { Headset, PackageSearch, ShieldCheck, Truck, Wallet, type LucideIcon } from "lucide-react";
import type { HomeData } from "@/lib/home-data";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";

interface Item {
  icon: LucideIcon;
  title: string;
  text?: string;
  href?: string;
}

/**
 * Slim trust strip under the hero. Every item is a fact the store really has: the ERP's delivery charge, cash on delivery
 * when the ERP offers it, online order tracking, the published support number, and any claims the business itself has
 * entered in the site settings (SITE_HIGHLIGHTS, for example a warranty line). Nothing is written in here on the shop's behalf.
 */
export function TrustStrip({ checkout }: { checkout: HomeData["checkout"] }) {
  const items: Item[] = [
    checkout.deliveryCharge != null ? { icon: Truck, title: `Delivery ${formatLkr(checkout.deliveryCharge)}`, text: "Shown before you order", href: "/shipping-policy" } : null,
    checkout.cod ? { icon: Wallet, title: "Cash on delivery", text: "Pay when it arrives" } : null,
    { icon: PackageSearch, title: "Track your order", text: "Follow it online", href: "/track-order" },
    { icon: Headset, title: "Customer support", text: siteConfig.phone || "Here to help", href: "/contact" },
    ...siteConfig.highlights.map((h) => ({ icon: ShieldCheck, title: h })),
  ].filter((i): i is Item => Boolean(i)).slice(0, 5);

  return (
    <section aria-label="Shopping with VALTA.LK" className="border-b border-border bg-bg">
      <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-1 py-3 sm:grid-cols-4 lg:flex lg:justify-between lg:gap-x-8 lg:py-0">
        {items.map(({ icon: Icon, title, text, href }) => {
          const body = (
            <>
              <Icon className="h-5 w-5 shrink-0 text-brand-600" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{title}</span>
                {text && <span className="block truncate text-xs text-muted">{text}</span>}
              </span>
            </>
          );
          const cls = "flex min-h-14 items-center gap-3 py-2 lg:min-h-16";
          return (
            <li key={title} className="min-w-0">
              {href ? <Link href={href} className={`${cls} hover:text-brand-600`}>{body}</Link> : <div className={cls}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
