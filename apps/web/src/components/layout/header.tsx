import Link from "next/link";
import { MapPin, Phone, PhoneCall } from "lucide-react";
import { Suspense } from "react";
import { listBrands, listProducts } from "@/lib/erp/catalogue";
import { getSettings } from "@/lib/erp/settings";
import { activeSeason } from "@/lib/season";
import { Pumpkin } from "./halloween";
import { siteConfig } from "@/lib/site-config";
import { getContent } from "@/lib/site-content";
import { getStoreInfo, telHref } from "@/lib/store-info";
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
  const [{ categories, hasDeals, quick: autoQuick }, customer, settings, season, info, searches] = await Promise.all([
    loadNavData(),
    accounts ? getCurrentCustomer() : null,
    getSettings().catch(() => null),
    activeSeason(),
    getStoreInfo(),
    getContent("popular-searches"),
  ]);
  // Popular searches set by staff (Admin, Content, Search); otherwise the biggest brands and categories.
  const quick = searches?.items.length ? searches.items.map((x) => ({ label: x.label, href: `/search?q=${encodeURIComponent(x.label)}` })) : autoQuick;
  const cod = settings?.paymentMethods.COD === true;
  // As on ugreen.lk: the store's line on the left (a seasonal theme brings its own), and the phone numbers and Store
  // Locator on the right. All of it is set in the admin (Settings, Store details).
  const halloween = season?.season === "halloween";
  const announcement = season?.message || info.topLine || `${siteConfig.name} Sri Lanka Official Store`;
  const phones = [info.phone, info.phone2].filter(Boolean);
  return (
    <>
      <div role="region" aria-label="Store information" className={`on-dark text-white ${halloween ? "bg-[#1d0f29]" : "bg-ink"}`}>
        <div className="container-wide flex h-9 items-center justify-between gap-6 text-xs">
          <div className="marquee flex min-w-0 flex-1 items-center gap-2 font-bold uppercase tracking-[0.04em]">
            {halloween ? <Pumpkin className="h-4 w-4 shrink-0" /> : null}
            <AnnouncementLine text={announcement} />
          </div>
          {phones.length || info.mapUrl ? (
            <ul aria-label="Contact" className="hidden shrink-0 items-center gap-3 divide-x divide-white/40 font-bold md:flex [&>li+li]:pl-3">
              {phones.map((n, k) => (
                <li key={n}>
                  <a href={telHref(n)} className="inline-flex h-7 items-center gap-1.5 hover:text-brand-500">
                    {k === 0 ? <Phone className="h-3.5 w-3.5" aria-hidden /> : <PhoneCall className="h-3.5 w-3.5" aria-hidden />} {n}
                  </a>
                </li>
              ))}
              {info.mapUrl ? (
                <li>
                  <a href={info.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1.5 hover:text-brand-500">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Store Locator<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <HeaderShell>
        <div className="container-wide flex items-center gap-x-1.5 py-2.5 xs:gap-x-3 md:grid md:h-16 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-8 md:py-0">
          <MobileMenu categories={categories} hasDeals={hasDeals} />
          <Wordmark shine pumpkin={halloween} className="shrink-0 text-[1.65rem] leading-none text-ink xs:text-[1.9rem] sm:text-[2.2rem] lg:text-[2.4rem]" />
          {/* On phones the search bar sits under the sticky header (below) so the sticky part stays one slim row. */}
          <div className="hidden md:mx-auto md:block md:w-full md:max-w-4xl">
            <SearchBox size="lg" popular={quick} />
          </div>
          <div className="ml-auto flex items-center gap-0.5 xs:gap-1 md:ml-0 lg:gap-2">
            {/* As on ugreen.lk: businesses can apply to buy wholesale. */}
            <Link href="/wholesale" className="hidden min-h-8 items-center rounded-full bg-ink px-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white hover:bg-ink/85 lg:inline-flex">
              Apply wholesale
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
