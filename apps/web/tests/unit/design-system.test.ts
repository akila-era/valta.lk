import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

/* The storefront tokens in globals.css (@theme), checked against WCAG 2.2 contrast minimums. */
const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");
const theme = css.slice(css.indexOf("@theme {"), css.indexOf("\n}", css.indexOf("@theme {")));
const token = (name: string) => {
  const m = theme.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i"));
  if (!m) throw new Error(`token --color-${name} not found`);
  return m[1];
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("design system tokens", () => {
  it("keeps dark text readable on the orange fills, at rest and on hover", () => {
    expect(token("brand-500").toLowerCase()).toBe("#ff5c00");
    expect(contrast("on-brand", "brand-500")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("on-brand", "brand-hover")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps body, muted and text-safe orange text at 4.5:1 on every light surface", () => {
    for (const surface of ["bg", "surface", "brand-50"]) {
      expect(contrast("ink", surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("muted", surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("brand-600", surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("outlines form controls at 3:1 and keeps status colours readable", () => {
    expect(contrast("border-strong", "bg")).toBeGreaterThanOrEqual(3);
    expect(contrast("border-strong", "surface")).toBeGreaterThanOrEqual(3);
    for (const [text, bg] of [["success", "success-bg"], ["warn", "warn-bg"], ["info", "info-bg"], ["danger", "danger-bg"]]) {
      expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("styles the primary button with dark text, a deeper hover and no glow, and inputs with the strong outline", () => {
    const rule = (name: string) => css.match(new RegExp(`@utility ${name} \\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule("btn-primary")).toContain("text-on-brand");
    expect(rule("btn-primary")).toContain("hover:bg-brand-hover");
    expect(rule("btn-primary")).not.toContain("shadow-glow");
    expect(rule("input")).toContain("border-border-strong");
    expect(rule("btn")).toContain("min-h-11");
  });

  it("gives the admin console the storefront brand and on-brand text while keeping its status colours", () => {
    const start = css.indexOf("\n.admin-theme {");
    const admin = css.slice(start, css.indexOf("\n}", start));
    expect(admin).not.toMatch(/--color-(brand-\d+|on-brand|ink|muted):/);
    // the storefront's orange-tinted surface and warm hairlines stay out of the console: it keeps neutral greys
    expect(admin).toContain("--color-surface: #f5f6f7;");
    expect(admin).toContain("--color-border: #e6e8eb;");
    expect(css).not.toMatch(/\.admin-theme [^{]*\{\s*color:\s*#fff/);
    for (const name of ["danger", "danger-bg", "success", "success-bg", "warn", "warn-bg", "info", "info-bg"]) {
      expect(admin).toContain(`--color-${name}: ${token(name)};`);
    }
  });
});
