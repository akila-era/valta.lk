import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ClearCartOnPaid } from "@/components/checkout/koko-redirect";
import { PayzyRetryButton } from "@/components/checkout/payzy-redirect";
import { getDb } from "@/lib/db";
import { isValidOrderRef } from "@/lib/utils/order-ref";

export const metadata: Metadata = { title: "Payzy payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Where the browser lands after Payzy. It shows what OUR database says; the redirect params were verified (or ignored) by the return route. */
export default async function PayzyResultPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const ref = String((await searchParams).orderId ?? "").toUpperCase();
  const db = getDb();
  if (!db || !isValidOrderRef(ref)) notFound();

  const order = await db.webOrder.findUnique({ where: { externalRef: ref }, select: { paymentMethod: true, paymentStatus: true, payzyPayments: { orderBy: { attemptNo: "desc" }, take: 1, select: { status: true } } } });
  if (!order || order.paymentMethod !== "PAYZY") notFound();

  const latest = order.payzyPayments[0];
  const state = order.paymentStatus === "PAID" ? "success" : !latest ? "none" : latest.status === "FAILED" ? "failed" : "processing";

  return (
    <div className="mx-auto max-w-xl space-y-6 text-center">
      <div className="rounded-3xl bg-surface px-6 py-10 sm:px-10" data-testid="payzy-result" data-state={state}>
        {state === "success" && (
          <>
            <ClearCartOnPaid />
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
            <h1 className="page-title mt-5">Payment received, thank you</h1>
            <p className="mt-2 text-sm text-muted">Your Payzy payment is confirmed and your order is placed.</p>
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
            <h1 className="page-title mt-5">We have not received confirmation yet</h1>
            <p role="status" className="mt-2 text-sm text-muted">Payzy has not confirmed this payment to us. If you completed it, please do not pay again: we will check it and update your order. Otherwise you can try again.</p>
            <p className="mt-3 break-all font-mono text-sm font-semibold tracking-wider">{ref}</p>
            <div className="mt-6 flex flex-wrap items-start justify-center gap-3">
              <PayzyRetryButton orderRef={ref} />
              <Link href="/checkout" className="btn-secondary">Choose another payment method</Link>
            </div>
          </>
        )}
        {(state === "failed" || state === "none") && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-danger" aria-hidden />
            <h1 className="page-title mt-5">The Payzy payment did not go through</h1>
            <p className="mt-2 text-sm text-muted">Your order is not paid. Your cart and order details are saved.</p>
            <div className="mt-6 flex flex-wrap items-start justify-center gap-3">
              <PayzyRetryButton orderRef={ref} />
              <Link href="/checkout" className="btn-secondary">Choose another payment method</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
