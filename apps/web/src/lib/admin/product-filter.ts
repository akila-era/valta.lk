import type { ErpProduct } from "../erp/types";
import { isLow, isOut } from "./stats";

export interface ProductFilters {
  q?: string;
  category?: string;
  brand?: string;
  stock?: string;
}

/** The admin product list's filters, shared by the page and the CSV export so both always agree. */
export function filterProducts(products: ErpProduct[], f: ProductFilters): ErpProduct[] {
  const needle = f.q?.trim().slice(0, 60).toLowerCase();
  return products
    .filter((p) => {
      if (f.category && p.category?.slug !== f.category) return false;
      if (f.brand && p.brand !== f.brand) return false;
      if (f.stock === "low" && !isLow(p)) return false;
      if (f.stock === "out" && !isOut(p)) return false;
      if (f.stock === "in" && (isOut(p) || isLow(p))) return false;
      if (needle && ![p.name, p.sku, p.id, p.brand, p.category?.name, ...p.variants.map((v) => v.sku)].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** CSV cell safe for spreadsheets: quotes escaped, and values that start like a formula are neutralised. */
export const csvCell = (v: string | number | null | undefined) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
