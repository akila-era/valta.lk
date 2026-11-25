import "server-only";
import { getSettings } from "../erp/settings";
import { isPayzyOffered } from "./payzy-config";

export { isPayzyOffered };

/** Whether to show the Payzy logo on product cards: only when checkout will really offer Payzy. Never throws. */
export async function isPayzyAdvertised(): Promise<boolean> {
  try {
    if (!(await isPayzyOffered())) return false;
    return process.env.PAYZY_ALLOW_WITHOUT_ERP_ONLINE === "true" || Boolean((await getSettings().catch(() => null))?.paymentMethods.ONLINE);
  } catch {
    return false;
  }
}
