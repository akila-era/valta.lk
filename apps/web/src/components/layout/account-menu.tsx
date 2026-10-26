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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    const onDoc = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpenedAt(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  if (!enabled) return null;

  const first = customer?.name.split(/\s+/)[0];
  const item = "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-surface hover:text-brand-600";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={customer ? `My account, signed in as ${customer.name}` : "My account, sign in or register"}
        onClick={() => setOpenedAt(open ? null : pathname)}
        className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-medium hover:text-brand-600 md:px-3"
      >
        <User className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        <span className="hidden max-w-[9rem] truncate lg:inline">{customer ? `Hi, ${first}` : "My Account"}</span>
        <ChevronDown className={`hidden h-4 w-4 transition-transform lg:block ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div id={`${id}-menu`} className="absolute right-0 top-full z-50 mt-2 w-64 rounded-card border border-border bg-bg p-2 text-ink shadow-card">
          {customer ? (
            <>
              <p className="truncate px-3 pb-2 pt-1 text-xs text-muted">Signed in as <span className="font-semibold text-ink">{customer.name}</span></p>
              <Link href="/account" onClick={() => setOpenedAt(null)} className={item}><User className="h-4 w-4" aria-hidden /> My account</Link>
              <Link href="/account#orders-title" onClick={() => setOpenedAt(null)} className={item}><Package className="h-4 w-4" aria-hidden /> My orders</Link>
              <div className="mt-1 border-t border-border pt-1">
                <SignOutButton className={`${item} w-full text-left`} onDone={() => setOpenedAt(null)} />
              </div>
            </>
          ) : (
            <>
              <Link href={`/account/login?next=${encodeURIComponent(pathname)}`} onClick={() => setOpenedAt(null)} className="btn-primary w-full">
                <LogIn className="h-4 w-4" aria-hidden /> Sign in
              </Link>
              <Link href={`/account/register?next=${encodeURIComponent(pathname)}`} onClick={() => setOpenedAt(null)} className={`${item} mt-1 justify-center`}>
                <UserPlus className="h-4 w-4" aria-hidden /> Create an account
              </Link>
              <div className="mt-1 border-t border-border pt-1">
                <Link href="/track-order" onClick={() => setOpenedAt(null)} className={item}><Package className="h-4 w-4" aria-hidden /> Track an order</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
