import { readFileSync } from "node:fs";
import type { SiteData } from "../../../src/backend/site";
import { ErpUnavailableError, type ErpTransport } from "../../../src/backend/transport";
import { RawProduct, type RawOrder, type RawSettings } from "../../../src/backend/wire";

/**
 * A read-only snapshot of the REAL catalogue, dumped through the website's signed relay and kept OUTSIDE the repository (the path comes from
 * REAL_CATALOGUE_JSON). It is used only to see how the reasoning layer behaves on the data the shop really has. Nothing is invented: each record is
 * parsed with the same strict wire schema the Agent uses in production.
 */
export interface Snapshot {
  count: number;
  items: unknown[];
  settings?: unknown;
}

export const loadSnapshot = (path: string): Snapshot => JSON.parse(readFileSync(path, "utf8")) as Snapshot;

export class SnapshotTransport implements ErpTransport {
  readonly origin = "https://valta.hexalyte.com";
  private readonly products: RawProduct[];
  constructor(snap: Snapshot) {
    this.products = snap.items.map((i) => RawProduct.parse(i));
  }
  async listProducts(): Promise<RawProduct[]> {
    return this.products;
  }
  async getProduct(id: string): Promise<RawProduct | null> {
    return this.products.find((p) => p.id === id) ?? null;
  }
  async getSettings(): Promise<RawSettings> {
    return { currency: "LKR", ordersEnabled: true, deliveryCharge: "0.00" };
  }
  async getOrder(): Promise<RawOrder | null> {
    throw new ErpUnavailableError("UNREACHABLE", "orders are never read from a snapshot");
  }
}

/** The Agent on the real-catalogue path (no website content, no accessory links, no promotions), exactly as deployed. */
export const emptySite = (): SiteData => ({ links: [], promotions: [], content: {}, customerOrders: new Map() });
