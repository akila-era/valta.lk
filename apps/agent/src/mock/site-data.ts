import { itemId, MOCK_ORDER_REFS } from "./erp-fixture";

/**
 * MOCK website-owned data (M1 only). In the real site this lives in the website database: explicit accessory links staff made,
 * admin promotions, product content (specifications), and which customer placed which order. Nothing here is inferred.
 */
import type { SiteData } from "../backend/site";

export function createMockSiteData(): SiteData {
  return {
    links: [
      { sourceItemId: itemId(1), sourceVariantKey: "", accessoryItemId: itemId(5), kind: "CHARGER" },
      { sourceItemId: itemId(1), sourceVariantKey: "", accessoryItemId: itemId(6), kind: "CABLE" },
      { sourceItemId: itemId(1), sourceVariantKey: "256GB::Black", accessoryItemId: itemId(7), kind: "SCREEN_PROTECTOR" },
      { sourceItemId: itemId(1), sourceVariantKey: "", accessoryItemId: itemId(13), kind: "BACK_COVER" }, // sold out: never offered
      { sourceItemId: itemId(2), sourceVariantKey: "", accessoryItemId: itemId(5), kind: "CHARGER" },
      { sourceItemId: itemId(11), sourceVariantKey: "", accessoryItemId: itemId(7), kind: "SCREEN_PROTECTOR" },
      { sourceItemId: itemId(18), sourceVariantKey: "", accessoryItemId: itemId(21), kind: "SCREEN_PROTECTOR" },
      { sourceItemId: itemId(16), sourceVariantKey: "", accessoryItemId: itemId(22), kind: "CHARGER" },
      { sourceItemId: itemId(16), sourceVariantKey: "", accessoryItemId: itemId(23), kind: "OTHER" },
      { sourceItemId: itemId(16), sourceVariantKey: "", accessoryItemId: itemId(25), kind: "OTHER" },
      { sourceItemId: itemId(17), sourceVariantKey: "", accessoryItemId: itemId(22), kind: "CHARGER" },
    ],
    promotions: [
      { name: "Launch offer", productIds: [itemId(2)], customerOnly: false, active: true },
      { name: "Members only deal", productIds: [itemId(2)], customerOnly: true, active: true },
      { name: "Expired offer", productIds: [itemId(3)], customerOnly: false, active: false },
    ],
    content: {
      [itemId(1)]: { specs: [{ name: "Display", value: "6.7-inch AMOLED" }, { name: "Battery", value: "5000 mAh" }] },
      [itemId(2)]: { specs: [{ name: "Display", value: "6.8-inch AMOLED" }, { name: "Battery", value: "5500 mAh" }] },
      [itemId(16)]: { specs: [{ name: "Display", value: "14-inch IPS" }, { name: "Memory", value: "16 GB" }, { name: "Storage", value: "512 GB SSD" }] },
      [itemId(17)]: { specs: [{ name: "Display", value: "16-inch OLED" }, { name: "Memory", value: "32 GB" }, { name: "Storage", value: "1 TB SSD" }] },
      [itemId(18)]: { specs: [{ name: "Display", value: "11-inch IPS" }, { name: "Storage", value: "128 GB" }] },
      [itemId(19)]: { specs: [{ name: "Battery life", value: "Up to 28 hours with case" }] },
      [itemId(8)]: { specs: [{ name: "Display", value: "1.4-inch AMOLED" }, { name: "Battery life", value: "Up to 7 days" }] },
    },
    customerOrders: new Map([
      ["cust_1", [MOCK_ORDER_REFS.cust1Placed, MOCK_ORDER_REFS.cust1Dispatched]],
      ["cust_2", [MOCK_ORDER_REFS.cust2Placed]],
    ]),
  };
}
