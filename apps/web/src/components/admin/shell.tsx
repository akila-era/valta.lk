"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, ChevronDown, ChevronRight, ExternalLink, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { SignOutButton } from "@/components/account/sign-out-button";
import { iconFor, isActive, NAV, type AdminBadges, type NavGroup } from "@/lib/admin/nav";

const STORAGE = "volta-admin-sidebar";
const listeners = new Set<() => void>();
const readCollapsed = () => {
  try {
    return localStorage.getItem(STORAGE) === "1";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

function Badge({ n, tone, onActive = false }: { n: number; tone: "new" | "pending" | "failed"; onActive?: boolean }) {
  if (!n) return null;
  return (
    <span className={`ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold ${onActive ? "bg-white text-brand-600" : tone === "failed" ? "bg-danger text-white" : "bg-brand-500 text-white"}`} aria-label={`${n} ${tone}`}>
      {n}
    </span>
  );
}

function Nav({ collapsed, badges, onNavigate }: { collapsed: boolean; badges: AdminBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = sp.get("status");
  const filter = sp.get("filter");
  const activeGroup = NAV.find((g) => g.items.some((i) => isActive(i, pathname, status, filter)))?.id;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (g: NavGroup) => open[g.id] ?? g.id === activeGroup;

  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-6 pt-2 [scrollbar-width:thin]">
      {NAV.map((g) => {
        const Icon = g.icon;
        const single = g.items.length === 1;
        const groupActive = g.id === activeGroup;
        if (single || collapsed) {
          const first = g.items[0];
          return (
            <Link
              key={g.id}
              href={first.href}
              onClick={onNavigate}
              title={g.label}
              aria-label={collapsed ? g.label : undefined}
              aria-current={groupActive && single ? "page" : undefined}
              className={`mt-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
                groupActive ? "bg-brand-500 font-semibold text-white" : "text-ink/75 hover:bg-surface hover:text-ink"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {!collapsed && g.label}
            </Link>
          );
        }
        const expanded = isOpen(g);
        return (
          <div key={g.id} className="mt-4">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`nav-${g.id}`}
              onClick={() => setOpen((o) => ({ ...o, [g.id]: !expanded }))}
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[12.5px] font-bold uppercase tracking-[0.1em] transition-colors hover:text-ink ${groupActive ? "text-brand-600" : "text-muted"}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="text-left leading-tight">{g.label}</span>
              <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`} aria-hidden />
            </button>
            {expanded && (
              <ul id={`nav-${g.id}`} className="ml-[1.45rem] mt-1 space-y-0.5 border-l border-border pl-2.5">
                {g.items.map((i) => {
                  const active = isActive(i, pathname, status, filter);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl py-1.5 pl-3 pr-2.5 text-[15px] font-medium transition-colors ${
                          active ? "bg-brand-500 font-semibold text-white" : "text-ink/70 hover:bg-surface hover:text-ink"
                        }`}
                      >
                        {(() => { const ItemIcon = iconFor(i.label); return <ItemIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />; })()}
                        {i.label}
                        {i.badge && <Badge n={badges[i.badge]} tone={i.badge} onActive={active} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/admin") return null;
  const path = pathname.replace(/\/$/, "");
  let group: string | null = null;
  let page: { label: string; href: string } | null = null;
  let detail: string | null = null;
  for (const g of NAV) {
    for (const i of g.items) {
      const base = i.href.split("?")[0];
      if (path === base && !page) {
        group = g.items.length > 1 ? g.label : null;
        page = { label: g.items.length > 1 && i.href.includes("?") ? i.label : i.label, href: base };
      } else if (i.deep && path.startsWith(`${base}/`) && !page && !path.endsWith("/new") && !path.endsWith("/ready-for-dispatch")) {
        group = g.items.length > 1 ? g.label : null;
        page = { label: i.label, href: base };
        detail = decodeURIComponent(path.slice(base.length + 1));
      }
    }
  }
  if (!page) return null;
  const crumbs: { label: string; href?: string }[] = [{ label: "Dashboard", href: "/admin" }];
  if (group) crumbs.push({ label: group });
  crumbs.push(detail ? { label: page.label, href: page.href } : { label: page.label });
  if (detail) crumbs.push({ label: page.href === "/admin/products" ? "Edit Product" : page.href === "/admin/customers" ? "Customer details" : detail });
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <li key={`${c.label}${i}`} className="flex items-center gap-1" aria-current={i === crumbs.length - 1 ? "page" : undefined}>
            {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
            {c.href ? <Link href={c.href} className="hover:text-ink hover:underline">{c.label}</Link> : <span className={i === crumbs.length - 1 ? "font-medium text-ink" : ""}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Notifications({ badges }: { badges: AdminBadges }) {
  const items = [
    { n: badges.failed, text: "orders need attention (ERP rejected or could not take them)", href: "/admin/erp/failed", tone: "text-danger" },
    { n: badges.pending, text: "orders waiting to reach the ERP", href: "/admin/orders?status=pending", tone: "text-warn" },
    { n: badges.new, text: "new orders not yet confirmed in the ERP", href: "/admin/orders?status=PLACED", tone: "text-ink" },
  ].filter((i) => i.n > 0);
  const total = items.reduce((a, i) => a + i.n, 0);
  return (
    <details className="relative">
      <summary className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-surface" aria-label={total ? `Notifications, ${total} need a look` : "Notifications, none"}>
        <Bell className="h-5 w-5" aria-hidden />
        {total > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{total > 99 ? "99+" : total}</span>}
      </summary>
      <div className="card absolute right-0 mt-2 w-80 max-w-[85vw] p-2 shadow-card max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.25rem] max-sm:mt-0 max-sm:w-auto max-sm:max-w-none">
        {items.length === 0 ? (
          <p className="p-3 text-sm text-muted">Nothing needs attention right now.</p>
        ) : (
          <ul>
            {items.map((i) => (
              <li key={i.href}><Link href={i.href} className="block rounded-lg p-3 text-sm hover:bg-surface"><span className={`font-bold ${i.tone}`}>{i.n}</span> {i.text}</Link></li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/admin" className="flex h-16 shrink-0 items-center gap-2.5 px-5 text-ink" aria-label="VOLTA.LK admin home">
      {collapsed ? (
        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-display text-lg font-extrabold text-white">V</span>
      ) : (
        <>
          <span className="font-display text-[1.45rem] font-extrabold leading-none tracking-[-0.02em]">
            V<span className="text-brand-500">O</span>LTA<span className="text-[0.82em]">.LK</span>
          </span>
          <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">Admin</span>
        </>
      )}
    </Link>
  );
}

/** Bottom of the sidebar: who is signed in, and the way to the shop. */
function SidebarUser({ user, collapsed }: { user: { name: string; email: string }; collapsed: boolean }) {
  const initial = user.name.trim().charAt(0).toUpperCase();
  if (collapsed) {
    return (
      <div className="flex shrink-0 justify-center border-t border-border py-3">
        <span title={`${user.name} (${user.email})`} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{initial}</span>
      </div>
    );
  }
  return (
    <div className="shrink-0 border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-xl bg-surface p-2.5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{initial}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-xs text-muted">{user.email}</span>
        </span>
        <Link href="/" target="_blank" rel="noopener" title="View store (opens in a new tab)" aria-label="View store (opens in a new tab)" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-ink">
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export function AdminShell({ children, user, badges }: { children: React.ReactNode; user: { name: string; email: string }; badges: AdminBadges }) {
  // The sidebar width is a per-browser preference: false on the server, the saved value once hydrated.
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  // The drawer is open only for the page it was opened on, so navigating closes it without an effect.
  const pathname = usePathname();
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const drawer = drawerAt === pathname;
  const setDrawer = useCallback((open: boolean) => setDrawerAt(open ? pathname : null), [pathname]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const account = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!drawer) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        menuBtn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer, setDrawer]);

  useEffect(() => {
    const close = (e: Event) => {
      const d = account.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  const toggleCollapsed = () => {
    try {
      localStorage.setItem(STORAGE, collapsed ? "0" : "1");
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  };

  return (
    <div className="min-h-screen bg-surface text-ink">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded focus:bg-bg focus:px-3 focus:py-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-bg text-ink transition-[width] duration-200 motion-reduce:transition-none lg:flex ${collapsed ? "w-[4.5rem]" : "w-64"}`}>
        <div className="border-b border-border"><Brand collapsed={collapsed} /></div>
        <Suspense fallback={<div className="flex-1" />}><Nav collapsed={collapsed} badges={badges} /></Suspense>
        <SidebarUser user={user} collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} tabIndex={-1} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-bg text-ink shadow-xl">
            <div className="flex items-center justify-between border-b border-border pr-3">
              <Brand collapsed={false} />
              <button ref={closeRef} type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-surface" aria-label="Close menu" onClick={() => setDrawer(false)}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <Suspense fallback={<div className="flex-1" />}><Nav collapsed={false} badges={badges} onNavigate={() => setDrawer(false)} /></Suspense>
            <SidebarUser user={user} collapsed={false} />
          </aside>
        </div>
      )}

      <div className={`min-w-0 transition-[padding] duration-200 motion-reduce:transition-none ${collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2 sm:gap-3 sm:px-6">
          <button ref={menuBtn} type="button" className="btn-ghost order-1 h-10 min-h-0 w-10 px-0 lg:hidden" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <button type="button" className="btn-ghost order-1 hidden h-10 min-h-0 w-10 px-0 lg:inline-flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed} onClick={toggleCollapsed}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden /> : <PanelLeftClose className="h-5 w-5" aria-hidden />}
          </button>
          <div className="order-2 ml-auto flex items-center gap-1 sm:order-3 sm:gap-2">
          <Link href="/" target="_blank" rel="noopener" className="btn-ghost hidden h-10 min-h-0 px-3 sm:inline-flex">
            <ExternalLink className="h-4 w-4" aria-hidden /> View store
          </Link>
          <Notifications badges={badges} />
          <details ref={account} className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-1 hover:bg-surface" aria-label={`Account menu for ${user.name}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-on-brand" aria-hidden>{user.name.charAt(0).toUpperCase()}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold">{user.name}</span>
                <span className="block text-xs text-muted">Administrator</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted sm:block" aria-hidden />
            </summary>
            <div className="card absolute right-0 mt-2 w-64 p-4 shadow-card max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.25rem] max-sm:mt-0 max-sm:w-auto">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <div className="mt-4"><SignOutButton /></div>
            </div>
          </details>
          </div>
          <form action="/admin/orders" method="get" role="search" className="relative order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:max-w-sm sm:flex-1">
            <label htmlFor="admin-search" className="sr-only">Search orders by number, customer name or phone</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id="admin-search" name="q" maxLength={60} placeholder="Search orders" className="input min-h-10 border-transparent bg-surface pl-9 focus:border-brand-500 focus:bg-bg" />
          </form>
        </header>
        <main id="admin-main" className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
          <Suspense fallback={null}><Breadcrumbs /></Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
