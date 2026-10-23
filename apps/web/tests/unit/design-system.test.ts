import { describe, expect, it } from "vitest";
import { BUTTON_CLASS, buttonClass } from "@/components/ui/button";

describe("design system buttons", () => {
  it("keeps primary orange, outline, text, and destructive variants distinct", () => {
    expect(buttonClass("primary")).toBe(BUTTON_CLASS.primary);
    expect(buttonClass("secondary")).toBe("btn-secondary");
    expect(buttonClass("outline")).toBe("btn-outline");
    expect(buttonClass("text")).toBe("btn-text");
    expect(buttonClass("danger", "w-full")).toBe("btn-danger w-full");
    expect(new Set(Object.values(BUTTON_CLASS)).size).toBe(Object.values(BUTTON_CLASS).length);
  });
});
