import { getCheckoutAvailability } from "@/lib/erp/settings";
import { guard, json } from "@/lib/security/api";

export const dynamic = "force-dynamic";

/** Public, minimal view of ERP settings needed by the checkout UI. */
export async function GET(req: Request) {
  const blocked = guard(req, { name: "settings", limit: 60, windowMs: 60_000 });
  if (blocked) return blocked;
  const a = await getCheckoutAvailability();
  return json({
    enabled: a.enabled,
    reason: a.reason ?? null,
    currency: a.settings?.currency ?? null,
    deliveryCharge: a.enabled ? a.settings!.deliveryCharge : null,
    paymentMethods: a.enabled ? ["COD"] : [],
  });
}
