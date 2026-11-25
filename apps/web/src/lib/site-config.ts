import { SHOW_PHONE } from "./brand";

/** Business details come from environment configuration; blank values are hidden rather than invented. */
export const siteConfig = {
  name: "VOLTA.LK",
  description: "Mobile phones, electronics and accessories in Sri Lanka.",
  url: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  phone: SHOW_PHONE ? process.env.SITE_CONTACT_PHONE?.trim() || "" : "",
  email: process.env.SITE_CONTACT_EMAIL?.trim() || "",
  address: process.env.SITE_CONTACT_ADDRESS?.trim() || "",
  /** Opening hours, one line per "|"-separated part, e.g. "Mon - Sat: 9:00 AM - 6:00 PM|Sunday: Closed". Blank = not shown. */
  hours: (process.env.SITE_BUSINESS_HOURS ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4),
  /**
   * Payment brands to show under "We accept" in the footer, as a comma list of: visa, mastercard, amex, frimi, ezcash,
   * mcash, koko, genie. Blank = none. List only methods checkout really offers: today the ERP supports cash on delivery only.
   */
  paymentMethods: (process.env.SITE_PAYMENT_METHODS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => ["visa", "mastercard", "amex", "frimi", "ezcash", "mcash", "koko", "genie"].includes(s)).slice(0, 8),
  /** Koko-style instalments: number of equal parts (e.g. 3). 0 / blank = not offered, line hidden. */
  installments: Math.min(6, Math.max(0, Number.parseInt(process.env.SITE_KOKO_INSTALLMENTS ?? "", 10) || 0)),
  /** Delivery time shown on the product page, e.g. "2-4 days". */
  deliveryTime: process.env.SITE_DELIVERY_TIME?.trim() || "2-4 days",
  /** Warranty text used when a product has none of its own, e.g. "1 year". Blank = line shows "Warranty support available". */
  warranty: process.env.SITE_WARRANTY?.trim() || "",
  /** Warranty page and links stay hidden until the business approves the warranty terms (WARRANTY_TERMS_APPROVED=true). */
  warrantyApproved: process.env.WARRANTY_TERMS_APPROVED === "true",
  announcement: process.env.SITE_ANNOUNCEMENT?.trim() || "",
  whatsapp: process.env.SITE_CONTACT_WHATSAPP?.trim() || "",
  /** Owner-supplied service claims for the top bar, e.g. "Islandwide Delivery|Secure Payments". Blank = derived from live ERP settings. */
  highlights: (process.env.SITE_HIGHLIGHTS ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3),
};
