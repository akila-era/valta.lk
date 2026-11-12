import type { AccessoryKind } from "./types";

/**
 * The website-owned data the assistant may read. In the real site this lives in the website database: explicit accessory links
 * staff made, admin promotions, product content (specifications), and which customer placed which order. M1 supplies mock values
 * from `src/mock/site-data.ts`; nothing here is inferred from names.
 */
export interface AccessoryLink {
  sourceItemId: string;
  /** "" = fits every variant of the source product. */
  sourceVariantKey: string;
  accessoryItemId: string;
  kind: AccessoryKind;
}

export interface Promotion {
  name: string;
  productIds: string[];
  /** A customer-limited offer is shown only to signed-in customers. */
  customerOnly: boolean;
  active: boolean;
}

export interface SiteData {
  links: AccessoryLink[];
  promotions: Promotion[];
  /** Specification rows staff entered, keyed by ERP product id. */
  content: Record<string, { specs: { name: string; value: string }[] }>;
  /** customerId -> order references, newest first. The ERP has no "orders by customer" endpoint, so this link is the only way. */
  customerOrders: Map<string, string[]>;
}
