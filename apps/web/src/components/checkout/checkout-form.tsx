"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Smartphone } from "lucide-react";
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
type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Your details" },
  { n: 2, label: "Delivery" },
  { n: 3, label: "Review & place" },
];
const STEP_FIELDS: Record<Step, string[]> = {
  1: ["name", "phone", "email"],
  2: ["address", "city", "district", "postalCode", "notes"],
  3: ["acceptTerms"],
};
const stepOfField = (f: string): Step => (STEP_FIELDS[1].includes(f) ? 1 : STEP_FIELDS[2].includes(f) ? 2 : 3);

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function CheckoutForm({ deliveryCharge, prefill }: { deliveryCharge: number; prefill?: { name: string; email: string; phone: string | null } }) {
  const router = useRouter();
  const { lines, subtotal } = useCart();
  const { live } = useLiveCart();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [reached, setReached] = useState<Step>(1);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: "error" | "warn"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [recap, setRecap] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const moved = useRef(false);
  const openedTotal = useRef<number | null>(null);
  const [priceAck, setPriceAck] = useState(false);
  const total = addMoney(subtotal, deliveryCharge);

  // Move keyboard/screen-reader focus to the new step's heading whenever the step changes.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);
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
  const err = (k: string) => errors[k];
  const aria = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-err` : undefined });
  const values = () => Object.fromEntries([...new FormData(formRef.current!).entries()].map(([k, v]) => [k, String(v)])) as Record<string, string>;

  /** Validates the fields of one step; returns the errors found (also shown inline). */
  function validate(which: Step): Errors {
    const v = values();
    const found: Errors = {};
    if (which === 1) {
      const c = customerSchema.safeParse({ name: v.name ?? "", phone: v.phone ?? "", email: v.email ?? "" });
      if (!c.success) for (const i of c.error.issues) found[String(i.path[0])] ??= i.message;
    }
    if (which === 2) {
      const d = deliverySchema.safeParse({ address: v.address ?? "", city: v.city ?? "", district: v.district ?? "", postalCode: v.postalCode ?? "", notes: v.notes ?? "" });
      if (!d.success) for (const i of d.error.issues) found[String(i.path[0])] ??= i.message;
    }
    if (which === 3 && v.acceptTerms !== "on") found.acceptTerms = "Please accept the terms to continue";
    return found;
  }

  function goTo(next: Step) {
    if (next === 3) setRecap(values()); // the review always shows what is currently typed
    moved.current = true;
    setStep(next);
    setReached((r) => (next > r ? next : r));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  function focusFirstError() {
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return; // duplicate-submit guard
    setBanner(null);

    if (step < 3) {
      const found = validate(step);
      setErrors(found);
      if (Object.keys(found).length) return focusFirstError();
      return goTo((step + 1) as Step);
    }

    // Final step: validate everything again, then place the order.
    const found = { ...validate(1), ...validate(2), ...validate(3) };
    setErrors(found);
    if (Object.keys(found).length) {
      goTo(Math.min(...Object.keys(found).map(stepOfField)) as Step);
      return focusFirstError();
    }
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
        goTo(Math.min(...Object.keys(data.error.fields).map(stepOfField)) as Step);
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

  const hide = (n: Step) => ({ hidden: step !== n, "aria-hidden": step !== n || undefined });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-busy={submitting}>
      <div className="min-w-0 space-y-6">
        <nav aria-label="Checkout progress">
          <ol className="grid grid-cols-3 gap-2 text-sm">
            {STEPS.map((s) => {
              const done = s.n < step;
              const current = s.n === step;
              const canGo = s.n <= reached && s.n !== step && !submitting;
              const inner = (
                <>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${current ? "border-brand-500 bg-brand-500 text-on-brand" : done ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border text-muted"}`}>
                    {done ? <Check className="h-4 w-4" aria-hidden /> : s.n}
                  </span>
                  <span className={`min-w-0 text-xs sm:text-sm ${current ? "font-semibold text-ink" : "text-muted"}`}>{s.label}</span>
                </>
              );
              return (
                <li key={s.n} className="min-w-0" aria-current={current ? "step" : undefined}>
                  {canGo ? (
                    <button type="button" onClick={() => goTo(s.n)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1" aria-label={`Go to step ${s.n}: ${s.label}`}>{inner}</button>
                  ) : (
                    <span className="flex min-h-11 w-full items-center gap-2 px-1"><span className="sr-only">Step {s.n}: {s.label}{current ? " (current)" : ""}</span>{inner}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {banner && (
          <div role="alert" className={`rounded-lg p-4 text-sm ${banner.kind === "warn" ? "bg-warn-bg text-warn" : "bg-danger-bg text-danger"}`}>
            {banner.text}{" "}
            {banner.kind === "warn" && <Link href="/cart" className="font-semibold underline">Review cart</Link>}
          </div>
        )}

        {/* All three steps stay in the page (inactive ones are hidden) so nothing the customer typed is ever lost. */}
        <section {...hide(1)} className="space-y-4 rounded-3xl border border-border/80 bg-white p-6 shadow-soft" aria-labelledby="step-1">
          <h2 id="step-1" ref={step === 1 ? headingRef : undefined} tabIndex={-1} className="text-base font-bold text-ink outline-none">Your details</h2>
          <Field id="name" label="Full name" error={err("name")}>
            <input id="name" name="name" autoComplete="name" defaultValue={prefill?.name} className="input" {...aria("name")} maxLength={100} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="phone" label="Phone number" error={err("phone")} hint="e.g. 0771234567">
              <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={prefill?.phone?.replace(/^\+94/, "0") ?? undefined} className="input" {...aria("phone")} />
            </Field>
            <Field id="email" label="Email (optional)" error={err("email")}>
              <input id="email" name="email" type="email" autoComplete="email" defaultValue={prefill?.email} className="input" {...aria("email")} maxLength={200} />
            </Field>
          </div>
        </section>

        <section {...hide(2)} className="space-y-4 rounded-3xl border border-border/80 bg-white p-6 shadow-soft" aria-labelledby="step-2">
          <h2 id="step-2" ref={step === 2 ? headingRef : undefined} tabIndex={-1} className="text-base font-bold text-ink outline-none">Delivery address</h2>
          <Field id="address" label="Address" error={err("address")}>
            <input id="address" name="address" autoComplete="street-address" className="input" {...aria("address")} maxLength={250} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="city" label="City" error={err("city")}>
              <input id="city" name="city" autoComplete="address-level2" className="input" {...aria("city")} maxLength={100} />
            </Field>
            <Field id="district" label="District" error={err("district")}>
              <select id="district" name="district" defaultValue="" className="select" {...aria("district")}>
                <option value="" disabled>Select district</option>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field id="postalCode" label="Postal code (optional)" error={err("postalCode")}>
              <input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" className="input" {...aria("postalCode")} maxLength={5} />
            </Field>
          </div>
          <Field id="notes" label="Delivery notes (optional)" error={err("notes")}>
            <textarea id="notes" name="notes" rows={2} maxLength={300} className="textarea" />
          </Field>
        </section>

        <section {...hide(3)} className="space-y-6" aria-labelledby="step-3">
          <h2 id="step-3" ref={step === 3 ? headingRef : undefined} tabIndex={-1} className="text-lg font-semibold outline-none">Review and place your order</h2>

          <div className="card divide-y divide-border text-sm" data-testid="recap">
            <div className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">Contact</p>
                <p className="mt-1 text-muted">{recap.name}<br />{recap.phone}{recap.email ? <><br />{recap.email}</> : null}</p>
              </div>
              <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => goTo(1)}>Change<span className="sr-only"> contact details</span></button>
            </div>
            <div className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">Deliver to</p>
                <p className="mt-1 text-muted">{recap.address}, {recap.city}, {recap.district}{recap.postalCode ? ` ${recap.postalCode}` : ""}{recap.notes ? <><br />Note: {recap.notes}</> : null}</p>
              </div>
              <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => goTo(2)}>Change<span className="sr-only"> delivery address</span></button>
            </div>
          </div>

          <fieldset className="card p-5">
            <legend className="px-1 text-base font-semibold">Payment method</legend>
            <label className="flex items-start gap-3 text-sm">
              <input type="radio" name="payment" value="COD" defaultChecked readOnly className="mt-1 h-4 w-4 accent-brand-600" />
              <span>
                <span className="font-semibold">Cash on delivery</span>
                <span className="block text-muted">Pay in cash when your order is delivered. Your order is not marked as paid until the cash is collected.</span>
              </span>
            </label>
          </fieldset>

          <div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="acceptTerms" className="mt-1 h-4 w-4 accent-brand-600" aria-invalid={err("acceptTerms") ? true : undefined} aria-describedby={err("acceptTerms") ? "acceptTerms-err" : undefined} />
              <span>I agree to the <Link href="/terms" className="font-semibold text-brand-600 underline" target="_blank">terms and conditions</Link> and <Link href="/privacy-policy" className="font-semibold text-brand-600 underline" target="_blank">privacy policy</Link>.</span>
            </label>
            {err("acceptTerms") && <p id="acceptTerms-err" className="field-error" role="alert">{err("acceptTerms")}</p>}
          </div>
        </section>

        <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <button type="button" className="btn-secondary" onClick={() => goTo((step - 1) as Step)} disabled={submitting}>Back</button>
          ) : (
            <Link href="/cart" className="btn-secondary">Back to cart</Link>
          )}
          {step < 3 ? (
            <button type="submit" className="btn-primary min-w-40">Continue</button>
          ) : (
            <button type="submit" className="btn-primary min-w-40" disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Placing order…</> : "Place order"}
            </button>
          )}
        </div>
      </div>

      <aside className="order-first h-fit rounded-3xl border border-border/80 bg-white p-6 shadow-soft lg:sticky lg:top-28 xl:top-32 lg:order-none" aria-label="Order summary">
        <h2 className="hidden text-base font-bold text-ink lg:block">Order Summary</h2>
        {/* Phones: the summary sits above the form, so it starts collapsed to the total and opens on demand. */}
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left lg:hidden"
          aria-expanded={summaryOpen}
          aria-controls="checkout-summary-details"
          onClick={() => setSummaryOpen((o) => !o)}
        >
          <span>
            <span className="block text-lg font-semibold text-ink">Order summary</span>
            <span className="block text-xs text-muted">{lines.length} {lines.length === 1 ? "item" : "items"} · {summaryOpen ? "Hide details" : "Show details"}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-display text-lg font-bold tracking-[-0.02em] tabular-nums text-ink">{formatLkr(total)}</span>
            <ChevronDown className={`h-5 w-5 text-muted transition-transform ${summaryOpen ? "rotate-180" : ""}`} aria-hidden />
          </span>
        </button>
        {unavailable.length > 0 && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-bg p-3 text-sm text-danger">
            {unavailable.map((l) => l.name).join(", ")} {unavailable.length === 1 ? "is" : "are"} not available in the requested quantity. Update the cart before placing the order.
          </p>
        )}
        <div id="checkout-summary-details" className={summaryOpen ? "" : "max-lg:hidden"}>
        <ul className="mt-4 space-y-3 text-sm">
          {lines.map((l) => (
            <li key={lineKey(l)} className="flex items-center gap-3">
              <span className="thumb-stage relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                {l.image ? <Image src={l.image} alt="" fill sizes="56px" className="object-contain p-1" /> : <Smartphone className="m-auto h-full w-6 text-muted" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{l.name}</span>
                <span className="block text-xs text-muted">{l.variantLabel ? `${l.variantLabel} · ` : ""}Qty {l.quantity}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatLkr(subtotal)}</dd></div>
          {savings > 0 && <div className="flex justify-between text-success"><dt>Catalogue savings included</dt><dd>{formatLkr(fromCents(savings))}</dd></div>}
          {offers.map((name) => <div key={name} className="text-xs text-muted">{name}</div>)}
          <div className="flex justify-between"><dt>Delivery</dt><dd data-testid="delivery">{formatLkr(deliveryCharge)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-border pt-3"><dt className="font-semibold">Pay on delivery</dt><dd className="font-display text-2xl font-bold tracking-[-0.02em] tabular-nums text-ink" data-testid="total">{formatLkr(total)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">The store has one delivery charge. No other delivery method is offered.</p>
        <p className="mt-4 text-xs text-muted">Prices and stock are confirmed again when you place your order.</p>
        </div>
      </aside>
    </form>
  );
}
