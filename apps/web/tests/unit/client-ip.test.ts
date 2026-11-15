import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guard } from "@/lib/security/api";
import { canonicalClientKey, clientIp } from "@/lib/security/rate-limit";

/**
 * The client address that keys the website's limiter and is signed to the Agent. It must come only from what OUR reverse proxy sets
 * (x-real-ip, or the LAST x-forwarded-for entry), accept one plain IP, collapse a visitor's whole IPv6 /64 into one key, and never use
 * raw header text as a key. It is only as trustworthy as the proxy: these tests do not (and cannot) prove the app is unreachable around it.
 */
const req = (headers: Record<string, string>) => new Request("http://shop.test/x", { headers });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
});

describe("clientIp: which header wins", () => {
  it("prefers x-real-ip (set by the proxy from the socket) over x-forwarded-for", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.9" }))).toBe("203.0.113.5");
  });

  it("uses a single x-forwarded-for value as is (what nginx sets: the connecting address)", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("takes the LAST x-forwarded-for entry, never the first (the first is whatever the caller sent)", () => {
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.77, 203.0.113.5" }))).toBe("203.0.113.5");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.5" }))).toBe("203.0.113.5");
  });

  it("treats a repeated x-forwarded-for header (joined with a comma by the runtime) like a list: the last value wins", () => {
    const h = new Headers();
    h.append("x-forwarded-for", "198.51.100.77");
    h.append("x-forwarded-for", "203.0.113.5");
    expect(clientIp(new Request("http://shop.test/x", { headers: h }))).toBe("203.0.113.5");
  });

  it("trims padding", () => {
    expect(clientIp(req({ "x-forwarded-for": "  203.0.113.5  " }))).toBe("203.0.113.5");
    expect(clientIp(req({ "x-real-ip": " 203.0.113.5 " }))).toBe("203.0.113.5");
  });

  it("does not fall back to x-forwarded-for when x-real-ip is present but unusable (no way to steer it by adding a header)", () => {
    expect(clientIp(req({ "x-real-ip": "garbage", "x-forwarded-for": "203.0.113.5" }))).toBe("unknown");
  });

  it("rejects a list in x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.5, 198.51.100.1" }))).toBe("unknown");
  });

  it("returns 'unknown' when no proxy header exists", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("clientIp: unusable text never becomes a key", () => {
  const bad = ["", " ", "garbage", "not-an-ip", "203.0.113.5:4321", "203.0.113", "203.0.113.256", "[2001:db8::1]", "[2001:db8::1]:443", "fe80::1%eth0", "1.2.3.4.5", "1e3.0.0.1", "0x7f.0.0.1", "javascript:alert(1)", "203.0.113.5;DROP"];
  for (const v of bad) {
    it(`x-forwarded-for ${JSON.stringify(v)} gives the shared 'unknown' bucket`, () => {
      expect(clientIp(req({ "x-forwarded-for": v }))).toBe("unknown");
    });
  }

  it("a 2000-character value is not used as a key (bounded memory)", () => {
    const v = "9".repeat(2000);
    const k = clientIp(req({ "x-forwarded-for": v }));
    expect(k).toBe("unknown");
    expect(k.length).toBeLessThan(46);
  });

  it("every returned key is short and is either 'unknown' or itself a valid address", () => {
    const inputs = ["1.2.3.4", "::1", "2001:db8::1", "::ffff:1.2.3.4", "x".repeat(500), "1.2.3.4, " + "y".repeat(500)];
    for (const v of inputs) {
      const k = clientIp(req({ "x-forwarded-for": v }));
      expect(k.length).toBeLessThanOrEqual(45);
      expect(k === "unknown" || canonicalClientKey(k) !== null).toBe(true);
    }
  });
});

describe("clientIp: IPv6 and mapped addresses", () => {
  it("keeps an IPv4-mapped IPv6 address as the IPv4 address (so the two forms share one key)", () => {
    expect(clientIp(req({ "x-forwarded-for": "::ffff:203.0.113.5" }))).toBe("203.0.113.5");
    expect(clientIp(req({ "x-forwarded-for": "::FFFF:cb00:7105" }))).toBe("203.0.113.5");
  });

  it("collapses every address of one /64 into one key", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) keys.add(clientIp(req({ "x-forwarded-for": `2001:db8:1:2:${i.toString(16)}:abcd:${(i * 7).toString(16)}:1` })));
    expect([...keys]).toEqual(["2001:db8:1:2::"]);
  });

  it("separates different /64 networks", () => {
    expect(clientIp(req({ "x-forwarded-for": "2001:db8:1:2::1" }))).not.toBe(clientIp(req({ "x-forwarded-for": "2001:db8:1:3::1" })));
  });

  it("normalises compressed, expanded and upper-case spellings of the same /64", () => {
    const forms = ["2001:db8:0:0:0:0:0:1", "2001:DB8::1", "2001:0db8:0000:0000:ffff:ffff:ffff:ffff", "2001:db8::"];
    expect(new Set(forms.map((f) => clientIp(req({ "x-forwarded-for": f })))).size).toBe(1);
  });

  it("the result is itself a valid IPv6 text, so it can be signed to the Agent unchanged", () => {
    const k = clientIp(req({ "x-forwarded-for": "2001:db8:1:2:3:4:5:6" }));
    expect(k).toBe("2001:db8:1:2::");
    expect(canonicalClientKey(k)).toBe("2001:db8:1:2::");
  });

  it("handles '::' and loopback", () => {
    expect(clientIp(req({ "x-forwarded-for": "::1" }))).toBe("0:0:0:0::");
    expect(clientIp(req({ "x-forwarded-for": "::" }))).toBe("0:0:0:0::");
  });
});

describe("clientIp: warnings", () => {
  it("log at most once a minute per reason and never contain the address", () => {
    vi.advanceTimersByTime(61_000); // earlier tests already used this reason's one line for the current minute
    const secret = "198.51.100.200"; // valid-looking text used only inside a bad list
    for (let i = 0; i < 20; i++) clientIp(req({ "x-forwarded-for": `${secret}, nope` }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(secret);
    vi.advanceTimersByTime(61_000);
    clientIp(req({ "x-forwarded-for": "nope" }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("do not log for a good address", () => {
    clientIp(req({ "x-forwarded-for": "203.0.113.5" }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("the limiter built on it", () => {
  it("one IPv6 visitor rotating addresses inside a /64 hits ONE bucket (a per-address key would give 50 buckets)", () => {
    let blocked = 0;
    for (let i = 0; i < 50; i++) {
      const r = guard(new Request("http://shop.test/x", { headers: { "x-forwarded-for": `2001:db8:77:1:${i.toString(16)}::1` } }), { name: "t-v6-rotate", limit: 5, windowMs: 60_000 });
      if (r) blocked++;
    }
    expect(blocked).toBe(45);
  });

  it("a caller cannot pick its own bucket by prepending to x-forwarded-for", () => {
    let blocked = 0;
    for (let i = 0; i < 20; i++) {
      const r = guard(new Request("http://shop.test/x", { headers: { "x-forwarded-for": `10.9.${i}.1, 203.0.113.99` } }), { name: "t-spoof-first", limit: 3, windowMs: 60_000 });
      if (r) blocked++;
    }
    expect(blocked).toBe(17);
  });
});

describe("canonicalClientKey", () => {
  it("rejects null, undefined and oversize input", () => {
    expect(canonicalClientKey(null)).toBeNull();
    expect(canonicalClientKey(undefined)).toBeNull();
    expect(canonicalClientKey("a".repeat(46))).toBeNull();
  });
});
