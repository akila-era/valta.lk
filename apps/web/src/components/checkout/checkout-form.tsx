"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CreditCard, Loader2, Lock, MapPin, Minus, Plus, ShieldCheck, Smartphone, Trash2, User } from "lucide-react";
import { useLiveCart } from "@/components/cart/use-live-cart";
import { EmptyState } from "@/components/ui/states";
import { addMoney, formatLkr, fromCents, multiplyMoney, toCents } from "@/lib/utils/money";
import { generateOrderRef } from "@/lib/utils/order-ref";
import { lineKey, MAX_LINE_QTY } from "@/lib/utils/cart-math";
import { customerSchema, deliverySchema, DISTRICTS, normalizeLkPhone } from "@/lib/validation/checkout";
import { cartActions, useCart } from "@/store/cart";
import { KokoInstalmentSchedule, PAYZY_PARTS, useKokoParts } from "@/components/products/koko-instalment";
import { RedirectingToKoko, startKokoRedirect } from "./koko-redirect";
import { RedirectingToPayzy, startPayzyRedirect } from "./payzy-redirect";

const REF_KEY = "valta.checkout.ref"; // unchanged so an order already in progress keeps its reference
const SAVED_KEY = "volta.checkout.details";
type Saved = { name?: string; phone?: string; altPhone?: string; email?: string; address?: string; city?: string; district?: string; postalCode?: string };

type Method = "COD" | "KOKO" | "PAYZY";
// One reference per payment method: the same reference cannot be reused for an order with different contents.
const refKey = (m: Method) => (m === "KOKO" ? `${REF_KEY}.koko` : m === "PAYZY" ? `${REF_KEY}.payzy` : REF_KEY);

function getRef(m: Method): string {
  try {
    const existing = window.sessionStorage.getItem(refKey(m));
    if (existing) return existing;
    const ref = generateOrderRef();
    window.sessionStorage.setItem(refKey(m), ref);
    return ref;
  } catch {
    return generateOrderRef();
  }
}
const resetRef = (m: Method) => {
  try {
    window.sessionStorage.removeItem(refKey(m));
  } catch {
    /* ignore */
  }
};

type Errors = Record<string, string>;
const FIELD_ORDER = ["name", "phone", "altPhone", "email", "address", "city", "district", "postalCode", "notes", "acceptTerms"];

function Field({ id, label, error, hint, ok, children }: { id: string; label: string; error?: string; hint?: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label flex items-center gap-1.5">
        {label}
        {ok && !error && <Check className="h-3.5 w-3.5 text-success" aria-label="looks good" />}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function CheckoutForm({ deliveryCharge, prefill, methods = { cod: true, koko: false, payzy: false }, notice }: { deliveryCharge: number; prefill?: { name: string; email: string; phone: string | null }; methods?: { cod: boolean; koko: boolean; payzy?: boolean }; notice?: "cancelled" }) {
  const router = useRouter();
  const { lines, subtotal } = useCart();
  const { live } = useLiveCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: "error" | "warn"; text: string } | null>(notice === "cancelled" ? { kind: "warn", text: "Payment cancelled. Your cart is still here, so you can try again or choose another payment method." } : null);
  const [method, setMethod] = useState<Method>(methods.cod ? "COD" : methods.koko ? "KOKO" : "PAYZY");
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const inFlight = useRef(false);
  const openedTotal = useRef<number | null>(null);
  const [priceAck, setPriceAck] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Details this shopper chose to keep on this device (never sent anywhere): fill the form for the next order.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SAVED_KEY);
        if (raw) setSaved(JSON.parse(raw) as Saved);
      } catch {
        /* storage can be blocked: the form simply starts empty */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const kokoParts = useKokoParts();
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
  const err = (k: string) => errors[k];
  const aria = (k: string) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `${k}-err` : undefined });
  const values = () => Object.fromEntries([...new FormData(formRef.current!).entries()].map(([k, v]) => [k, String(v)])) as Record<string, string>;

  /** Validates every field of the form; returns the errors found (also shown inline). */
  function validate(): Errors {
    const v = values();
    const found: Errors = {};
    const c = customerSchema.safeParse({ name: v.name ?? "", phone: v.phone ?? "", email: v.email ?? "" });
    if (!c.success) for (const i of c.error.issues) found[String(i.path[0])] ??= i.message;
    const d = deliverySchema.safeParse({ address: v.address ?? "", city: v.city ?? "", district: v.district ?? "", postalCode: v.postalCode ?? "", notes: v.notes ?? "" });
    if (!d.success) for (const i of d.error.issues) found[String(i.path[0])] ??= i.message;
    if ((v.altPhone ?? "").trim() && normalizeLkPhone(v.altPhone) === null) found.altPhone = "Enter a valid Sri Lankan phone number, e.g. 0112345678";
    if ((v.altPhone ?? "").trim() && normalizeLkPhone(v.altPhone) === normalizeLkPhone(v.phone ?? "")) found.altPhone ??= "Use a different number from the first one";
    if (v.acceptTerms !== "on") found.acceptTerms = "Please accept the terms to continue";
    return found;
  }

  /** Checks one field when the shopper leaves it, so mistakes show up straight away instead of at the end. */
  function checkField(name: string) {
    const f = formRef.current;
    if (!f) return;
    setTouched((t) => ({ ...t, [name]: Boolean(values()[name]?.trim()) })); // optional fields only get a tick when filled
    const all = validate();
    const msg = all[name];
    setErrors((e) => {
      const next = { ...e };
      if (msg && name !== "acceptTerms") next[name] = msg;
      else delete next[name];
      return next;
    });
  }
  const onBlurField = (e: React.FocusEvent<HTMLFormElement>) => {
    const el = e.target as unknown as HTMLInputElement;
    if (el.name && ["name", "phone", "altPhone", "email", "address", "city", "district", "postalCode"].includes(el.name)) checkField(el.name);
  };
  const ok = (k: string) => Boolean(touched[k] && !errors[k]);

  function focusFirstError() {
    requestAnimationFrame(() => {
      const bad = [...document.querySelectorAll<HTMLElement>("[aria-invalid=true]")];
      bad.sort((a, b) => FIELD_ORDER.indexOf(a.getAttribute("name") ?? "") - FIELD_ORDER.indexOf(b.getAttribute("name") ?? ""));
      bad[0]?.focus();
      bad[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
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
    // The order record has one phone field, so the second number travels with the delivery notes the delivery team reads.
    const alt = (v.altPhone ?? "").trim() ? normalizeLkPhone(v.altPhone) : null;
    const notesText = [alt ? `Second phone: ${alt}` : "", (v.notes ?? "").trim()].filter(Boolean).join(" | ").slice(0, 300);
    const delivery = deliverySchema.parse({ address: v.address, city: v.city, district: v.district, postalCode: v.postalCode, notes: notesText });

    try {
      if (remember) window.localStorage.setItem(SAVED_KEY, JSON.stringify({ name: v.name, phone: v.phone, altPhone: v.altPhone, email: v.email, address: v.address, city: v.city, district: v.district, postalCode: v.postalCode } satisfies Saved));
      else window.localStorage.removeItem(SAVED_KEY);
    } catch {
      /* ignore */
    }
    inFlight.current = true;
    setSubmitting(true);
    const externalRef = getRef(method);
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
          paymentMethod: method,
          acceptTerms: true,
        }),
      });
      const data = await res.json().catch(() => null);

      // 201 = confirmed by the ERP, 202 = saved on the website and being confirmed: both are a successful order.
      if (res.ok && data?.state === "payment_required") {
        // Koko/Payzy: the order is saved but unpaid. Keep the cart and reference until the gateway confirms, then go to its result page.
        setRedirecting(true);
        try {
          await (method === "PAYZY" ? startPayzyRedirect(externalRef) : startKokoRedirect(externalRef));
        } catch (e) {
          setRedirecting(false);
          setBanner({ kind: "error", text: e instanceof Error ? e.message : `We could not start the ${method === "PAYZY" ? "Payzy" : "Koko"} payment. Please try again.` });
        }
        return;
      }
      if (res.ok) {
        resetRef(method);
        cartActions.clear();
        router.push(`/order-confirmation/${externalRef}`);
        return;
      }

      const code: string | undefined = data?.error?.code;
      if (res.status === 422 && data?.error?.fields) {
        resetRef(method); // nothing was sent to the ERP
        setErrors(data.error.fields);
        setBanner({ kind: "error", text: data.error.message });
        focusFirstError();
      } else if (code === "PRICE_CHANGED" || code === "INSUFFICIENT_STOCK") {
        resetRef(method); // definitive rejection: a corrected order gets a new reference
        if (Array.isArray(data.error.refreshed)) cartActions.applyPrices(data.error.refreshed.filter((r: { available: boolean; unitPrice: number }) => r.available && r.unitPrice > 0));
        setBanner({ kind: "warn", text: data.error.message });
      } else if (code === "CANNOT_COMBINE" || code === "VALIDATION_FAILED") {
        resetRef(method); // definitive rejection of the request contents
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

  const card = "rounded-2xl border border-border bg-white p-5 sm:p-7";
  const head = (n: number, title: string, icon: React.ReactNode, id: string) => (
    <h2 id={id} className="mb-5 flex items-center gap-3 text-lg font-semibold tracking-tight text-ink">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-on-brand" aria-hidden>{n}</span>
      {title}
      <span className="ml-auto hidden text-muted sm:block" aria-hidden>{icon}</span>
    </h2>
  );
  const payOption = (id: Method, title: string, text: string) => {
    const logo = id === "KOKO" ? { src: "/images/koko-logo.png", w: 240, h: 74, cls: "h-5" } : id === "PAYZY" ? { src: "/images/payzy-logo.png", w: 260, h: 72, cls: "h-[18px]" } : null;
    const parts = id === "KOKO" ? kokoParts : id === "PAYZY" ? PAYZY_PARTS : 0;
    return (
      <div key={id} className={`rounded-xl border-2 bg-white text-sm transition-colors ${method === id ? "border-brand-500 bg-brand-50/50" : "border-border hover:border-ink/40"}`}>
        <label className="flex cursor-pointer items-start gap-3 p-4">
          <input type="radio" name="payment" value={id} checked={method === id} onChange={() => setMethod(id)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-ink">{title}</span>
            <span className="block text-muted">{text}</span>
          </span>
          {logo && <Image src={logo.src} alt="" width={logo.w} height={logo.h} className={`${logo.cls} w-auto shrink-0 self-center`} />}
        </label>
        {parts >= 2 && (
          <div className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${method === id ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <KokoInstalmentSchedule total={total} parts={parts} monthly={id === "PAYZY"} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} onBlur={onBlurField} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8" aria-busy={submitting}>
      <div className="min-w-0 space-y-5 max-lg:pb-24">
        {redirecting && <div className="rounded-xl bg-surface p-4">{method === "PAYZY" ? <RedirectingToPayzy /> : <RedirectingToKoko />}</div>}
        {banner && (
          <div role="alert" className={`rounded-xl p-4 text-sm ${banner.kind === "warn" ? "bg-warn-bg text-warn" : "bg-danger-bg text-danger"}`}>
            {banner.text}{" "}
            {banner.kind === "warn" && <Link href="/cart" className="font-semibold underline">Review cart</Link>}
          </div>
        )}

        <section className={card} aria-labelledby="co-contact">
          {head(1, "Contact details", <User className="h-5 w-5" />, "co-contact")}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="name" label="Full name" error={err("name")} ok={ok("name")}>
                <input key={`n-${saved ? 1 : 0}`} id="name" name="name" autoComplete="name" defaultValue={prefill?.name || saved?.name} className="input min-h-12" {...aria("name")} maxLength={100} />
              </Field>
            </div>
            <Field id="phone" label="Phone number" error={err("phone")} ok={ok("phone")} hint="07XXXXXXXX, e.g. 0771234567">
              <input key={`p-${saved ? 1 : 0}`} id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={prefill?.phone?.replace(/^\+94/, "0") ?? saved?.phone} className="input min-h-12" placeholder="07X XXX XXXX" {...aria("phone")} />
            </Field>
            <Field id="altPhone" label="Second phone number (optional)" error={err("altPhone")} ok={ok("altPhone")} hint="Another number we can call if the first is busy">
              <input key={`q-${saved ? 1 : 0}`} id="altPhone" name="altPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={saved?.altPhone} className="input min-h-12" placeholder="07X XXX XXXX" {...aria("altPhone")} />
            </Field>
            <Field id="email" label="Email (optional)" error={err("email")} ok={ok("email")}>
              <input key={`e-${saved ? 1 : 0}`} id="email" name="email" type="email" autoComplete="email" defaultValue={prefill?.email || saved?.email} className="input min-h-12" {...aria("email")} maxLength={200} />
            </Field>
          </div>
        </section>

        <section className={card} aria-labelledby="co-delivery">
          {head(2, "Delivery address", <MapPin className="h-5 w-5" />, "co-delivery")}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="address" label="Address" error={err("address")} ok={ok("address")}>
                <input key={`a-${saved ? 1 : 0}`} id="address" name="address" autoComplete="street-address" defaultValue={saved?.address} className="input min-h-12" {...aria("address")} maxLength={250} />
              </Field>
            </div>
            <Field id="city" label="City" error={err("city")} ok={ok("city")}>
              <input key={`c-${saved ? 1 : 0}`} id="city" name="city" autoComplete="address-level2" defaultValue={saved?.city} className="input min-h-12" {...aria("city")} maxLength={100} />
            </Field>
            <Field id="district" label="District" error={err("district")} ok={ok("district")}>
              <select key={`d-${saved ? 1 : 0}`} id="district" name="district" defaultValue={saved?.district ?? ""} className="select min-h-12" {...aria("district")}>
                <option value="" disabled>Select district</option>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field id="postalCode" label="Postal code (optional)" error={err("postalCode")}>
              <input key={`z-${saved ? 1 : 0}`} id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" defaultValue={saved?.postalCode} className="input min-h-12" {...aria("postalCode")} maxLength={5} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="notes" label="Delivery notes (optional)" error={err("notes")}>
                <textarea id="notes" name="notes" rows={2} maxLength={300} className="textarea" />
              </Field>
            </div>
          </div>
        </section>

        <fieldset className={card}>
          <legend className="sr-only">Payment method</legend>
          {head(3, "Payment method", <CreditCard className="h-5 w-5" />, "co-payment")}
          <div className="space-y-3">
            {methods.cod && payOption("COD", "Cash on delivery", "Pay in cash when your order is delivered. Your order is not marked as paid until the cash is collected.")}
            {methods.koko && payOption("KOKO", "Koko: Buy Now Pay Later", "Pay in 3 interest free instalments with Koko.")}
            {methods.payzy && payOption("PAYZY", "Payzy: pay in instalments", "Split your payment into instalments with Payzy.")}
          </div>
        </fieldset>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
          <span>Remember my details on this device for next time<span className="block text-xs text-muted">Stored only in this browser, never sent anywhere. Untick to remove them.</span></span>
        </label>

        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" aria-invalid={err("acceptTerms") ? true : undefined} aria-describedby={err("acceptTerms") ? "acceptTerms-err" : undefined} />
            <span>I agree to the <Link href="/terms" className="font-semibold text-brand-600 underline" target="_blank">terms and conditions</Link> and <Link href="/privacy-policy" className="font-semibold text-brand-600 underline" target="_blank">privacy policy</Link>.</span>
          </label>
          {err("acceptTerms") && <p id="acceptTerms-err" className="field-error" role="alert">{err("acceptTerms")}</p>}
        </div>

        <div className="pb-safe flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/cart" className="btn-secondary whitespace-nowrap">Back to cart</Link>
          <button type="submit" className="btn-primary btn-lg w-full rounded-full sm:w-auto sm:min-w-56" disabled={submitting}>
            {redirecting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Redirecting to {method === "PAYZY" ? "Payzy" : "Koko"}…</> : submitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Placing order…</> : <><Lock className="h-4 w-4" aria-hidden /> {method === "KOKO" ? "Pay with Koko" : method === "PAYZY" ? "Pay with Payzy" : "Place order"} · {formatLkr(total)}</>}
          </button>
        </div>
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur lg:hidden">
        <p className="min-w-0 flex-1">
          <span className="block text-xs text-muted">{method === "COD" ? "Pay on delivery" : "Total"}</span>
          <span className="block text-lg font-semibold tabular-nums text-ink">{formatLkr(total)}</span>
        </p>
        <button type="submit" className="btn-primary btn-lg shrink-0 rounded-full px-6" disabled={submitting}>
          {submitting || redirecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
          {method === "KOKO" ? "Pay with Koko" : method === "PAYZY" ? "Pay with Payzy" : "Place order"}
        </button>
      </div>

      <aside className="order-first h-fit rounded-2xl border border-border bg-white p-5 sm:p-6 lg:sticky lg:top-40 lg:order-none" aria-label="Order summary">
        <h2 className="hidden text-lg font-semibold lg:block">Order summary</h2>
        {/* Phones: the summary sits above the form, so it starts collapsed to the total and opens on demand. */}
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left lg:hidden"
          aria-expanded={summaryOpen}
          aria-controls="checkout-summary-details"
          onClick={() => setSummaryOpen((o) => !o)}
        >
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-base font-semibold text-ink sm:text-lg">Order summary</span>
            <span className="block text-xs text-muted">{lines.length} {lines.length === 1 ? "item" : "items"} · {summaryOpen ? "Hide details" : "Show details"}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="whitespace-nowrap text-base font-semibold tabular-nums text-ink sm:text-lg">{formatLkr(total)}</span>
            <ChevronDown className={`h-5 w-5 text-muted transition-transform ${summaryOpen ? "rotate-180" : ""}`} aria-hidden />
          </span>
        </button>
        {unavailable.length > 0 && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-bg p-3 text-sm text-danger">
            {unavailable.map((l) => l.name).join(", ")} {unavailable.length === 1 ? "is" : "are"} not available in the requested quantity. Update the cart before placing the order.
          </p>
        )}
        <div id="checkout-summary-details" className={summaryOpen ? "" : "max-lg:hidden"}>
        <ul className="mt-4 space-y-4 text-sm">
          {lines.map((l) => {
            const key = lineKey(l);
            const d = live?.find((x) => x.productId === l.productId && x.variantKey === l.variantKey);
            const max = d?.maxQuantity ?? null;
            return (
              <li key={key} className="flex items-start gap-3">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-white">
                  {l.image ? <Image src={l.image} alt={l.name} fill sizes="56px" className="object-contain p-1" /> : <Smartphone className="m-auto h-full w-6 text-muted" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{l.name}</span>
                  {l.variantLabel && <span className="block text-xs text-muted">{l.variantLabel}</span>}
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="flex items-center rounded-full border border-border" role="group" aria-label={`Quantity for ${l.name}`}>
                      <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface disabled:opacity-40" aria-label={`Decrease quantity of ${l.name}`} disabled={l.quantity <= 1 || submitting} onClick={() => cartActions.setQuantity(key, l.quantity - 1)}>
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.quantity}</span>
                      <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface disabled:opacity-40" aria-label={`Increase quantity of ${l.name}`} disabled={l.quantity >= MAX_LINE_QTY || (max != null && l.quantity >= max) || submitting} onClick={() => cartActions.setQuantity(key, l.quantity + 1)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-danger disabled:opacity-40" aria-label={`Remove ${l.name}`} disabled={submitting} onClick={() => cartActions.remove(key)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatLkr(multiplyMoney(l.unitPrice, l.quantity))}</span>
              </li>
            );
          })}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatLkr(subtotal)}</dd></div>
          {savings > 0 && <div className="flex justify-between text-success"><dt>Catalogue savings included</dt><dd>{formatLkr(fromCents(savings))}</dd></div>}
          {offers.map((name) => <div key={name} className="text-xs text-muted">{name}</div>)}
          <div className="flex justify-between"><dt>Delivery</dt><dd data-testid="delivery">{formatLkr(deliveryCharge)}</dd></div>
          <div className="flex items-baseline justify-between border-t border-border pt-3"><dt className="font-semibold">{method === "COD" ? "Pay on delivery" : "Total"}</dt><dd className="text-xl font-semibold tabular-nums text-ink" data-testid="total">{formatLkr(total)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">The store has one delivery charge. No other delivery method is offered.</p>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface p-3 text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />Prices and stock are confirmed again when you place your order.</p>
        </div>
      </aside>
    </form>
  );
}
