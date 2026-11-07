import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhook, validSignature } from "@/lib/whatsapp/cloud";
import { toWaDigits } from "@/lib/whatsapp/settings";

describe("WhatsApp Cloud API webhook", () => {
  const secret = "app-secret";
  const raw = JSON.stringify({ hello: "world" });
  const sig = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

  it("accepts only a body signed with the app secret", () => {
    expect(validSignature(raw, sig, secret)).toBe(true);
    expect(validSignature(raw, sig, "other-secret")).toBe(false);
    expect(validSignature(`${raw} `, sig, secret)).toBe(false);
    expect(validSignature(raw, null, secret)).toBe(false);
    expect(validSignature(raw, "sha256=abc", secret)).toBe(false);
  });

  it("reads text messages (with the quoted message id) and delivery updates, ignoring the rest", () => {
    const out = parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "94771234567", id: "wamid.1", type: "text", text: { body: " Hi there " }, context: { id: "wamid.0" } },
                  { from: "94771234567", id: "wamid.2", type: "image" },
                ],
                statuses: [{ id: "wamid.0", status: "delivered" }, { id: "wamid.9", status: "unknown" }],
              },
            },
          ],
        },
      ],
    });
    expect(out.messages).toEqual([{ id: "wamid.1", from: "94771234567", text: "Hi there", quotedId: "wamid.0" }]);
    expect(out.statuses).toEqual([{ id: "wamid.0", status: "DELIVERED" }]);
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
  });

  it("turns a Sri Lankan local number into the international form", () => {
    expect(toWaDigits("077 123 4567")).toBe("94771234567");
    expect(toWaDigits("+94 77 123 4567")).toBe("94771234567");
  });
});
