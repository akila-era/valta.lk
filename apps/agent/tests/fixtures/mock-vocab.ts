import type { Vocabulary } from "../../src/router/types";

/**
 * Vocabulary derived from the MOCK ERP seed (apps/web/tests/mock-erp/server.ts): invented brands, English names only.
 * It proves the pipeline works; it says nothing about real catalogue coverage (blocker B2).
 */
export const itemId = (n: number) => `cm0item${String(n).padStart(8, "0")}`;

export const MOCK_VOCAB: Vocabulary = {
  brands: ["Nova", "Orbit", "Pulse", "Volt", "Glide", "Atlas", "Echo"],
  categories: [
    { slug: "mobile-phones", name: "Mobile Phones" },
    { slug: "audio", name: "Audio" },
    { slug: "accessories", name: "Accessories" },
    { slug: "wearables", name: "Wearables" },
    { slug: "tablets", name: "Tablets" },
  ],
  products: [
    {
      id: itemId(1),
      name: "Nova X1 Smartphone",
      brand: "Nova",
      model: "X1",
      category: "Mobile Phones",
      variants: [
        { key: "128GB::Black", storage: "128GB", color: "Black" },
        { key: "256GB::Black", storage: "256GB", color: "Black" },
        { key: "256GB::Blue", storage: "256GB", color: "Blue" },
      ],
    },
    { id: itemId(2), name: "Orbit Pro Smartphone", brand: "Orbit", category: "Mobile Phones" },
    { id: itemId(3), name: "Pulse Wireless Earbuds", brand: "Pulse", category: "Audio" },
    { id: itemId(4), name: "Pulse Over-Ear Headphones", brand: "Pulse", category: "Audio" },
    { id: itemId(5), name: "Volt 20W Fast Charger", brand: "Volt", category: "Accessories" },
    { id: itemId(6), name: "Volt USB-C Cable 1m", brand: "Volt", category: "Accessories" },
    { id: itemId(7), name: "Glide Tempered Glass", brand: "Glide", category: "Accessories" },
    { id: itemId(8), name: "Atlas Smartwatch", brand: "Atlas", category: "Wearables" },
    { id: itemId(9), name: "Atlas Fitness Band", brand: "Atlas", category: "Wearables" },
    { id: itemId(10), name: "Echo Bluetooth Speaker", brand: "Echo", category: "Audio" },
    { id: itemId(11), name: "Nova Lite Smartphone", brand: "Nova", category: "Mobile Phones" },
    { id: itemId(12), name: "Orbit Tablet 10", brand: "Orbit", category: "Tablets" },
    { id: itemId(13), name: "Limited Case (sold out)", brand: "Glide", category: "Accessories" },
    { id: itemId(14), name: "Volt Power Bank 10000", brand: "Volt", category: "Accessories" },
    { id: itemId(15), name: "Echo Mini Speaker", brand: "Echo", category: "Audio" },
  ],
};
