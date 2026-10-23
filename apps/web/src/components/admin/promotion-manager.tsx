"use client";

import { useEffect, useState } from "react";
import { formatLkr } from "@/lib/utils/money";

interface PromotionRow {
  id: string;
  name: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  stackable: boolean;
  active: boolean;
  productIds: string[];
  categoryNames: string[];
  bundleAccessoryId: string | null;
  used: number;
  discountGiven: number;
}

const empty = {
  name: "",
  type: "PERCENT" as "PERCENT" | "FIXED",
  value: 10,
  minSubtotal: 0,
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perCustomerLimit: "",
  stackable: false,
  active: false,
  productIds: "",
  categoryNames: "",
  bundleAccessoryId: "",
};

type FormState = typeof empty & { id?: string };

const split = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);
const localInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

function ProductPicker({ label, hint, selected, onChange, single = false }: { label: string; hint: string; selected: string[]; onChange: (ids: string[]) => void; single?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; sku: string | null }[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/products/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { items: { id: string; name: string; sku: string | null }[] }) => setHits(d.items))
        .catch((e) => e?.name !== "AbortError" && setHits([]));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);

  function choose(id: string) {
    onChange(single ? [id] : selected.includes(id) ? selected : [...selected, id]);
    setQ("");
    setHits([]);
  }

  return (
    <div className="text-sm">
      <span className="label">{label}</span>
      <p className="mb-1 text-xs text-muted">{hint}</p>
      <input className="input" value={q} placeholder="Search name or SKU" onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setHits([]); }} />
      {hits.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-white">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" className="block w-full px-3 py-2 text-left hover:bg-surface" onClick={() => choose(hit.id)}>
                {hit.name}{hit.sku ? ` · ${hit.sku}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-2 flex flex-wrap gap-2">
        {selected.map((id) => (
          <li key={id}>
            <button type="button" className="rounded-full bg-surface px-3 py-1 text-xs font-semibold" onClick={() => onChange(selected.filter((x) => x !== id))}>
              {id} ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Create and edit promotion rules. The charged price stays the HEXALYTE price. */
export function PromotionManager() {
  const [rows, setRows] = useState<PromotionRow[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/promotions");
    if (!r.ok) {
      setError("Promotions could not be loaded.");
      return;
    }
    const data = (await r.json()) as { promotions: PromotionRow[]; categories: string[] };
    setRows(data.promotions);
    setCategories(data.categories);
  }

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/admin/promotions", { signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ promotions: PromotionRow[]; categories: string[] }>;
      })
      .then((data) => {
        setRows(data.promotions);
        setCategories(data.categories);
      })
      .catch((e) => e?.name !== "AbortError" && setError("Promotions could not be loaded."));
    return () => ctl.abort();
  }, []);

  function edit(row: PromotionRow) {
    setForm({
      id: row.id,
      name: row.name,
      type: row.type,
      value: row.value,
      minSubtotal: row.minSubtotal,
      maxDiscount: row.maxDiscount == null ? "" : String(row.maxDiscount),
      startsAt: localInput(row.startsAt),
      endsAt: localInput(row.endsAt),
      usageLimit: row.usageLimit == null ? "" : String(row.usageLimit),
      perCustomerLimit: row.perCustomerLimit == null ? "" : String(row.perCustomerLimit),
      stackable: row.stackable,
      active: row.active,
      productIds: row.productIds.join(", "),
      categoryNames: row.categoryNames.join(", "),
      bundleAccessoryId: row.bundleAccessoryId ?? "",
    });
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      type: form.type,
      value: Number(form.value),
      minSubtotal: Number(form.minSubtotal) || 0,
      maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
      perCustomerLimit: form.perCustomerLimit === "" ? null : Number(form.perCustomerLimit),
      stackable: form.stackable,
      active: form.active,
      productIds: split(form.productIds),
      categoryNames: split(form.categoryNames),
      bundleAccessoryId: form.bundleAccessoryId.trim() || null,
    };
    const r = await fetch(form.id ? `/api/admin/promotions/${form.id}` : "/api/admin/promotions", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!r.ok) {
      const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "The promotion could not be saved.");
      return;
    }
    setForm(empty);
    await load();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <section className="card p-5" aria-labelledby="promo-list">
        <h2 id="promo-list" className="text-base font-semibold">Rules</h2>
        <p className="mt-1 text-sm text-muted">
          A promotion is shown to customers only when the discount equals the sale price HEXALYTE already charges. Any other rule is saved here and kept off the storefront, because HEXALYTE rejects orders with a different price.
        </p>
        <ul className="mt-4 divide-y divide-border text-sm">
          {(rows ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{row.name} {!row.active && <span className="text-muted">(inactive)</span>}</p>
                <p className="text-muted">
                  {row.type === "PERCENT" ? `${row.value}%` : formatLkr(row.value)} · used {row.used}{row.usageLimit ? ` / ${row.usageLimit}` : ""} · savings explained {formatLkr(row.discountGiven)}
                </p>
              </div>
              <button type="button" className="btn-secondary min-h-9 px-3" onClick={() => edit(row)}>Edit</button>
            </li>
          ))}
          {rows && !rows.length && <li className="py-3 text-muted">No promotions yet.</li>}
        </ul>
      </section>
      <form onSubmit={save} className="card h-fit space-y-3 p-5" aria-labelledby="promo-form">
        <h2 id="promo-form" className="text-base font-semibold">{form.id ? "Edit promotion" : "New promotion"}</h2>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <label className="block text-sm"><span className="label">Name</span><input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block text-sm"><span className="label">Type</span>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "PERCENT" | "FIXED" })}>
            <option value="PERCENT">Percentage</option>
            <option value="FIXED">Fixed amount (LKR)</option>
          </select>
        </label>
        <label className="block text-sm"><span className="label">{form.type === "PERCENT" ? "Percent" : "Amount"}</span><input className="input" required type="number" min={form.type === "PERCENT" ? 1 : 0.01} max={form.type === "PERCENT" ? 100 : undefined} step={form.type === "PERCENT" ? 1 : 0.01} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} /></label>
        <label className="block text-sm"><span className="label">Minimum order (LKR)</span><input className="input" type="number" min={0} step="0.01" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: Number(e.target.value) })} /></label>
        <label className="block text-sm"><span className="label">Maximum discount (LKR, optional)</span><input className="input" type="number" min={0} step="0.01" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} /></label>
        <label className="block text-sm"><span className="label">Starts</span><input className="input" required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label>
        <label className="block text-sm"><span className="label">Ends (optional)</span><input className="input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label>
        <label className="block text-sm"><span className="label">Usage limit (optional)</span><input className="input" type="number" min={1} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /></label>
        <label className="block text-sm"><span className="label">Per customer (optional, signed-in only)</span><input className="input" type="number" min={1} value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })} /></label>
        <ProductPicker
          label="Eligible products"
          hint="Leave empty to use categories only. A bundle still needs the accessory in the cart."
          selected={split(form.productIds)}
          onChange={(ids) => setForm({ ...form, productIds: ids.join(", ") })}
        />
        <label className="block text-sm"><span className="label">Categories (optional)</span>
          <input className="input" list="promo-categories" value={form.categoryNames} onChange={(e) => setForm({ ...form, categoryNames: e.target.value })} />
          <datalist id="promo-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <ProductPicker
          label="Required accessory"
          hint="Optional. The offer is considered only when this linked product is in the cart. The charged total still has to match HEXALYTE."
          selected={form.bundleAccessoryId ? [form.bundleAccessoryId] : []}
          single
          onChange={(ids) => setForm({ ...form, bundleAccessoryId: ids[0] ?? "" })}
        />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} /> Can stack with other stackable offers</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>{form.id ? "Save changes" : "Create promotion"}</button>
          {form.id && <button type="button" className="btn-ghost" onClick={() => setForm(empty)}>Cancel</button>}
        </div>
      </form>
    </div>
  );
}
