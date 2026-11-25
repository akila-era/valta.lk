/** Wholesale constants that the browser also needs (kept apart from the server-only module). */
export const STATUSES = ["new", "contacted", "approved", "declined"] as const;
export type WholesaleStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<WholesaleStatus, string> = { new: "New", contacted: "Contacted", approved: "Approved", declined: "Declined" };
export const BUSINESS_TYPES = ["Retail shop", "Reseller", "Online store", "Corporate / office", "Other"] as const;
