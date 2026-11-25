import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ClearCartOnPaid, KokoRetryButton, PollWhilePending } from "@/components/checkout/koko-redirect";
import { getDb } from "@/lib/db";
import { recheckKokoAttempt } from "@/lib/payments/koko-service";
import { isValidOrderRef } from "@/lib/utils/order-ref";

export const metadata: Metadata = { title: "Koko payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where the browser lands after Koko. It shows what OUR database says. The redirect params are never trusted: while the
 * payment is still pending we ask Koko (orderView, signed) and the page refreshes itself for a short while.
 */
export default async function KokoResultPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const ref = String((await searchParams).orderId ?? "").toUpperCase();
  const db = getDb();
  if (!db || !isValidOrderRef(ref)) notFound();

  let order = await db.webOrder.findUnique({ where: { externalRef: ref }, select: { paymentMethod: true, paymentStatus: true, kokoPayments: { orderBy: { attemptNo: "desc" }, take: 1, select: { kokoOrderId: true, status: true } } } });
  if (!order || order.paymentMethod !== "KOKO") notFound();

  let latest = order.kokoPayments[0];
  if (order.paymentStatus !== "PAID" && latest?.status === "PENDING") {
    await recheckKokoAttempt(db, latest.kokoOrderId).catch(() => undefined);
    order = (await db.webOrder.findUnique({ where: { externalRef: ref }, select: { paymentMethod: true, paymentStatus: true, kokoPayments: { orderBy: { attemptNo: "desc" }, take: 1, select: { kokoOrderId: true, status: true } } } })) ?? order;
    latest = order.kokoPayments[0];
  }

  const state = order.paymentStatus === "PAID" ? "success" : !latest ? "none" : latest.status === "PENDING" ? "processing" : latest.status === "FAILED" ? "failed" : latest.status === "CANCELED" ? "cancelled" : "processing";

  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <div className="rounded-3xl bg-surface px-6 py-10 sm:px-10" data-testid="koko-result" data-state={state}>
        {state === "success" && (
          <>
            <ClearCartOnPaid />
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
            <h1 className="page-title mt-5">Payment received, thank you</h1>
            <p className="mt-2 text-sm text-muted">Your Koko payment is confirmed and your order is placed.</p>
            <p className="mt-3 break-all font-mono text-lg font-semibold tracking-wider">{ref}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={`/order-confirmation/${ref}`} className="btn-primary">View your order</Link>
              <Link href="/products" className="btn-secondary">Continue shopping</Link>
            </div>
          </>
        )}
        {state === "processing" && (
          <>
            <Clock className="mx-auto h-12 w-12 text-warn" aria-hidden />
            <h1 className="page-title mt-5">Confirming your payment…</h1>
            <p role="status" className="mt-2 text-sm text-muted">We are waiting for Koko to confirm. This usually takes a few seconds. Please do not pay again.</p>
            <PollWhilePending />
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-danger" aria-hidden />
            <h1 className="page-title mt-5">The Koko payment did not go through</h1>
            <p className="mt-2 text-sm text-muted">You have not been charged for this attempt. Your cart and order details are saved.</p>
            <div className="mt-6 flex flex-wrap items-start justify-center gap-3">
              <KokoRetryButton orderRef={ref} />
              <Link href="/checkout" className="btn-secondary">Choose another payment method</Link>
            </div>
          </>
        )}
        {(state === "cancelled" || state === "none") && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-warn" aria-hidden />
            <h1 className="page-title mt-5">Payment cancelled</h1>
            <p className="mt-2 text-sm text-muted">Nothing was charged. Your cart is still here.</p>
            <div className="mt-6 flex flex-wrap items-start justify-center gap-3">
              <KokoRetryButton orderRef={ref} />
              <Link href="/checkout" className="btn-secondary">Back to checkout</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
