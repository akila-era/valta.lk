import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { accentize, defaultAccent } from "../../src/components/ui/page-intro";

const html = (title: string, accent?: string | false) => renderToStaticMarkup(accentize(title, accent) as never);
const text = (markup: string) => markup.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");

describe("defaultAccent", () => {
  it("accents the last word, or the last two when the last is very short", () => {
    expect(defaultAccent("All products")).toBe("products");
    expect(defaultAccent("Track your order")).toBe("order");
    expect(defaultAccent("Contact us")).toBe("Contact us");
    expect(defaultAccent("Sign in")).toBe("Sign in");
    expect(defaultAccent("Checkout")).toBe("Checkout");
  });
});

describe("accentize", () => {
  it("wraps only the accent in the serif style and never changes the heading text", () => {
    for (const title of ["All products", "Shopping cart", "Terms & conditions", "Contact us", "Mobile Phones"]) {
      expect(text(html(title))).toBe(title);
    }
    expect(html("All products")).toBe('All <span class="accent-serif text-brand-hover">products</span>');
  });

  it("accents a given phrase, uses its last occurrence, and leaves the title plain when it is absent or disabled", () => {
    expect(html("Search results for “pulse”", "“pulse”")).toContain('<span class="accent-serif text-brand-hover">“pulse”</span>');
    expect(html("Cart cart", "cart")).toBe('Cart <span class="accent-serif text-brand-hover">cart</span>');
    expect(html("Wishlist", "missing")).toBe("Wishlist");
    expect(html("All products", false)).toBe("All products");
  });
});
