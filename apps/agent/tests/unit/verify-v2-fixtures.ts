import type { ToolEvidence, VerifyV2Input } from "../../src/verify/v2";

/** Invented store data for the v2 verifier tests (never real products or prices). Prices are in minor units (cents). */
export const LUMEN: ToolEvidence = {
  tool: "search_products",
  kind: "product",
  productId: "p1",
  productName: "Lumen P1 128GB Black",
  brand: "Lumen",
  category: "Mobile Phones",
  url: "https://valta.hexalyte.com/products/lumen-p1",
  priceMinor: 12_000_000, // Rs. 120,000.00
  effectivePriceMinor: 11_000_000, // Rs. 110,000.00
  stock: { status: "in_stock", quantity: 5 },
  specs: [
    { field: "ram", value: 8, unit: "gb" },
    { field: "storage", value: 128, unit: "gb" },
    { field: "battery", value: 5000, unit: "mah" },
    { field: "camera", value: 50, unit: "mp" },
    { field: "display", value: 6.7, unit: "inch" },
    { field: "processor", text: "Snapdragon 8 Gen 2" },
  ],
};

export const ORBIT: ToolEvidence = {
  tool: "search_products",
  kind: "product",
  productId: "p2",
  productName: "Orbit A7 Camera Edition",
  brand: "Orbit",
  category: "Mobile Phones",
  priceMinor: 8_500_000, // Rs. 85,000.00
  stock: { status: "out_of_stock" },
  specs: [
    { field: "ram", value: 6, unit: "gb" },
    { field: "storage", value: 128, unit: "gb" },
    { field: "battery", value: 4500, unit: "mah" },
    { field: "camera", value: 64, unit: "mp" },
  ],
};

export const GALAXY: ToolEvidence = {
  tool: "search_products",
  kind: "product",
  productId: "p3",
  productName: "Samsung Galaxy A55",
  brand: "Samsung",
  category: "Mobile Phones",
  priceMinor: 9_500_000, // Rs. 95,000.00
  stock: { status: "in_stock", quantity: 12 },
  specs: [
    { field: "ram", value: 8, unit: "gb" },
    { field: "storage", value: 256, unit: "gb" },
    { field: "battery", value: 5000, unit: "mah" },
    { field: "processor", text: "Exynos 1480" },
  ],
};

export const NOSPEC: ToolEvidence = { tool: "search_products", kind: "product", productId: "p4", productName: "Vega Z2", brand: "Vega", priceMinor: 5_000_000, stock: { status: "unknown" } };

export const CALC_15_OF_2400: ToolEvidence = { tool: "calculate", kind: "calculation", calculation: { result: 360, expression: "15% of 2400" } };

export const SRC_URL = "https://developer.android.com/about/versions/16";
export const SRC_ANDROID: ToolEvidence = {
  tool: "web_search",
  kind: "search_source",
  source: { url: SRC_URL, title: "Android 16 release notes", fetchedAt: "2026-11-14T00:00:00Z" },
  excerpt: "Android version 16.2 was released on 2026-03-02 and is the current stable release for supported Pixel devices.",
};

export function input(over: Partial<VerifyV2Input> & { answerText: string }): VerifyV2Input {
  return {
    language: "en",
    toolEvidence: [],
    sourcesFetchedThisTurn: [],
    searchPerformed: false,
    userMessage: "",
    ...over,
  };
}

export const codes = (r: { issues: { code: string }[] }): string[] => r.issues.map((i) => i.code);
export const has = (r: { issues: { code: string }[] }, code: string): boolean => r.issues.some((i) => i.code === code);
