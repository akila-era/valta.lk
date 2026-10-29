"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogIn, Package, User, UserPlus } from "lucide-react";
import { SignOutButton } from "@/components/account/sign-out-button";

/** Header "My Account" control. `customer` comes from the server session; null = signed out. */
export function AccountMenu({ customer, enabled }: { customer: { name: string } | null; enabled: boolean }) {
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  // Phones: the menu is a full-width panel just under the button (a 288px menu anchored to the button would run off
  // the left edge of a narrow screen). Measured when it opens; it closes if the page scrolls, so it never drifts.
  const [phoneTop, setPhoneTop] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpenedAt(null);
    const onScroll = () => phoneTop !== null && setOpenedAt(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, phoneTop]);

  if (!enabled) return null;

  const first = customer?.name.split(/\s+/)[0];
  const item = "flex min-h-10 items-center gap-3 rounded-control px-3 text-sm font-medium hover:bg-brand-50 hover:text-brand-600";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={customer ? `My account, signed in as ${customer.name}` : "My account, sign in or register"}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPhoneTop(window.matchMedia("(max-width: 639px)").matches ? Math.round(r.bottom + 8) : null);
          setOpenedAt(open ? null : pathname);
        }}
        className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-medium hover:text-brand-600 md:px-3"
      >
        <User className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        <span className="hidden max-w-[9rem] truncate lg:inline">{customer ? `Hi, ${first}` : "My Account"}</span>
        <ChevronDown className={`hidden h-4 w-4 transition-transform lg:block ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          style={phoneTop !== null ? { position: "fixed", top: phoneTop, left: 12, right: 12, width: "auto", marginTop: 0 } : undefined}
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-border border-t-[3px] border-t-brand-500 bg-bg text-ink shadow-[0_18px_40px_-16px_rgb(16_24_40/0.35)]">
          {customer ? (
            <>
              <div className="flex items-center gap-3 bg-brand-50 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold uppercase text-on-brand">{customer.name.trim().charAt(0)}</span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">Signed in as</span>
                  <span className="block truncate text-sm font-bold">{customer.name}</span>
                </span>
              </div>
              <div className="p-2">
                <Link href="/account" onClick={() => setOpenedAt(null)} className={item}><User className="h-4 w-4" aria-hidden /> My account</Link>
                <Link href="/account#orders-title" onClick={() => setOpenedAt(null)} className={item}><Package className="h-4 w-4" aria-hidden /> My orders</Link>
                <div className="mt-1 border-t border-border pt-1">
                  <SignOutButton className={`${item} w-full text-left`} onDone={() => setOpenedAt(null)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-4 pb-3 pt-4">
                <p className="text-sm font-bold">Welcome to VOLTA.LK</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">Sign in to see your orders and check out faster.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href={`/account/login?next=${encodeURIComponent(pathname)}`} onClick={() => setOpenedAt(null)} className="btn-primary min-h-10 px-3 text-[13px]">
                    <LogIn className="h-4 w-4" aria-hidden /> Sign in
                  </Link>
                  <Link href={`/account/register?next=${encodeURIComponent(pathname)}`} onClick={() => setOpenedAt(null)} className="btn min-h-10 border border-brand-500 px-3 text-[13px] text-brand-700 hover:bg-brand-50">
                    <UserPlus className="h-4 w-4" aria-hidden /> Register
                  </Link>
                </div>
              </div>
              <div className="border-t border-border p-2">
                <Link href="/track-order" onClick={() => setOpenedAt(null)} className={item}><Package className="h-4 w-4" aria-hidden /> Track an order</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
