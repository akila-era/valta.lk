/** Business details come from environment configuration; blank values are hidden rather than invented. */
export const siteConfig = {
  name: "VOLTA.LK",
  description: "Mobile phones, electronics and accessories in Sri Lanka.",
  url: (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  phone: process.env.SITE_CONTACT_PHONE?.trim() || "",
  email: process.env.SITE_CONTACT_EMAIL?.trim() || "",
  address: process.env.SITE_CONTACT_ADDRESS?.trim() || "",
  /** Opening hours, one line per "|"-separated part, e.g. "Mon - Sat: 9:00 AM - 6:00 PM|Sunday: Closed". Blank = not shown. */
  hours: (process.env.SITE_BUSINESS_HOURS ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 4),
  /**
   * Payment brands to show under "We accept" in the footer, as a comma list of: visa, mastercard, amex, frimi, ezcash,
   * mcash, koko, genie. Blank = none. List only methods checkout really offers: today the ERP supports cash on delivery only.
   */
  paymentMethods: (process.env.SITE_PAYMENT_METHODS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => ["visa", "mastercard", "amex", "frimi", "ezcash", "mcash", "koko", "genie"].includes(s)).slice(0, 8),
  announcement: process.env.SITE_ANNOUNCEMENT?.trim() || "",
  whatsapp: process.env.SITE_CONTACT_WHATSAPP?.trim() || "",
  /** Owner-supplied service claims for the top bar, e.g. "Islandwide Delivery|Secure Payments". Blank = derived from live ERP settings. */
  highlights: (process.env.SITE_HIGHLIGHTS ?? "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3),
};
