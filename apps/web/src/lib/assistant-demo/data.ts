/**
 * DEMO DATA for the local assistant demo. Invented products, built into the page, never fetched and never live VOLTA.LK inventory.
 * It mirrors a slice of the Agent's mock catalogue (apps/agent/src/mock) so the cards look like what the assistant will return,
 * but nothing here talks to the Agent, the ERP, the database or the real storefront cart.
 */
export interface DemoProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  /** Rupees. */
  price: number;
  salePrice?: number;
  inStock: boolean;
  warrantyMonths?: number;
  specs: { name: string; value: string }[];
}

export interface DemoAccessoryLink {
  forId: string;
  accessoryId: string;
  kind: "CHARGER" | "CABLE" | "SCREEN_PROTECTOR" | "BACK_COVER" | "OTHER";
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  { id: "demo-nova-x1", name: "Nova X1 Smartphone", brand: "Nova", category: "Mobile Phones", price: 129900, inStock: true, specs: [{ name: "Display", value: "6.7-inch AMOLED" }, { name: "Battery", value: "5000 mAh" }] },
  { id: "demo-orbit-pro", name: "Orbit Pro Smartphone", brand: "Orbit", category: "Mobile Phones", price: 219900, salePrice: 199900, inStock: true, specs: [{ name: "Display", value: "6.8-inch AMOLED" }, { name: "Battery", value: "5500 mAh" }] },
  { id: "demo-atlas-watch", name: "Atlas Smartwatch", brand: "Atlas", category: "Wearables", price: 34900, inStock: true, specs: [{ name: "Display", value: "1.4-inch AMOLED" }, { name: "Battery life", value: "Up to 7 days" }] },
  { id: "demo-zen-14", name: "Zen Book 14 Laptop", brand: "Zen", category: "Laptops", price: 289900, inStock: true, warrantyMonths: 24, specs: [{ name: "Display", value: "14-inch IPS" }, { name: "Memory", value: "16 GB" }, { name: "Storage", value: "512 GB SSD" }] },
  { id: "demo-orbit-tab", name: "Orbit Tablet 11 Plus", brand: "Orbit", category: "Tablets", price: 129900, inStock: true, warrantyMonths: 12, specs: [{ name: "Display", value: "11-inch IPS" }, { name: "Storage", value: "128 GB" }] },
  { id: "demo-pulse-anc", name: "Pulse ANC Earbuds", brand: "Pulse", category: "Audio", price: 22900, inStock: true, warrantyMonths: 12, specs: [{ name: "Battery life", value: "Up to 28 hours with case" }] },
  { id: "demo-echo-speaker", name: "Echo Bluetooth Speaker", brand: "Echo", category: "Audio", price: 11900, inStock: false, specs: [] },
  { id: "demo-volt-20w", name: "Volt 20W Fast Charger", brand: "Volt", category: "Accessories", price: 3900, inStock: true, specs: [] },
  { id: "demo-volt-65w", name: "Volt 65W Laptop Charger", brand: "Volt", category: "Accessories", price: 8900, inStock: true, warrantyMonths: 6, specs: [] },
  { id: "demo-keyra-mouse", name: "Keyra Wireless Mouse", brand: "Keyra", category: "Computer Accessories", price: 3200, inStock: true, warrantyMonths: 12, specs: [] },
  { id: "demo-keyra-hub", name: "Keyra USB-C Hub 7-in-1", brand: "Keyra", category: "Computer Accessories", price: 6900, inStock: true, specs: [] },
];

/** Explicit compatibility links only: nothing is suggested because it "seems" to fit. */
export const DEMO_LINKS: DemoAccessoryLink[] = [
  { forId: "demo-nova-x1", accessoryId: "demo-volt-20w", kind: "CHARGER" },
  { forId: "demo-zen-14", accessoryId: "demo-volt-65w", kind: "CHARGER" },
  { forId: "demo-zen-14", accessoryId: "demo-keyra-mouse", kind: "OTHER" },
  { forId: "demo-zen-14", accessoryId: "demo-keyra-hub", kind: "OTHER" },
];

export const DEMO_CATEGORIES = [...new Set(DEMO_PRODUCTS.map((p) => p.category))];
