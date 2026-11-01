"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Banknote, Loader2, Smartphone } from "lucide-react";
import { useLiveCart } from "@/components/cart/cart-view";
import { EmptyState } from "@/components/ui/states";
import { addMoney, formatLkr, fromCents, multiplyMoney, toCents } from "@/lib/utils/money";
import { generateOrderRef } from "@/lib/utils/order-ref";
import { lineKey } from "@/lib/utils/cart-math";
import { customerSchema, deliverySchema, DISTRICTS } from "@/lib/validation/checkout";
import { cartActions, useCart } from "@/store/cart";

const REF_KEY = "volta.checkout.ref";

function getRef(): string {
  try {
    const existing = window.sessionStorage.getItem(REF_KEY);
    if (existing) return existing;
    const ref = generateOrderRef();
    window.sessionStorage.setItem(REF_KEY, ref);
    return ref;
  } catch {
    return generateOrderRef();
  }
}
const resetRef = () => {
  try {
    window.sessionStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
};

type Errors = Record<string, string>;

function Field({ id, label, error, hint, required = false, className = "", children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Checkout on one page: the delivery details on the left (two fields to a row, so no input runs the full width of the
 * screen) and the order with payment, terms and Place order on the right. Everything is checked when Place order is
 * pressed; the first field with a problem gets focus.
 */
export function CheckoutForm({ deliveryCharge, prefill }: { deliveryCharge: number; prefill?: { name: string; email: string; phone: string | null } }) {
  const router = useRouter();
  const { lines, subtotal } = useCart();
  const { live } = useLiveCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const openedTotal = useRef<number | null>(null);
  const [priceAck, setPriceAck] = useState(false);
  const total = addMoney(subtotal, deliveryCharge);

  useEffect(() => {
    if (openedTotal.current == null && lines.length) openedTotal.current = total;
  }, [lines.length, total]);

  if (!lines.length) {
    return (
      <EmptyState title="Your cart is empty" action={{ href: "/products", label: "Browse products" }}>
        Add something to your cart before checking out.
      </EmptyState>
    );
  }

  const savings = lines.reduce((sum, l) => {
    const row = live?.find((d) => d.productId === l.productId && d.variantKey === l.variantKey);
    if (row?.listPrice == null || row.listPrice <= l.unitPrice) return sum;
    return sum + (toCents(row.listPrice) - toCents(l.unitPrice)) * l.quantity;
  }, 0);
  const unavailable = lines.filter((l) => live?.find((d) => d.productId === l.productId && d.variantKey === l.variantKey)?.available === false);
  const offers = [...new Set(lines.map((l) => live?.find((d) => d.productId === l.productId && d.variantKey === l.variantKey)?.offerName).filter((name): name is string => Boolean(name)))];
  const items = lines.reduce((n, l) => n + l.quantity, 0);
  const err = (k: string) => errors[k];
  const aria = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-err` : undefined });
  const values = () => Object.fromEntries([...new FormData(formRef.current!).entries()].map(([k, v]) => [k, String(v)])) as Record<string, string>;

  /** Checks every field; returns the problems found (also shown under the fields). */
  function validate(): Errors {
    const v = values();
    const found: Errors = {};
    const c = customerSchema.safeParse({ name: v.name ?? "", phone: v.phone ?? "", email: v.email ?? "" });
    if (!c.success) for (const i of c.error.issues) found[String(i.path[0])] ??= i.message;
    const d = deliverySchema.safeParse({ address: v.address ?? "", city: v.city ?? "", district: v.district ?? "", postalCode: v.postalCode ?? "", notes: v.notes ?? "" });
    if (!d.success) for (const i of d.error.issues) found[String(i.path[0])] ??= i.message;
    if (v.acceptTerms !== "on") found.acceptTerms = "Please accept the terms to continue";
    return found;
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[aria-invalid=true]");
      if (!el) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return; // duplicate-submit guard
    setBanner(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return focusFirstError();
    if (openedTotal.current != null && openedTotal.current !== total && !priceAck) {
      setPriceAck(true);
      setBanner({ kind: "warn", text: "Some prices changed. We have refreshed your cart, so please review the new total." });
      return;
    }
    const v = values();
    const customer = customerSchema.parse({ name: v.name, phone: v.phone, email: v.email });
    const delivery = deliverySchema.parse({ address: v.address, city: v.city, district: v.district, postalCode: v.postalCode, notes: v.notes });

    inFlight.current = true;
    setSubmitting(true);
    const externalRef = getRef();
    try {
      const res = await fetch("/api/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalRef,
          lines: lines.map((l) => ({ productId: l.productId, variantKey: l.variantKey, quantity: l.quantity })),
          customer,
          delivery,
          expectedTotal: total,
          acceptTerms: true,
        }),
      });
      const data = await res.json().catch(() => null);

      // 201 = confirmed by the ERP, 202 = saved on the website and being confirmed: both are a successful order.
      if (res.ok) {
        resetRef();
        cartActions.clear();
        router.push(`/order-confirmation/${externalRef}`);
        return;
      }

      const code: string | undefined = data?.error?.code;
      if (res.status === 422 && data?.error?.fields) {
        resetRef(); // nothing was sent to the ERP
        setErrors(data.error.fields);
        setBanner({ kind: "error", text: data.error.message });
        focusFirstError();
      } else if (code === "PRICE_CHANGED" || code === "INSUFFICIENT_STOCK") {
        resetRef(); // definitive rejection: a corrected order gets a new reference
        if (Array.isArray(data.error.refreshed)) cartActions.applyPrices(data.error.refreshed.filter((r: { available: boolean; unitPrice: number }) => r.available && r.unitPrice > 0));
        setBanner({ kind: "warn", text: data.error.message });
      } else if (code === "CANNOT_COMBINE" || code === "VALIDATION_FAILED") {
        resetRef(); // definitive rejection of the request contents
        setBanner({ kind: "error", text: data.error.message });
      } else if (res.status === 409 || res.status === 429) {
        setBanner({ kind: "error", text: data?.error?.message ?? "Please try again." });
      } else {
        // 5xx / unknown outcome: keep the same reference so retrying cannot create a second order.
        setBanner({ kind: "error", text: data?.error?.message ?? "We could not place your order. Please try again. Your order will not be duplicated." });
      }
    } catch {
      setBanner({ kind: "error", text: "Network problem while placing your order. Please press Place order again. Your order will not be duplicated." });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const panel = "rounded-panel border border-border bg-bg p-5 sm:p-7";
  const heading = "font-display text-lg font-extrabold uppercase tracking-[0.02em] text-ink";

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-8"
      aria-busy={submitting}
    >
      <section aria-labelledby="billing" className={panel}>
        <h2 id="billing" className={heading}>Billing &amp; delivery</h2>

        {banner && (
          <div role="alert" className={`mt-4 rounded-control p-4 text-sm ${banner.kind === "warn" ? "bg-warn-bg text-warn" : "bg-danger-bg text-danger"}`}>
            {banner.text}{" "}
            {banner.kind === "warn" && <Link href="/cart" className="font-semibold underline">Review cart</Link>}
          </div>
        )}

        <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field id="name" label="Full name" required error={err("name")}>
            <input id="name" name="name" autoComplete="name" defaultValue={prefill?.name} className="input" {...aria("name")} maxLength={100} />
          </Field>
          <Field id="phone" label="Phone number" required error={err("phone")} hint="e.g. 0771234567">
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={prefill?.phone?.replace(/^\+94/, "0") ?? undefined} className="input" {...aria("phone")} />
          </Field>
          <Field id="email" label="Email (optional)" error={err("email")}>
            <input id="email" name="email" type="email" autoComplete="email" defaultValue={prefill?.email} className="input" {...aria("email")} maxLength={200} />
          </Field>
          <Field id="district" label="District" required error={err("district")}>
            <select id="district" name="district" defaultValue="" className="select" {...aria("district")}>
              <option value="" disabled>Select district</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field id="address" label="Address" required error={err("address")} hint="House number and street" className="sm:col-span-2">
            <input id="address" name="address" autoComplete="street-address" className="input" {...aria("address")} maxLength={250} />
          </Field>
          <Field id="city" label="City" required error={err("city")}>
            <input id="city" name="city" autoComplete="address-level2" className="input" {...aria("city")} maxLength={100} />
          </Field>
          <Field id="postalCode" label="Postal code (optional)" error={err("postalCode")}>
            <input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" className="input" {...aria("postalCode")} maxLength={5} />
          </Field>
          <Field id="notes" label="Delivery notes (optional)" error={err("notes")} className="sm:col-span-2">
            <textarea id="notes" name="notes" rows={2} maxLength={300} className="textarea" placeholder="Landmark, best time to call…" />
          </Field>
        </div>
      </section>

      <aside aria-label="Your order" className={`${panel} lg:sticky lg:top-[calc(var(--hdr-sticky,7rem)+1.5rem)]`}>
        <h2 className={`${heading} flex items-baseline justify-between`}>
          Your order <span className="text-sm font-normal normal-case tracking-normal text-muted">{items} {items === 1 ? "item" : "items"}</span>
        </h2>

        {unavailable.length > 0 && (
          <p role="alert" className="mt-4 rounded-control bg-danger-bg p-3 text-sm text-danger">
            {unavailable.map((l) => l.name).join(", ")} {unavailable.length === 1 ? "is" : "are"} not available in the requested quantity. Update the cart before placing the order.
          </p>
        )}

        <ul className="mt-4 divide-y divide-border border-y border-border text-sm">
          {lines.map((l) => (
            <li key={lineKey(l)} className="flex items-center gap-3 py-3">
              <span className="thumb-stage relative h-14 w-14 shrink-0 overflow-hidden rounded-control border border-border">
                {l.image ? <Image src={l.image} alt="" fill sizes="56px" className="object-contain p-1" /> : <Smartphone className="m-auto h-full w-6 text-muted" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium leading-5 text-ink">{l.name}</span>
                <span className="block text-xs text-muted">{l.variantLabel ? `${l.variantLabel} · ` : ""}Qty {l.quantity}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatLkr(subtotal)}</dd></div>
          {savings > 0 && <div className="flex justify-between text-success"><dt>Savings included</dt><dd className="tabular-nums">{formatLkr(fromCents(savings))}</dd></div>}
          {offers.map((name) => <div key={name} className="text-xs text-muted">{name}</div>)}
          <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="tabular-nums" data-testid="delivery">{formatLkr(deliveryCharge)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <dt className="font-semibold">Total</dt>
            <dd className="text-2xl font-bold tabular-nums text-ink" data-testid="total">{formatLkr(total)}</dd>
          </div>
        </dl>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-ink">Payment</legend>
          <label className="mt-2 flex items-start gap-3 rounded-control border border-brand-500 bg-brand-50/40 p-3 text-sm">
            <input type="radio" name="payment" value="COD" defaultChecked readOnly className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold text-ink"><Banknote className="h-4 w-4" aria-hidden /> Cash on delivery</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">Pay in cash when your order arrives.</span>
            </span>
          </label>
        </fieldset>

        <div className="mt-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-0.5 h-4 w-4 accent-brand-600" aria-invalid={err("acceptTerms") ? true : undefined} aria-describedby={err("acceptTerms") ? "acceptTerms-err" : undefined} />
            <span>I agree to the <Link href="/terms" className="font-semibold text-ink underline" target="_blank">terms and conditions</Link> and <Link href="/privacy-policy" className="font-semibold text-ink underline" target="_blank">privacy policy</Link>.</span>
          </label>
          {err("acceptTerms") && <p id="acceptTerms-err" className="field-error" role="alert">{err("acceptTerms")}</p>}
        </div>

        <button type="submit" className="btn-primary mt-5 min-h-12 w-full text-[15px]" disabled={submitting}>
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Placing order…</> : "Place order"}
        </button>
        <p className="mt-3 text-center text-xs text-muted">Prices and stock are confirmed again when you place your order.</p>
        <Link href="/cart" className="mt-2 block text-center text-sm font-semibold text-muted hover:text-ink">Back to cart</Link>
      </aside>
    </form>
  );
}
