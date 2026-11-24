"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type { HotDealRow } from "@/lib/admin/hot-deal-api";
import { formatLkr } from "@/lib/utils/money";

type Hit = { id: string; name: string; sku: string | null; image: string | null };

const STATUS: Record<HotDealRow["status"], { label: string; tone: string }> = {
  live: { label: "Live", tone: "bg-success-bg text-success" },
  scheduled: { label: "Scheduled", tone: "bg-info-bg text-info" },
  ended: { label: "Ended", tone: "bg-surface text-muted" },
  inactive: { label: "Off", tone: "bg-surface text-muted" },
  missing: { label: "Not in ERP", tone: "bg-danger-bg text-danger" },
  unavailable: { label: "Out of stock", tone: "bg-warn-bg text-warn" },
  unknown: { label: "ERP unreachable", tone: "bg-warn-bg text-warn" },
};

/** ISO instant → value for <input type="datetime-local"> in the admin's own time zone, and back. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

async function send(url: string, init: RequestInit): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: (body as { error?: { message?: string } } | null)?.error?.message ?? "Could not save." };
    return { ok: true, body };
  } catch {
    return { ok: false, message: "Could not reach the server." };
  }
}

/**
 * Choose which ERP products appear in the homepage Hot Deals panel, their order and when they run. Prices are shown
 * for reference only: they always come from the ERP and cannot be changed here. The server re-validates everything.
 */
export function HotDealManager() {
  const [deals, setDeals] = useState<HotDealRow[] | null>(null);
  const [max, setMax] = useState(24);
  const [catalogueOk, setCatalogueOk] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await send("/api/admin/hot-deals", { method: "GET" });
    if (!r.ok) return setLoadError(r.message);
    const body = r.body as { deals: HotDealRow[]; catalogueOk: boolean; max: number };
    setDeals(body.deals);
    setCatalogueOk(body.catalogueOk);
    setMax(body.max);
    setLoadError(null);
  }, []);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch from the admin API
  }, [load]);

  async function act(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    const r = await send(url, init);
    if (!r.ok) setError(r.message);
    else await load();
    setBusy(false);
    return r.ok;
  }

  async function move(index: number, step: -1 | 1) {
    if (!deals) return;
    const next = [...deals];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    setDeals(next); // optimistic; reloaded from the server after saving
    await act("/api/admin/hot-deals/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((d) => d.id) }) });
  }

  async function remove(d: HotDealRow) {
    if (!window.confirm(`Remove "${d.product?.name ?? d.erpItemId}" from Hot Deals?`)) return;
    await act(`/api/admin/hot-deals/${d.id}`, { method: "DELETE" });
  }

  if (loadError) return <p role="alert" className="rounded-lg bg-danger-bg p-4 text-sm text-danger">{loadError}</p>;
  if (!deals) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading Hot Deals…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Live deals show on the homepage in this order. When none is live, the homepage shows the products the ERP has on sale.
        Prices, discounts and stock always come from the ERP; out-of-stock or removed products are hidden automatically.
      </p>
      {!catalogueOk && <p role="alert" className="rounded-lg bg-warn-bg p-3 text-sm text-warn">The ERP catalogue could not be reached, so product details and status are not shown. Adding products is paused.</p>}
      {error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p>}

      <AddDeal disabled={busy || !catalogueOk || deals.length >= max} taken={new Set(deals.map((d) => d.erpItemId))} onAdd={(body) => act("/api/admin/hot-deals", { method: "POST", body: JSON.stringify(body) })} />
      {deals.length >= max && <p className="text-xs text-muted">You have reached the limit of {max} Hot Deals. Remove one to add another.</p>}

      {deals.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No Hot Deals yet. The homepage currently shows the ERP sale products.</p>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border bg-bg" aria-label="Hot Deals in display order">
          {deals.map((d, i) => (
            <li key={d.id} className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 text-center text-sm font-semibold tabular-nums text-muted">{i + 1}</span>
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ERP thumbnail in the admin list */}
                  {d.product?.image ? <img src={d.product.image} alt="" className="h-full w-full object-contain p-1" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.product?.name ?? d.erpItemId}</p>
                  <p className="text-xs text-muted">
                    {d.product ? (
                      <>
                        {d.product.sku ? `${d.product.sku} · ` : ""}
                        {d.product.salePrice != null && d.product.salePrice < d.product.price ? (
                          <>{formatLkr(d.product.salePrice)} <s>{formatLkr(d.product.price)}</s> (ERP sale)</>
                        ) : (
                          <>{formatLkr(d.product.price)} (no ERP discount)</>
                        )}
                      </>
                    ) : (
                      "This product is no longer in the ERP catalogue."
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    From {when(d.startsAt)}
                    {d.endsAt ? ` until ${when(d.endsAt)}` : ", no end date"}
                  </p>
                </div>
                <span className={`badge ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-ghost min-h-9 px-2" aria-label={`Move ${d.product?.name ?? "deal"} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className="btn-ghost min-h-9 px-2" aria-label={`Move ${d.product?.name ?? "deal"} down`} disabled={busy || i === deals.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className="btn-ghost min-h-9 px-2" aria-label={`Edit ${d.product?.name ?? "deal"}`} aria-expanded={editing === d.id} disabled={busy} onClick={() => setEditing(editing === d.id ? null : d.id)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" className="btn-ghost min-h-9 px-2 text-danger" aria-label={`Remove ${d.product?.name ?? "deal"}`} disabled={busy} onClick={() => remove(d)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
              {editing === d.id && (
                <ScheduleForm
                  deal={d}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (body) => {
                    if (await act(`/api/admin/hot-deals/${d.id}`, { method: "PATCH", body: JSON.stringify(body) })) setEditing(null);
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AddDeal({ disabled, taken, onAdd }: { disabled: boolean; taken: Set<string>; onAdd: (body: { erpItemId: string; startsAt?: string; endsAt: string | null; active: boolean }) => Promise<boolean> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/admin/products/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { items: Hit[] }) => setHits(d.items))
        .catch((e) => e?.name !== "AbortError" && setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!picked) return;
        const ok = await onAdd({ erpItemId: picked.id, ...(startsAt ? { startsAt: fromLocalInput(startsAt)! } : {}), endsAt: fromLocalInput(endsAt), active: true });
        if (ok) {
          setPicked(null);
          setStartsAt("");
          setEndsAt("");
        }
      }}
    >
      <p className="text-sm font-semibold">Add a product</p>
      {picked ? (
        <p className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
          <span className="truncate">{picked.name}{picked.sku ? ` · ${picked.sku}` : ""}</span>
          <button type="button" className="text-xs font-semibold underline" onClick={() => setPicked(null)}>Change</button>
        </p>
      ) : (
        <div>
          <label htmlFor="hot-deal-search" className="label">Product</label>
          <input
            id="hot-deal-search"
            className="input"
            value={q}
            disabled={disabled}
            placeholder="Search name, SKU or ERP id"
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setHits([]);
            }}
          />
          {searching && <p role="status" className="mt-1 text-xs text-muted">Searching…</p>}
          {!searching && q.trim().length >= 2 && hits.length === 0 && <p className="mt-1 text-xs text-muted">No matching products.</p>}
          {hits.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-bg" aria-label="Matching products">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={taken.has(h.id)}
                    onClick={() => {
                      setPicked(h);
                      setQ("");
                      setHits([]);
                    }}
                  >
                    {h.name}{h.sku ? ` · ${h.sku}` : ""}{taken.has(h.id) ? " (already added)" : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="hot-deal-start" className="label">Starts (optional)</label>
          <input id="hot-deal-start" type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Empty means now.</p>
        </div>
        <div>
          <label htmlFor="hot-deal-end" className="label">Ends (optional)</label>
          <input id="hot-deal-end" type="datetime-local" className="input" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Empty means no end date.</p>
        </div>
      </div>
      <button type="submit" className="btn-primary" disabled={disabled || !picked}>
        <Plus className="h-4 w-4" aria-hidden /> Add to Hot Deals
      </button>
    </form>
  );
}

function ScheduleForm({ deal, busy, onCancel, onSave }: { deal: HotDealRow; busy: boolean; onCancel: () => void; onSave: (body: { startsAt: string; endsAt: string | null; active: boolean }) => void }) {
  const [startsAt, setStartsAt] = useState(toLocalInput(deal.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(deal.endsAt));
  const [active, setActive] = useState(deal.active);
  return (
    <form
      className="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ startsAt: fromLocalInput(startsAt) ?? new Date().toISOString(), endsAt: fromLocalInput(endsAt), active });
      }}
    >
      <div>
        <label htmlFor={`start-${deal.id}`} className="label">Starts</label>
        <input id={`start-${deal.id}`} type="datetime-local" className="input" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`end-${deal.id}`} className="label">Ends (optional)</label>
        <input id={`end-${deal.id}`} type="datetime-local" className="input" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="check" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className="btn-primary" disabled={busy}>Save</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
