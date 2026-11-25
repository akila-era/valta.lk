"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Flame, Plus, RotateCcw, Save, Search, Timer, Trash2 } from "lucide-react";
import { formatLkr } from "@/lib/utils/money";

export interface HotProduct {
  id: string;
  name: string;
  sku: string;
  brand: string;
  price: number;
  salePrice: number | null;
  image: string | null;
  available: boolean;
}
export interface HotConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  mode: "chosen" | "auto";
  productIds: string[];
  endsAt: string | null;
  label: string;
}

/** ISO time -> the value a datetime-local box wants, in the admin's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Everything about the homepage Hot Deals section: on/off, texts, which products, and the countdown. */
export function HotDealsManager({ initial, selected, saved, max }: { initial: HotConfig; selected: HotProduct[]; saved: boolean; max: number }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<HotConfig>(initial);
  const [when, setWhen] = useState(toLocalInput(initial.endsAt));
  const [chosen, setChosen] = useState<HotProduct[]>(selected);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<HotProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const patch = (p: Partial<HotConfig>) => setCfg((c) => ({ ...c, ...p }));

  // Look products up in the ERP catalogue as the admin types.
  useEffect(() => {
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/hot-deals?q=${encodeURIComponent(q)}`);
        const data = (await res.json().catch(() => null)) as { items?: HotProduct[] } | null;
        setResults(res.ok ? (data?.items ?? []) : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const add = (p: HotProduct) => chosen.length < max && !chosen.some((c) => c.id === p.id) && setChosen([...chosen, p]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    setChosen(next);
  };

  async function call(method: string, body?: unknown, done?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/hot-deals", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMsg({ ok: false, text: data?.error?.message ?? "Could not save." });
        return false;
      }
      setMsg({ ok: true, text: done ?? "Saved." });
      router.refresh();
      return true;
    } catch {
      setMsg({ ok: false, text: "Could not reach the server." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function save() {
    let endsAt: string | null = null;
    if (when) {
      const t = new Date(when);
      if (Number.isNaN(t.getTime())) return setMsg({ ok: false, text: "The end time is not a valid date." });
      endsAt = t.toISOString();
    }
    void call("PUT", { ...cfg, endsAt, productIds: chosen.map((c) => c.id) }, "Saved. The homepage is updated.");
  }

  async function reset() {
    if (!window.confirm("Reset Hot Deals to the defaults? The section turns on, shows reduced-price products automatically and has no countdown.")) return;
    if (await call("DELETE", undefined, "Back to the defaults.")) {
      setCfg({ enabled: true, title: "Hot Deals", subtitle: "", mode: "auto", productIds: [], endsAt: null, label: "Offer ends in" });
      setWhen("");
      setChosen([]);
    }
  }

  const card = "space-y-4 rounded-lg border border-border p-4 sm:p-5";
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Control the Hot Deals section of the homepage: show or hide it, change its text, pick the products and set a countdown. Prices always come from the ERP, so a product only shows a discount when the ERP has a sale price for it.
      </p>

      <section className={card} aria-labelledby="hd-section">
        <h2 id="hd-section" className="flex items-center gap-2 text-base font-semibold"><Flame className="h-4 w-4 text-brand-600" aria-hidden /> Section</h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" className="check" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          <span className="font-medium">Show Hot Deals on the homepage</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hd-title" className="label">Title</label>
            <input id="hd-title" className="input" value={cfg.title} onChange={(e) => patch({ title: e.target.value })} maxLength={40} />
          </div>
          <div>
            <label htmlFor="hd-sub" className="label">Line under the title (optional)</label>
            <input id="hd-sub" className="input" value={cfg.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} maxLength={120} placeholder="Leave empty for the automatic text" />
          </div>
        </div>
      </section>

      <section className={card} aria-labelledby="hd-products">
        <h2 id="hd-products" className="text-base font-semibold">Products</h2>
        <fieldset className="space-y-2">
          <legend className="sr-only">Which products to show</legend>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="radio" name="hd-mode" className="check mt-1" checked={cfg.mode === "auto"} onChange={() => patch({ mode: "auto" })} />
            <span><b>Automatic</b><span className="block text-sm text-muted">Every in-stock product that has a reduced price in the ERP.</span></span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="radio" name="hd-mode" className="check mt-1" checked={cfg.mode === "chosen"} onChange={() => patch({ mode: "chosen" })} />
            <span><b>Products I choose</b><span className="block text-sm text-muted">Only the products listed below, in this order (up to {max}).</span></span>
          </label>
        </fieldset>

        {cfg.mode === "chosen" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Chosen ({chosen.length}/{max})</h3>
              {chosen.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">No products yet. Search below and press Add.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {chosen.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 p-2.5">
                      <Thumb src={p.image} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted">
                          {formatLkr(p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price)}
                          {p.salePrice != null && p.salePrice < p.price ? <span className="ml-1 line-through">{formatLkr(p.price)}</span> : <span className="ml-2 text-warn">no sale price in the ERP</span>}
                          {!p.available && <span className="ml-2 text-danger">out of stock (hidden)</span>}
                        </p>
                      </div>
                      <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                      <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label={`Move ${p.name} down`} disabled={i === chosen.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                      <button type="button" className="btn-ghost min-h-11 min-w-11 px-2 text-danger" aria-label={`Remove ${p.name}`} onClick={() => setChosen(chosen.filter((c) => c.id !== p.id))}><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="hd-search" className="label">Add products from the catalogue</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input id="hd-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, brand or SKU" />
              </div>
              <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border" aria-busy={searching}>
                {results.length === 0 && <li className="p-3 text-sm text-muted">{searching ? "Searching…" : "No products found."}</li>}
                {results.map((p) => {
                  const taken = chosen.some((c) => c.id === p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 p-2.5">
                      <Thumb src={p.image} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted">{[p.brand, p.sku, formatLkr(p.price)].filter(Boolean).join(" · ")}{p.salePrice != null && p.salePrice < p.price ? <span className="ml-2 font-medium text-sale">on sale</span> : null}</p>
                      </div>
                      <button type="button" className="btn-secondary min-h-10 px-3" disabled={taken || chosen.length >= max} onClick={() => add(p)}>
                        <Plus className="h-4 w-4" aria-hidden /> {taken ? "Added" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className={card} aria-labelledby="hd-time">
        <h2 id="hd-time" className="flex items-center gap-2 text-base font-semibold"><Timer className="h-4 w-4 text-brand-600" aria-hidden /> Countdown</h2>
        <p className="text-sm text-muted">The ERP does not say when a sale ends, so the timer shows the time <b>you</b> enter. Set it to match when you will end the sale in the ERP. It disappears by itself when the time is up. Leave it empty for no timer.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hd-when" className="label">Offer ends on</label>
            <div className="flex gap-2">
              <input id="hd-when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
              {when && <button type="button" className="btn-secondary px-3" onClick={() => setWhen("")}>Clear</button>}
            </div>
          </div>
          <div>
            <label htmlFor="hd-label" className="label">Label next to the timer</label>
            <input id="hd-label" className="input" value={cfg.label} onChange={(e) => patch({ label: e.target.value })} maxLength={60} />
          </div>
        </div>
      </section>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" aria-hidden /> Save Hot Deals</button>
        {saved && <button type="button" className="btn-secondary" disabled={busy} onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden /> Reset to defaults</button>}
        <a href="/#hot-deals" target="_blank" className="text-sm font-semibold hover:underline">View on the homepage</a>
      </div>
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail from the ERP
    <img src={src} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-md border border-border bg-white object-contain" />
  ) : (
    <span aria-hidden className="h-11 w-11 shrink-0 rounded-md border border-border bg-surface" />
  );
}
