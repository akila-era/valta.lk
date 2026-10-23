"use client";

import { useEffect, useState } from "react";
import { ACCESSORY_KINDS, ACCESSORY_LABELS, type AccessoryKind } from "@/lib/accessories/resolve";
import { formatLkr } from "@/lib/utils/money";

interface LinkRow {
  accessoryItemId: string;
  sourceVariantKey: string;
  kind: AccessoryKind;
  name: string;
  inCatalogue: boolean;
  available: boolean;
  unitPrice: number | null;
  events: { impression: number; click: number; add: number };
}

/** Staff editor for explicit accessory links on one ERP product. */
export function AccessoryManager({ productId, variants = [] }: { productId: string; variants?: { key: string; label: string }[] }) {
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [accessoryItemId, setAccessoryItemId] = useState("");
  const [sourceVariantKey, setSourceVariantKey] = useState("");
  const [kind, setKind] = useState<AccessoryKind>("BACK_COVER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(`/api/admin/products/${productId}/accessories`);
    if (!r.ok) {
      setError("Accessory links could not be loaded.");
      setLinks([]);
      return;
    }
    const data = (await r.json()) as { links: LinkRow[] };
    setLinks(data.links);
    setError(null);
  }

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/admin/products/${productId}/accessories`, { signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ links: LinkRow[] }>;
      })
      .then((d) => setLinks(d.links))
      .catch((e) => e?.name !== "AbortError" && setError("Accessory links could not be loaded."));
    return () => ctl.abort();
  }, [productId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/admin/products/${productId}/accessories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessoryItemId: accessoryItemId.trim(), kind, sourceVariantKey }),
    });
    setBusy(false);
    if (!r.ok) {
      const body = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "The link could not be saved.");
      return;
    }
    setAccessoryItemId("");
    setSourceVariantKey("");
    await load();
  }

  async function remove(id: string, variantKey: string) {
    setBusy(true);
    await fetch(`/api/admin/products/${productId}/accessories`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessoryItemId: id, sourceVariantKey: variantKey }),
    });
    setBusy(false);
    await load();
  }

  return (
    <section aria-labelledby="compat" className="card mt-6 p-5">
      <h2 id="compat" className="text-base font-semibold">Compatible accessories</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Link an accessory by its ERP product id. Leave the configuration blank when it fits every variant. The store never matches accessories by name.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-sm">
          <span className="label">Accessory product id</span>
          <input className="input" value={accessoryItemId} onChange={(e) => setAccessoryItemId(e.target.value)} required maxLength={64} />
        </label>
        {variants.length > 1 && (
          <label className="min-w-48 text-sm">
            <span className="label">Configuration</span>
            <select className="input" value={sourceVariantKey} onChange={(e) => setSourceVariantKey(e.target.value)}>
              <option value="">Every configuration</option>
              {variants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="label">Type</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AccessoryKind)}>
            {ACCESSORY_KINDS.map((k) => <option key={k} value={k}>{ACCESSORY_LABELS[k]}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>Save link</button>
      </form>
      <ul className="mt-4 divide-y divide-border text-sm">
        {(links ?? []).map((l) => (
          <li key={`${l.accessoryItemId}:${l.sourceVariantKey}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{l.name}</p>
              <p className="text-muted">{ACCESSORY_LABELS[l.kind]} · {l.accessoryItemId}{l.sourceVariantKey ? ` · ${variants.find((v) => v.key === l.sourceVariantKey)?.label ?? l.sourceVariantKey}` : " · every configuration"}{l.unitPrice != null ? ` · ${formatLkr(l.unitPrice)}` : ""} · {l.inCatalogue ? (l.available ? "In stock" : "Out of stock") : "Not in catalogue"}</p>
              <p className="text-xs text-muted">Shown {l.events.impression} · opened {l.events.click} · added {l.events.add}</p>
            </div>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => remove(l.accessoryItemId, l.sourceVariantKey)}>Remove</button>
          </li>
        ))}
        {links && !links.length && <li className="py-3 text-muted">No accessories linked yet.</li>}
      </ul>
    </section>
  );
}
