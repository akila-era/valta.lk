import Link from "next/link";
import { Headset, Phone, Truck, Wallet } from "lucide-react";
import { Suspense } from "react";
import { listBrands, listProducts } from "@/lib/erp/catalogue";
import { getSettings } from "@/lib/erp/settings";
import { siteConfig } from "@/lib/site-config";
import { formatLkr } from "@/lib/utils/money";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { AccountMenu } from "./account-menu";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartLink } from "./cart-link";
import { WishlistLink } from "./wishlist-link";
import { CategoryNav } from "./category-nav";
import { HeaderShell } from "./header-shell";
import { MobileMenu } from "./mobile-menu";
import { MobileSearch } from "./mobile-search";
import { SearchBox } from "./search-box";

async function loadNavData() {
  try {
    const [cats, deals, brands] = await Promise.all([listProducts({ pageSize: 1 }), listProducts({ pageSize: 1, onSale: true }), listBrands()]);
    // "Popular" = the biggest brands and categories in the catalogue (we have no search-history data)
    const quick = [
      ...brands.slice(0, 4).map((b) => ({ label: b.name, href: `/products?brand=${encodeURIComponent(b.name)}` })),
      ...[...cats.categories].sort((a, b) => b.count - a.count).slice(0, 3).map((c) => ({ label: c.name, href: `/categories/${c.slug}` })),
    ];
    return { categories: cats.categories.map((c) => ({ slug: c.slug, name: c.name, subs: c.subs.map((x) => ({ slug: x.slug, name: x.name })) })), hasDeals: deals.total > 0, hasBrands: brands.length > 0, quick };
  } catch {
    return { categories: [], hasDeals: false, hasBrands: false, quick: [] }; // the header must still render when the ERP is unreachable
  }
}

import { AnnouncementLine } from "./announcement-line";
import { Wordmark } from "./wordmark";

export { Wordmark };

export async function Header() {
  const accounts = accountsEnabled();
  const [{ categories, hasDeals, quick }, customer, settings] = await Promise.all([
    loadNavData(),
    accounts ? getCurrentCustomer() : null,
    getSettings().catch(() => null),
  ]);
  const cod = settings?.paymentMethods.COD === true;
  const announcement = siteConfig.announcement || `Welcome to ${siteConfig.name}`;
  return (
    <>
      {/* Black top bar (neon orange accents): a welcome line (or the owner's SITE_ANNOUNCEMENT) plus facts from live ERP settings only. It scrolls away. */}
      <div role="region" aria-label="Store information" className="on-dark bg-ink text-white/85">
        <div className="container-wide flex h-9 items-center justify-between gap-6 text-xs">
          <ul className="flex min-w-0 flex-1 items-center gap-4 divide-white/15 sm:divide-x [&>li+li]:pl-4">
            <li className="marquee min-w-0 flex-1 font-bold uppercase tracking-[0.08em] text-white">
              <AnnouncementLine text={announcement} />
            </li>
            {settings ? (
              <li className="hidden shrink-0 items-center gap-1.5 sm:flex md:hidden lg:flex">
                <Truck className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Delivery {formatLkr(settings.deliveryCharge)}
              </li>
            ) : null}
            {cod ? (
              <li className="hidden shrink-0 items-center gap-1.5 xl:flex">
                <Wallet className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Cash on Delivery Available
              </li>
            ) : null}
          </ul>
          <nav aria-label="Help" className="hidden shrink-0 items-center gap-4 divide-x divide-white/15 font-semibold md:flex [&>*+*]:pl-4">
            {siteConfig.phone ? (
              <a href={`tel:${siteConfig.phone.replace(/\s/g, "")}`} className="hidden h-7 items-center gap-1.5 rounded-sm hover:text-brand-500 lg:inline-flex">
                <Phone className="h-3.5 w-3.5 text-brand-500" aria-hidden /> {siteConfig.phone}
              </a>
            ) : null}
            <Link href="/track-order" className="inline-flex h-7 items-center rounded-sm hover:text-brand-500">Track order</Link>
            <Link href="/contact" className="inline-flex h-7 items-center rounded-sm hover:text-brand-500">Help</Link>
            <Link href="/about" className="inline-flex h-7 items-center rounded-sm hover:text-brand-500">About Us</Link>
          </nav>
        </div>
      </div>
      <HeaderShell>
        <div className="container-wide flex items-center gap-x-1.5 py-2.5 xs:gap-x-3 md:grid md:h-16 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-10 md:py-0">
          <MobileMenu categories={categories} hasDeals={hasDeals} />
          <Wordmark className="shrink-0 text-[1.5rem] leading-none text-ink xs:text-[1.75rem] sm:text-[2rem] lg:text-[2rem]" />
          {/* On phones the search bar sits under the sticky header (below) so the sticky part stays one slim row. */}
          <div className="hidden md:mx-auto md:block md:w-full md:max-w-3xl">
            <SearchBox size="lg" popular={quick} />
          </div>
          <div className="ml-auto flex items-center gap-0.5 xs:gap-1 md:ml-0 lg:gap-2">
            <Link href="/contact" className="hidden items-center gap-2.5 px-3 hover:text-brand-600 xl:inline-flex">
              <Headset className="h-7 w-7 text-brand-500" strokeWidth={1.5} aria-hidden />
              <span className="leading-tight">
                <span className="block text-[11px] text-muted">Need help?</span>
                <span className="block text-sm font-semibold">Support</span>
              </span>
            </Link>
            {/* Track order lives in the top bar, so the main row only adds the account menu when accounts exist. */}
            <MobileSearch popular={quick} />
            {accounts ? <AccountMenu customer={customer ? { name: customer.name } : null} enabled /> : null}
            <WishlistLink />
            <CartLink />
          </div>
        </div>
        <Suspense fallback={null}>
          <CategoryNav categories={categories} showDeals={hasDeals} />
        </Suspense>
      </HeaderShell>
      <div className="border-b border-border bg-bg px-3 py-2.5 md:hidden">
        <SearchBox size="lg" popular={quick} />
      </div>
      {/* One cart drawer for the page, opened by the header cart and the phone tab bar. */}
      <CartDrawer deliveryCharge={settings ? settings.deliveryCharge : null} cod={cod} />
    </>
  );
}
