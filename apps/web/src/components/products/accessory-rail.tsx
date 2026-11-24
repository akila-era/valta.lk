"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Smartphone, X } from "lucide-react";
import { planAccessoryAdds } from "@/lib/accessories/add";
import { offerMatchesSelection, preferSpecificOffers, type AccessoryOffer } from "@/lib/accessories/resolve";
import { useVariantChoice } from "./variant-choice";
import { lineKey } from "@/lib/utils/cart-math";
import { addMoney, formatLkr } from "@/lib/utils/money";
import { cartActions, useCart } from "@/store/cart";

const DISMISS = "volta.accessories.dismissed";

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(DISMISS) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let dismissedCache: string[] | null = null;
const dismissListeners = new Set<() => void>();
const dismissedSnapshot = () => dismissedCache ?? (dismissedCache = readDismissed());
// The server snapshot must be the same array every call, or React warns and re-renders in a loop.
const NONE_DISMISSED: string[] = [];
const noneDismissed = () => NONE_DISMISSED;
const subscribeDismissed = (cb: () => void) => {
  dismissListeners.add(cb);
  return () => dismissListeners.delete(cb);
};
function dismissSources(ids: string[]) {
  dismissedCache = [...new Set([...dismissedSnapshot(), ...ids])];
  try {
    sessionStorage.setItem(DISMISS, JSON.stringify(dismissedCache));
  } catch {
    /* hidden for this view even if storage is blocked */
  }
  dismissListeners.forEach((l) => l());
}

async function track(events: { type: "impression" | "click" | "add"; sourceItemId: string; accessoryItemId: string }[]) {
  if (!events.length) return;
  await fetch("/api/store/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  }).catch(() => undefined);
}

/**
 * Compatible accessories for one or more products already chosen. Dismissal is kept for this browser tab only
 * and never blocks checkout. Adding an accessory uses the same cart and does not duplicate a line.
 */
export function AccessoryRail({
  productIds,
  initial,
  selections,
  intro = "Only accessories linked to items in your cart. Prices are the catalogue prices. You can continue without them.",
}: {
  productIds: string[];
  initial?: AccessoryOffer[];
  selections?: { productId: string; variantKey: string }[];
  intro?: string;
}) {
  const { lines } = useCart();
  const choice = useVariantChoice();
  const picked = selections ?? productIds.map((productId) => ({ productId, variantKey: choice?.variantKey ?? "" }));
  const [items, setItems] = useState<AccessoryOffer[] | null>(initial ?? null);
  const dismissed = useSyncExternalStore(subscribeDismissed, dismissedSnapshot, noneDismissed);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const signature = [...new Set(productIds)].sort().join(",");

  useEffect(() => {
    if (initial) return;
    if (!signature) return;
    const ctl = new AbortController();
    fetch(`/api/store/accessories?productIds=${encodeURIComponent(signature)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items: AccessoryOffer[] }) => setItems(d.items))
      .catch((e) => e?.name !== "AbortError" && setItems([]));
    return () => ctl.abort();
  }, [signature, initial]);

  const hidden = new Set(dismissed);
  const visible = preferSpecificOffers((items ?? []).filter((item) => !hidden.has(item.sourceItemId) && offerMatchesSelection(item, picked)));

  const visibleKey = visible.map((item) => `${item.sourceItemId}:${item.productId}`).join("|");
  useEffect(() => {
    if (!visibleKey) return;
    void track(visible.map((item) => ({ type: "impression" as const, sourceItemId: item.sourceItemId, accessoryItemId: item.productId })));
    // The key already lists every offer in this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  if (!visible.length) return null;

  function dismiss() {
    dismissSources(visible.map((item) => item.sourceItemId));
  }

  function toggle(item: AccessoryOffer) {
    const key = lineKey(item);
    setPickedIds((current) => (current.includes(key) ? current.filter((id) => id !== key) : [...current, key]));
  }

  function addSelected() {
    addItems(visible.filter((item) => pickedIds.includes(lineKey(item))));
  }

  // "Add all": every accessory that can go straight in the cart (no options to choose), in one tap.
  const addable = visible.filter((item) => item.canAdd);
  const addableTotal = addMoney(...addable.map((item) => item.unitPrice));

  function addItems(chosen: AccessoryOffer[]) {
    const plan = planAccessoryAdds(chosen, lines);
    for (const item of plan.add) {
      cartActions.add({
        productId: item.productId,
        variantKey: item.variantKey,
        slug: item.slug,
        name: item.name,
        sku: item.sku,
        variantLabel: item.variantLabel,
        image: item.image,
        unitPrice: item.unitPrice,
        quantity: 1,
      });
    }
    if (plan.add.length) {
      void track(plan.add.map((item) => ({ type: "add" as const, sourceItemId: item.sourceItemId, accessoryItemId: item.productId })));
    }
    const added = plan.add.map((item) => item.title);
    const skipped = plan.already.map((item) => item.title);
    if (added.length && skipped.length) setNote(`Added ${added.join(", ")}. Already in your cart: ${skipped.join(", ")}.`);
    else if (added.length) setNote(added.length === 1 ? `${added[0]} added to your cart.` : `Added ${added.join(", ")}.`);
    else if (skipped.length) setNote(skipped.length === 1 ? `${skipped[0]} is already in your cart.` : `Already in your cart: ${skipped.join(", ")}.`);
    setPickedIds([]);
  }

  return (
    <section aria-labelledby="accessories" className="mt-8 rounded-3xl border border-border/80 bg-white p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="accessories" className="font-display text-base font-bold text-ink">
            Compatible accessories
          </h2>
          <p className="mt-1 text-xs text-muted">{intro}</p>
        </div>
        <button type="button" className="btn-ghost rounded-full px-3 text-xs" onClick={dismiss}>
          <X className="h-3.5 w-3.5" aria-hidden /> Dismiss
        </button>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {visible.map((item) => (
          <li
            key={`${item.sourceItemId}-${item.sourceVariantKey}-${item.productId}`}
            className="flex gap-3 rounded-2xl border border-border/80 bg-bg p-3.5 shadow-soft"
          >
            <Link
              href={`/products/${item.slug}`}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-white"
              aria-label={item.title}
              onClick={() => void track([{ type: "click", sourceItemId: item.sourceItemId, accessoryItemId: item.productId }])}
            >
              {item.image ? (
                <Image src={item.image} alt="" fill sizes="64px" className="object-contain p-1.5" />
              ) : (
                <Smartphone className="m-auto h-full w-6 text-muted" aria-hidden />
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{item.kindLabel}</p>
              <p className="truncate text-sm font-bold text-ink">{item.title}</p>
              <p className="text-xs font-semibold text-brand-600">
                {item.priceFrom ? `From ${formatLkr(item.unitPrice)}` : formatLkr(item.unitPrice)}
              </p>
              {item.canAdd ? (
                <label className="mt-2 flex min-h-8 cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
                  <input
                    type="checkbox"
                    className="accent-brand-500 rounded"
                    checked={pickedIds.includes(lineKey(item))}
                    aria-label={`Select ${item.title}`}
                    onChange={() => toggle(item)}
                  />
                  Select
                </label>
              ) : (
                <Link
                  href={`/products/${item.slug}`}
                  className="btn-secondary mt-2 inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold shadow-soft"
                  onClick={() => void track([{ type: "click", sourceItemId: item.sourceItemId, accessoryItemId: item.productId }])}
                >
                  Choose options
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {addable.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {addable.length > 1 ? (
            <button type="button" className="btn-primary rounded-full px-5 py-2 text-xs font-semibold shadow-soft hover:shadow-lift" onClick={() => addItems(addable)}>
              Add all {addable.length} · {formatLkr(addableTotal)}
            </button>
          ) : null}
          <button
            type="button"
            className={`${addable.length > 1 ? "btn-secondary" : "btn-primary"} rounded-full px-5 py-2 text-xs font-semibold shadow-soft hover:shadow-lift`}
            disabled={!pickedIds.length}
            onClick={addSelected}
          >
            Add selected
          </button>
        </div>
      ) : null}
      {note && <p role="status" className="mt-3 text-sm">{note}</p>}
    </section>
  );
}
