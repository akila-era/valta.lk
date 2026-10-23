import { describe, expect, it } from "vitest";
import { accessoryAttachment, averageOrderValue } from "../../src/lib/admin/metrics";

describe("averageOrderValue", () => {
  it("divides non-cancelled revenue by the number of those orders", () => {
    expect(averageOrderValue(300, 2)).toBe(150);
  });

  it("stays unset when every order in the period is cancelled or there are none", () => {
    expect(averageOrderValue(0, 0)).toBeNull();
    expect(averageOrderValue(100, 0)).toBeNull();
  });
});

describe("accessoryAttachment", () => {
  const links = [{ sourceItemId: "phone", accessoryItemId: "case" }];

  it("counts only orders that contain a device with an explicit link", () => {
    const result = accessoryAttachment(
      [{ itemIds: ["phone", "case"] }, { itemIds: ["phone"] }, { itemIds: ["watch"] }],
      links,
    );
    expect(result).toEqual({ eligible: 2, attached: 1, rate: 0.5 });
  });

  it("does not invent a rate when no accessory links exist", () => {
    expect(accessoryAttachment([{ itemIds: ["phone", "cable"] }], []).rate).toBeNull();
  });

  it("ignores a product linked to itself", () => {
    expect(accessoryAttachment([{ itemIds: ["phone"] }], [{ sourceItemId: "phone", accessoryItemId: "phone" }]).rate).toBeNull();
  });
});