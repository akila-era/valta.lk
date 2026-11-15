import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { agentClientAddress, UNIDENTIFIED_CLIENT_ADDRESS } from "@/lib/assistant/client-address";

const req = (h: Record<string, string>) => new Request("http://shop.test/api/assistant/chat", { headers: h });

describe("agentClientAddress", () => {
  it("returns the proxy's address for a normal request", () => {
    expect(agentClientAddress(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("uses one reserved documentation address (never 0.0.0.0, never raw header text) when no usable address exists", () => {
    expect(UNIDENTIFIED_CLIENT_ADDRESS).toBe("192.0.2.1");
    for (const h of [{} as Record<string, string>, { "x-forwarded-for": "not-an-ip" }, { "x-forwarded-for": "a".repeat(2000) }, { "x-real-ip": "1.2.3.4, 5.6.7.8" }]) {
      expect(agentClientAddress(req(h))).toBe("192.0.2.1");
    }
  });
  it("maps an IPv6 visitor to the /64 network (via the hardened clientIp)", () => {
    expect(agentClientAddress(req({ "x-real-ip": "2001:db8:1:2:3:4:5:6" }))).toBe("2001:db8:1:2::");
  });
});
