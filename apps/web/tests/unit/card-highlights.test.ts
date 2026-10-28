import { describe, expect, it } from "vitest";
import { cardHighlights } from "@/components/products/compact-product-card";
import type { ErpProduct } from "@/lib/erp/types";

const product = (over: Partial<ErpProduct>) => ({ specs: {}, ...over }) as unknown as ErpProduct;
const spec = (name: string, value: string, unit = "") => ({ group: "", name, value, unit });

describe("product card key details", () => {
  it("shows up to three of the specifications staff entered, value with its unit", () => {
    const p = product({
      content: { specs: [spec("Capacity", "5000", "mAh"), spec("Wireless", "7.5", "W"), spec("Wired", "15", "W"), spec("Weight", "120", "g")] } as never,
    });
    expect(cardHighlights(p)).toEqual([
      { value: "5000 mAh", name: "Capacity" },
      { value: "7.5 W", name: "Wireless" },
      { value: "15 W", name: "Wired" },
    ]);
  });

  it("falls back to the ERP specifications, leaving out brand, model and values too long for the card", () => {
    const p = product({ specs: { Brand: "Pulse", Model: "PB561", Battery: "30 h", Connectivity: "Bluetooth 5.3 with multipoint" } });
    expect(cardHighlights(p)).toEqual([{ value: "30 h", name: "Battery" }]);
  });

  it("shows nothing when there are no specifications", () => {
    expect(cardHighlights(product({}))).toEqual([]);
  });
});
