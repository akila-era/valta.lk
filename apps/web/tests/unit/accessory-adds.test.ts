import { describe, expect, it } from "vitest";
import { planAccessoryAdds } from "../../src/lib/accessories/add";

const item = (productId: string, canAdd = true) => ({ productId, variantKey: "", canAdd, title: productId });

describe("planAccessoryAdds", () => {
  it("adds every selected accessory that is not already in the cart", () => {
    const plan = planAccessoryAdds([item("cover"), item("cable")], [{ productId: "phone", variantKey: "" }]);
    expect(plan.add.map((x) => x.productId)).toEqual(["cover", "cable"]);
    expect(plan.already).toEqual([]);
  });

  it("does not raise the quantity of an accessory already in the cart", () => {
    const plan = planAccessoryAdds([item("cover"), item("cable")], [{ productId: "cover", variantKey: "" }]);
    expect(plan.add.map((x) => x.productId)).toEqual(["cable"]);
    expect(plan.already.map((x) => x.productId)).toEqual(["cover"]);
  });

  it("skips accessories that still need a variant and ignores a repeated tick", () => {
    const plan = planAccessoryAdds([item("cover", false), item("cable"), item("cable")], []);
    expect(plan.add.map((x) => x.productId)).toEqual(["cable"]);
  });
});