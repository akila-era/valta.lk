import "server-only";
import { getSettings } from "../erp/settings";
import { siteConfig } from "../site-config";
import { isKokoOffered } from "./koko-config";

/** Koko always splits into 3 equal instalments. */
export const KOKO_PARTS = 3;

/**
 * How many instalments to advertise on product cards and pages. Follows what checkout will really offer: Koko switched on
 * in admin (or configured by environment) AND accepted by the ERP. Otherwise falls back to the old SITE_KOKO_INSTALLMENTS
 * setting, so nothing is advertised that a customer cannot pay with. Never throws.
 */
export async function getKokoInstallmentParts(): Promise<number> {
  try {
    if (await isKokoOffered()) {
      const erpOnline = process.env.KOKO_ALLOW_WITHOUT_ERP_ONLINE === "true" || Boolean((await getSettings().catch(() => null))?.paymentMethods.ONLINE);
      if (erpOnline) return KOKO_PARTS;
    }
  } catch {
    /* fall through */
  }
  return siteConfig.installments;
}
