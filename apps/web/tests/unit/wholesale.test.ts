import { describe, expect, it } from "vitest";
import { applicationSchema, readApplication } from "@/lib/wholesale";

const ok = { name: "Nimal Perera", email: "Nimal@Shop.LK", phone: "0771234567", business: "Nimal Mobile Shop" };

describe("wholesale application", () => {
  it("accepts a normal registration and lower-cases the email", () => {
    const r = applicationSchema.safeParse({ ...ok, type: "Retail shop", district: "Colombo", message: "Phones and chargers, 50 a month" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("nimal@shop.lk");
  });

  it.each([
    [{ ...ok, name: "N" }],
    [{ ...ok, email: "not-an-email" }],
    [{ ...ok, phone: "abc" }],
    [{ ...ok, phone: "12" }],
    [{ ...ok, business: "" }],
    [{ ...ok, type: "Spy" }],
    [{ ...ok, message: "x".repeat(1001) }],
  ])("rejects %j", (input) => {
    expect(applicationSchema.safeParse(input).success).toBe(false);
  });

  it("reads a stored row back, defaulting an unknown status to new", () => {
    const text = JSON.stringify({ name: ok.name, email: "nimal@shop.lk", phone: ok.phone });
    expect(readApplication({ headline: ok.business, text, href: "contacted" })?.status).toBe("contacted");
    expect(readApplication({ headline: ok.business, text, href: "bogus" })?.status).toBe("new");
    expect(readApplication({ headline: ok.business, text: "not json", href: "new" })).toBeNull();
  });
});
