import { ErpUnavailableError, type ErpTransport } from "../backend/transport";
import { RawProduct, type RawOrder, type RawSettings } from "../backend/wire";

/**
 * MOCK ERP DATA (M1 only). In-memory products in the same WIRE FORMAT the repo's mock ERP serves (apps/web/tests/mock-erp/server.ts):
 * invented brands, decimal-string money, availability strings, variants, one sale, one sold-out item. Nothing here is real, and
 * this folder must never be imported by production wiring (a test enforces that main.ts does not import it).
 */
export const itemId = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

interface Variant {
  key: string;
  storage: string;
  color: string;
  sku: string;
  price: string;
  stock: number;
}
interface Item {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  subCategory?: string;
  model?: string;
  price: string;
  salePrice: string | null;
  discountActive: boolean;
  stock: number;
  variants: Variant[];
  description?: string;
  warrantyMonths?: number;
  warrantyNote?: string;
  updatedAt: string;
}

const mk = (n: number, name: string, category: string, brand: string, price: number, extra: Partial<Item> = {}): Item => ({
  id: itemId(n),
  sku: `SKU-${n}`,
  name,
  brand,
  category,
  price: price.toFixed(2),
  salePrice: null,
  discountActive: false,
  stock: 20,
  variants: [],
  updatedAt: `2026-10-${String(10 + (n % 9)).padStart(2, "0")}T08:00:00.000Z`,
  ...extra,
});

const initialItems = (): Item[] => [
  mk(1, "Nova X1 Smartphone", "Mobile Phones", "Nova", 129900, {
    model: "X1",
    variants: [
      { key: "128GB::Black", storage: "128GB", color: "Black", sku: "NX1-128-BK", price: "129900.00", stock: 5 },
      { key: "256GB::Black", storage: "256GB", color: "Black", sku: "NX1-256-BK", price: "149900.00", stock: 5 },
      { key: "256GB::Blue", storage: "256GB", color: "Blue", sku: "NX1-256-BL", price: "149900.00", stock: 0 },
    ],
  }),
  mk(2, "Orbit Pro Smartphone", "Mobile Phones", "Orbit", 219900, { salePrice: "199900.00", discountActive: true }),
  mk(3, "Pulse Wireless Earbuds", "Audio", "Pulse", 14900, { subCategory: "Earbuds" }),
  mk(4, "Pulse Over-Ear Headphones", "Audio", "Pulse", 24900, { subCategory: "Headphones" }),
  mk(5, "Volt 20W Fast Charger", "Accessories", "Volt", 3900, { subCategory: "Chargers" }),
  mk(6, "Volt USB-C Cable 1m", "Accessories", "Volt", 1500, { subCategory: "Cables" }),
  mk(7, "Glide Tempered Glass", "Accessories", "Glide", 990),
  mk(8, "Atlas Smartwatch", "Wearables", "Atlas", 34900),
  mk(9, "Atlas Fitness Band", "Wearables", "Atlas", 8900),
  mk(10, "Echo Bluetooth Speaker", "Audio", "Echo", 11900, { subCategory: "Speakers" }),
  mk(11, "Nova Lite Smartphone", "Mobile Phones", "Nova", 64900),
  mk(12, "Orbit Tablet 10", "Tablets", "Orbit", 89900),
  mk(13, "Limited Case (sold out)", "Accessories", "Glide", 2500, { stock: 0 }),
  mk(14, "Volt Power Bank 10000", "Accessories", "Volt", 7900, { subCategory: "Power Banks" }),
  mk(15, "Echo Mini Speaker", "Audio", "Echo", 5900, { subCategory: "Speakers" }),
  // Added in M1-C: the rest of the planned catalogue. These exist only in this fixture (the repo's mock ERP server seeds the first 15).
  mk(16, "Zen Book 14 Laptop", "Laptops", "Zen", 289900, { warrantyMonths: 24, warrantyNote: "Mock warranty record" }),
  mk(17, "Zen Book 16 Pro Laptop", "Laptops", "Zen", 459900, { warrantyMonths: 24, stock: 3 }),
  mk(18, "Orbit Tablet 11 Plus", "Tablets", "Orbit", 129900, { warrantyMonths: 12 }),
  mk(19, "Pulse ANC Earbuds", "Audio", "Pulse", 22900, { subCategory: "Earbuds", warrantyMonths: 12 }),
  mk(20, "Glide Clear Case for Nova X1", "Accessories", "Glide", 1900, { subCategory: "Cases" }),
  mk(21, "Glide Screen Protector Tablet 11", "Accessories", "Glide", 1400, { subCategory: "Screen Protectors" }),
  mk(22, "Volt 65W Laptop Charger", "Accessories", "Volt", 8900, { subCategory: "Chargers", warrantyMonths: 6 }),
  mk(23, "Keyra Wireless Mouse", "Computer Accessories", "Keyra", 3200, { subCategory: "Mice", warrantyMonths: 12 }),
  mk(24, "Keyra Mechanical Keyboard", "Computer Accessories", "Keyra", 9800, { subCategory: "Keyboards", warrantyMonths: 12 }),
  mk(25, "Keyra USB-C Hub 7-in-1", "Computer Accessories", "Keyra", 6900, { subCategory: "Hubs" }),
];

const avail = (stock: number) => (stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK");
const qty = (stock: number) => Math.min(stock, 20);

function toWire(i: Item): RawProduct {
  const totalStock = i.variants.length ? i.variants.reduce((a, v) => a + v.stock, 0) : i.stock;
  const price = i.variants.length ? i.variants.map((v) => Number(v.price)).reduce((a, b) => Math.min(a, b)).toFixed(2) : i.price;
  return RawProduct.parse({
    id: i.id,
    sku: i.sku,
    name: i.name,
    description: i.description ?? `${i.name} by ${i.brand}.`,
    brand: i.brand,
    category: i.category,
    subCategory: i.subCategory ?? null,
    model: i.model ?? null,
    condition: null,
    warrantyMonths: i.warrantyMonths ?? null,
    warrantyNote: i.warrantyNote ?? null,
    images: i.sku === "SKU-6" || i.sku === "SKU-7" ? [] : [{ url: `/uploads/${i.id}.svg`, relative: true }],
    price,
    salePrice: i.salePrice,
    discountActive: i.discountActive,
    hasVariants: i.variants.length > 0,
    variants: i.variants.map((v) => ({ key: v.key, sku: v.sku, storage: v.storage, color: v.color, price: v.price, salePrice: null, discountActive: false, availability: avail(v.stock), purchasableQuantity: qty(v.stock) })),
    availability: avail(totalStock),
    purchasableQuantity: qty(totalStock),
    publishedAt: `2026-0${1 + (Number(i.id.slice(-2)) % 8)}-15T08:00:00.000Z`,
    updatedAt: i.updatedAt,
  });
}

export const MOCK_ORDER_REFS = {
  cust1Placed: "VLK-261012-ABCDEFGHJK",
  cust1Dispatched: "VLK-261001-KMNPRSTVWX",
  cust2Placed: "VLK-261005-23456789AB",
} as const;

function seedOrders(): Map<string, RawOrder> {
  const order = (ref: string, status: RawOrder["status"], lines: { itemId: string; variantKey: string | null; quantity: number; unitPrice: string }[], extra: Partial<RawOrder> = {}): RawOrder => {
    const sub = lines.reduce((s, l) => s + Math.round(Number(l.unitPrice) * 100) * l.quantity, 0);
    return {
      externalRef: ref,
      status,
      currency: "LKR",
      paymentMethod: "COD",
      paymentStatus: status === "DELIVERED" ? "COD_COLLECTED" : "COD_PENDING",
      lines,
      deliveryCharge: "450.00",
      total: ((sub + 45000) / 100).toFixed(2),
      trackingNumber: null,
      carrierName: null,
      ...extra,
    };
  };
  const list = [
    order(MOCK_ORDER_REFS.cust1Placed, "PLACED", [{ itemId: itemId(3), variantKey: null, quantity: 2, unitPrice: "14900.00" }]),
    order(MOCK_ORDER_REFS.cust1Dispatched, "DISPATCHED", [{ itemId: itemId(2), variantKey: null, quantity: 1, unitPrice: "199900.00" }], { trackingNumber: "TRK-0001", carrierName: "Mock Courier" }),
    order(MOCK_ORDER_REFS.cust2Placed, "PLACED", [{ itemId: itemId(8), variantKey: null, quantity: 1, unitPrice: "34900.00" }]),
  ];
  return new Map(list.map((o) => [o.externalRef, o]));
}

/** An in-memory ERP with the same read API as the HTTP transport, plus controls to change prices and stock or to simulate an outage. */
export class FixtureErpTransport implements ErpTransport {
  readonly origin = "http://mock-erp.local";
  private items = initialItems();
  private settings: RawSettings = { currency: "LKR", ordersEnabled: true, deliveryCharge: "450.00" };
  private orders = seedOrders();
  private down = false;
  calls = { list: 0, product: 0, settings: 0, order: 0 };

  private check(): void {
    if (this.down) throw new ErpUnavailableError("UNREACHABLE", "The ERP did not answer.");
  }

  async listProducts(): Promise<RawProduct[]> {
    this.check();
    this.calls.list++;
    return this.items.map(toWire);
  }
  async getProduct(id: string): Promise<RawProduct | null> {
    this.check();
    this.calls.product++;
    const it = this.items.find((i) => i.id === id);
    return it ? toWire(it) : null;
  }
  async getSettings(): Promise<RawSettings> {
    this.check();
    this.calls.settings++;
    return this.settings;
  }
  async getOrder(ref: string): Promise<RawOrder | null> {
    this.check();
    this.calls.order++;
    return this.orders.get(ref) ?? null;
  }

  // ---- controls (tests and the playground) ----
  setDown(down: boolean): void {
    this.down = down;
  }
  setPrice(id: string, price: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) it.price = price;
  }
  setStock(id: string, stock: number, variantKey?: string): void {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    const v = variantKey ? it.variants.find((x) => x.key === variantKey) : undefined;
    if (v) v.stock = stock;
    else it.stock = stock;
  }
  /** The real mock ERP seed has no warranty data; tests add it here to check that warranty is shown only when the ERP provides it. */
  setWarranty(id: string, months: number, note?: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) {
      it.warrantyMonths = months;
      if (note) it.warrantyNote = note;
    }
  }
  /** Lets tests put hostile text into catalogue fields, as a compromised or careless back office could. */
  setName(id: string, name: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) it.name = name;
  }
  setDescription(id: string, description: string): void {
    const it = this.items.find((i) => i.id === id);
    if (it) it.description = description;
  }
  setSettings(patch: Partial<RawSettings>): void {
    this.settings = { ...this.settings, ...patch };
  }
  removeItem(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
  }
  setOrderStatus(ref: string, status: RawOrder["status"]): void {
    const o = this.orders.get(ref);
    if (o) o.status = status;
  }
}
