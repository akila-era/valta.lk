import type { SiteData } from "../../src/backend/site";
import { ErpUnavailableError, type ErpTransport } from "../../src/backend/transport";
import { RawProduct, type RawOrder, type RawSettings } from "../../src/backend/wire";

/**
 * TEST FIXTURE ONLY: a small invented catalogue with real-looking spread (camera, battery and memory numbers, several brands, one
 * out-of-stock item, specs entered two ways) so recommendation reasoning can be measured. It is NOT VOLTA.LK data and nothing here may
 * be imported by production code. "Samsung" appears only so brand handling can be tested; the items are invented.
 */
export interface FixtureItem {
  id: string;
  name: string;
  brand: string;
  category: "Mobile Phones" | "Laptops" | "Accessories" | "Audio" | "Wearables";
  price: number;
  stock?: number;
  /** Where the numbers live: staff-entered specification rows, the plain-text description, or nowhere. */
  via?: "spec" | "description" | "none";
  camera?: number;
  battery?: number;
  ram?: number;
  salePrice?: number;
  warrantyMonths?: number;
}

const P = (id: string, name: string, brand: string, price: number, camera: number | undefined, battery: number | undefined, ram: number | undefined, extra: Partial<FixtureItem> = {}): FixtureItem => ({
  id, name, brand, category: "Mobile Phones", price, via: "spec", ...(camera !== undefined ? { camera } : {}), ...(battery !== undefined ? { battery } : {}), ...(ram !== undefined ? { ram } : {}), ...extra,
});
const L = (id: string, name: string, brand: string, price: number, ram: number, extra: Partial<FixtureItem> = {}): FixtureItem => ({ id, name, brand, category: "Laptops", price, ram, via: "spec", ...extra });
const A = (id: string, name: string, brand: string, price: number, category: FixtureItem["category"] = "Accessories", extra: Partial<FixtureItem> = {}): FixtureItem => ({ id, name, brand, category, price, via: "none", ...extra });

export const RICH: readonly FixtureItem[] = [
  P("ph01", "Lumen P1 Smartphone", "Lumen", 59900, 50, 5000, 6, { warrantyMonths: 12 }),
  P("ph02", "Lumen P2 Pro Smartphone", "Lumen", 94900, 108, 5000, 8, { warrantyMonths: 12 }),
  P("ph03", "Lumen P3 Ultra Smartphone", "Lumen", 189900, 200, 5200, 12, { warrantyMonths: 24 }),
  P("ph04", "Orbit A5 Smartphone", "Orbit", 44900, 13, 5000, 4),
  P("ph05", "Orbit A7 Camera Edition Smartphone", "Orbit", 112000, 108, 4500, 8, { via: "description" }),
  P("ph06", "Zenix Z9 Gamer Smartphone", "Zenix", 139900, 64, 6000, 16, { salePrice: 129900 }),
  P("ph07", "Zenix Z5 Smartphone", "Zenix", 74900, undefined, undefined, undefined, { via: "none" }),
  P("ph08", "Samsung Test A1 Smartphone", "Samsung", 84900, 64, 5000, 8),
  P("ph09", "Samsung Test S2 Smartphone", "Samsung", 169900, 200, 4900, 12),
  P("ph10", "Kite K1 Smartphone", "Kite", 29900, 8, 4000, 3),
  P("ph11", "Kite K0 Smartphone", "Kite", 24900, undefined, undefined, undefined, { via: "none", stock: 0 }),
  L("lp01", "Orbit Book 14 Laptop", "Orbit", 129900, 8),
  L("lp02", "Orbit Book 15 Pro Laptop", "Orbit", 199900, 16),
  L("lp03", "Zenix Vortex G15 Gaming Laptop", "Zenix", 289900, 16),
  L("lp04", "Zenix Vortex G17 Gaming Laptop", "Zenix", 399900, 32),
  L("lp05", "Lumen Air 13 Laptop", "Lumen", 159900, 8),
  L("lp06", "Lumen Dev 16 Laptop", "Lumen", 249900, 32),
  L("lp07", "Kite Study 14 Laptop", "Kite", 99900, 4),
  L("lp08", "Nova Studio 16 Laptop", "Nova", 329900, 32),
  A("ac01", "Volt Charger 20W", "Volt", 3900),
  A("ac02", "Volt USB-C Cable 1m", "Volt", 1500),
  A("ac03", "Glide Tempered Glass", "Glide", 1200),
  A("ac04", "Echo Phone Case", "Echo", 2200),
  A("ac05", "Volt Power Bank 10000", "Volt", 5900),
  A("ac06", "Volt Power Bank 20000", "Volt", 9900),
  A("ac07", "Orbit Earbuds", "Orbit", 7900, "Audio"),
  A("ac08", "Lumen Watch", "Lumen", 24900, "Wearables"),
];

const dec = (n: number) => n.toFixed(2);

function toWire(i: FixtureItem): RawProduct {
  const description =
    i.via === "description" ? `${i.camera}MP main camera, ${i.battery}mAh battery, ${i.ram}GB RAM. Fixture description.` : i.via === "none" || i.category === "Accessories" ? "Fixture item." : undefined;
  return RawProduct.parse({
    id: i.id,
    sku: `SKU-${i.id}`,
    name: i.name,
    brand: i.brand,
    category: i.category,
    price: dec(i.price),
    ...(i.salePrice ? { salePrice: dec(i.salePrice), discountActive: true } : {}),
    ...(description ? { description } : {}),
    ...(i.warrantyMonths ? { warrantyMonths: i.warrantyMonths } : {}),
    hasVariants: false,
    variants: [],
    availability: (i.stock ?? 10) > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    purchasableQuantity: i.stock ?? 10,
    images: [],
    updatedAt: "2026-11-01T08:00:00.000Z",
  });
}

export class RichTransport implements ErpTransport {
  readonly origin = "http://fixture.invalid";
  private down = false;
  setDown(v: boolean) {
    this.down = v;
  }
  async listProducts(): Promise<RawProduct[]> {
    if (this.down) throw new ErpUnavailableError("UNREACHABLE", "The ERP did not answer.");
    return RICH.map(toWire);
  }
  async getProduct(id: string): Promise<RawProduct | null> {
    if (this.down) throw new ErpUnavailableError("UNREACHABLE", "The ERP did not answer.");
    const i = RICH.find((x) => x.id === id);
    return i ? toWire(i) : null;
  }
  async getSettings(): Promise<RawSettings> {
    return { currency: "LKR", ordersEnabled: true, deliveryCharge: "450.00" };
  }
  async getOrder(): Promise<RawOrder | null> {
    return null;
  }
}

/** Staff-entered specification rows for the items whose numbers live there. */
export function richSite(): SiteData {
  const content: SiteData["content"] = {};
  for (const i of RICH) {
    if (i.via !== "spec") continue;
    const specs: { name: string; value: string }[] = [];
    if (i.camera !== undefined) specs.push({ name: "Camera", value: `${i.camera} MP main` });
    if (i.battery !== undefined) specs.push({ name: "Battery", value: `${i.battery} mAh` });
    if (i.ram !== undefined) specs.push({ name: "RAM", value: `${i.ram} GB` });
    if (specs.length) content[i.id] = { specs };
  }
  return { links: [], promotions: [], content, customerOrders: new Map() };
}

export const richPrice = (id: string): number => {
  const i = RICH.find((x) => x.id === id);
  return i ? (i.salePrice ?? i.price) : NaN;
};
export const richById = (id: string): FixtureItem | undefined => RICH.find((x) => x.id === id);
