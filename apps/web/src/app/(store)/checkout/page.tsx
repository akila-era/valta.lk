import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { accountsEnabled, getCurrentCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCheckoutAvailability } from "@/lib/erp/settings";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  not_configured: "Online ordering is not available right now.",
  unreachable: "We could not reach our ordering system. Please try again in a few minutes.",
  store_inactive: "The store is not accepting orders at the moment.",
  orders_disabled: "Online orders are temporarily paused.",
  cod_disabled: "Cash on delivery is not available right now, so we cannot take orders online at the moment.",
  invalid_delivery_charge: "Online ordering is temporarily unavailable.",
};

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const notice = (await searchParams).payment === "cancelled" ? ("cancelled" as const) : undefined;
  const [cod, customer] = await Promise.all([getCheckoutAvailability({ fresh: true }), getCurrentCustomer()]);
  // Koko needs the website database (orders wait there until paid), Koko credentials and the ERP accepting ONLINE orders.
  const online = getDb() ? await getCheckoutAvailability({ method: "ONLINE" }) : { enabled: false as const, settings: undefined, reason: undefined };
  const payzy = getDb() ? await getCheckoutAvailability({ method: "ONLINE", gateway: "PAYZY" }) : { enabled: false as const, settings: undefined, reason: undefined };
  const a = cod.enabled ? cod : online.enabled ? online : payzy.enabled ? payzy : cod;
  return (
    <>
      <h1 className="page-title mb-6">Checkout</h1>
      {a.enabled && a.settings ? (
        <>
          {!customer && accountsEnabled() && (
            <p className="mb-5 text-sm text-muted">
              Have an account? <Link href="/account/login?next=/checkout" className="font-semibold text-brand-600 hover:underline">Sign in</Link> to fill in your details and see this order in your account. Guest checkout works too.
            </p>
          )}
          <CheckoutForm deliveryCharge={a.settings.deliveryCharge} prefill={customer ?? undefined} methods={{ cod: cod.enabled, koko: online.enabled, payzy: payzy.enabled }} notice={notice} />
        </>
      ) : (
        <div role="alert" className="card border-warn/30 bg-warn-bg p-8 text-center">
          <h2 className="text-lg font-semibold text-warn">Checkout is unavailable</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-warn">{MESSAGES[a.reason ?? "unreachable"]}</p>
          {a.reason === "cod_disabled" && a.settings?.paymentMethods.ONLINE && (
            <p className="mx-auto mt-2 max-w-md text-sm text-warn">Online payment is switched on in the ERP, but this website has no payment gateway connected, so card payment cannot be taken.</p>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/checkout" className="btn-secondary">Try again</Link>
            <Link href="/cart" className="btn-secondary">Back to cart</Link>
          </div>
        </div>
      )}
    </>
  );
}
