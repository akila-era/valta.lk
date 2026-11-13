import { describe, expect, it } from "vitest";
import { checkRedirect, checkSubresource, checkUrl, createPolicy, isBlockedAddress, productionPolicy, resolvePublicAddresses } from "../../src/security/url-policy";

const prod = productionPolicy();
const reason = (u: string) => {
  const r = checkUrl(u, prod);
  return r.ok ? "ok" : r.reason;
};

describe("production allowlist: exact hostname valta.hexalyte.com only", () => {
  it("allows the exact host over https, with paths, queries and fragments", () => {
    for (const u of ["https://valta.hexalyte.com", "https://valta.hexalyte.com/", "https://valta.hexalyte.com/products/phone-1?x=1#top", "https://VALTA.HEXALYTE.COM/warranty-policy", "https://valta.hexalyte.com:443/faqs"]) {
      expect(reason(u), u).toBe("ok");
    }
  });

  it.each([
    ["https://hexalyte.com/", "host_not_allowed"],
    ["https://www.valta.hexalyte.com/", "host_not_allowed"],
    ["https://admin.valta.hexalyte.com/", "host_not_allowed"],
    ["https://valta.hexalyte.com.evil.example/", "host_not_allowed"],
    ["https://evilvalta.hexalyte.com/", "host_not_allowed"],
    ["https://valta.hexalyte.com./", "host_not_allowed"],
    ["https://google.com/search?q=phone", "host_not_allowed"],
    ["https://www.bing.com/", "host_not_allowed"],
    ["https://xn--valta-hexalyte-x0c.com/", "host_not_allowed"],
    ["https://vаlta.hexalyte.com/", "host_not_allowed"], // Cyrillic "а"
  ])("refuses look-alike or other host %s", (u, why) => expect(reason(u)).toBe(why));

  it.each([
    ["http://valta.hexalyte.com/", "scheme_not_allowed"],
    ["ftp://valta.hexalyte.com/", "scheme_not_allowed"],
    ["javascript:alert(1)", "scheme_not_allowed"],
    ["file:///etc/passwd", "scheme_not_allowed"],
    ["data:text/html,<script>1</script>", "scheme_not_allowed"],
    ["blob:https://valta.hexalyte.com/x", "scheme_not_allowed"],
    ["https://valta.hexalyte.com:8443/", "port_not_allowed"],
    ["https://valta.hexalyte.com:80/", "port_not_allowed"],
    ["https://user:pass@valta.hexalyte.com/", "credentials_in_url"],
    ["https://valta.hexalyte.com@evil.example/", "credentials_in_url"],
    ["https://evil.example\\@valta.hexalyte.com/", "control_characters"],
    ["https://valta.hexalyte.com/ x", "control_characters"],
    ["https://valta.hexalyte.com/\nx", "control_characters"],
    ["not a url", "control_characters"],
    ["", "not_a_url"],
    ["//valta.hexalyte.com/", "not_a_url"],
  ])("refuses %j", (u, why) => expect(reason(u)).toBe(why));

  it("refuses very long input", () => expect(reason(`https://valta.hexalyte.com/${"a".repeat(3000)}`)).toBe("too_long"));

  it("blocks the API, admin, checkout and order-confirmation paths, including case and traversal tricks", () => {
    for (const u of ["https://valta.hexalyte.com/api/store/orders", "https://valta.hexalyte.com/API/x", "https://valta.hexalyte.com/admin", "https://valta.hexalyte.com/admin/login", "https://valta.hexalyte.com/checkout", "https://valta.hexalyte.com/order-confirmation/ABC", "https://valta.hexalyte.com/products/../api/x", "https://valta.hexalyte.com/%61pi/x", "https://valta.hexalyte.com/./admin", "https://valta.hexalyte.com/%2561pi/x", "https://valta.hexalyte.com/%2e%2e/admin", "https://valta.hexalyte.com//admin", "https://valta.hexalyte.com/products/%2e%2e%2fapi", "https://valta.hexalyte.com/%E0%A4%A"]) {
      expect(reason(u), u).toBe("path_not_allowed");
    }
    expect(reason("https://valta.hexalyte.com/apixyz")).toBe("ok"); // a different word, not the /api tree
  });
});

describe("IP literals and internal destinations are refused in every spelling", () => {
  it.each([
    "https://127.0.0.1/",
    "https://localhost/",
    "https://0.0.0.0/",
    "https://10.0.0.5/",
    "https://172.16.0.1/",
    "https://192.168.1.1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://2130706433/", // decimal 127.0.0.1
    "https://0x7f000001/", // hex
    "https://0177.0.0.1/", // octal
    "https://127.1/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[fd00:ec2::254]/",
    "https://[fe80::1]/",
    "https://8.8.8.8/",
    "https://metadata.google.internal/",
  ])("%s", (u) => expect(["ip_literal", "host_not_allowed"]).toContain(reason(u)));
});

describe("redirects are checked like first requests", () => {
  it("allows a same-host relative or absolute redirect and refuses everything else", () => {
    expect(checkRedirect("https://valta.hexalyte.com/a", "/b", prod).ok).toBe(true);
    expect(checkRedirect("https://valta.hexalyte.com/a", "https://valta.hexalyte.com/c", prod).ok).toBe(true);
    for (const loc of ["https://evil.example/", "//evil.example/", "http://valta.hexalyte.com/", "https://valta.hexalyte.com:444/", "/api/x", "/admin", "https://169.254.169.254/"]) {
      expect(checkRedirect("https://valta.hexalyte.com/a", loc, prod).ok, loc).toBe(false);
    }
  });
});

describe("sub-resources (images, scripts, frames, XHR)", () => {
  it("allows same-host resources and inline images, refuses third parties, websockets and inline scripts", () => {
    expect(checkSubresource("https://valta.hexalyte.com/_next/static/app.js", "script", prod).ok).toBe(true);
    expect(checkSubresource("data:image/png;base64,AAAA", "image", prod).ok).toBe(true);
    expect(checkSubresource("data:text/html,<b>x</b>", "document", prod).ok).toBe(false);
    expect(checkSubresource("data:text/javascript,1", "script", prod).ok).toBe(false);
    expect(checkSubresource("https://fonts.googleapis.com/css", "stylesheet", prod).ok).toBe(false);
    expect(checkSubresource("https://www.google-analytics.com/collect", "xhr", prod).ok).toBe(false);
    expect(checkSubresource("https://evil.example/frame", "document", prod).ok).toBe(false);
    expect(checkSubresource("wss://valta.hexalyte.com/socket", "websocket", prod).ok).toBe(false);
    expect(checkSubresource("about:blank", "document", prod).ok).toBe(true);
  });
});

describe("policies per environment are separate and cannot widen production", () => {
  it("production is fixed in code", () => {
    expect(() => createPolicy({ environment: "production", hosts: ["valta.hexalyte.com", "other.example"] })).toThrow();
    expect(() => createPolicy({ environment: "production", hosts: [] })).toThrow();
    expect(() => createPolicy({ environment: "production", hosts: ["staging.valta.hexalyte.com"] })).toThrow();
  });

  it("staging and development start empty and do not inherit production hosts", () => {
    const staging = createPolicy({ environment: "staging" });
    expect(checkUrl("https://valta.hexalyte.com/", staging).ok).toBe(false);
    const stagingWith = createPolicy({ environment: "staging", hosts: ["staging.example.test"] });
    expect(checkUrl("https://staging.example.test/", stagingWith).ok).toBe(true);
    expect(checkUrl("https://valta.hexalyte.com/", stagingWith).ok).toBe(false);
    expect(checkUrl("https://staging.example.test/", prod).ok).toBe(false);
  });

  it("hosts must be exact DNS names: no wildcards, no IPs", () => {
    for (const h of ["*.example.com", "10.0.0.1", "[::1]", "a b", "https://x.com"]) expect(() => createPolicy({ environment: "staging", hosts: [h] }), h).toThrow();
  });

  it("loopback http is allowed only for the development policy, and only when asked for", () => {
    const dev = createPolicy({ environment: "development", allowLoopbackHttp: true });
    expect(checkUrl("http://127.0.0.1:4100/page", dev).ok).toBe(true);
    expect(checkUrl("http://localhost:4100/page", dev).ok).toBe(true);
    expect(checkUrl("http://10.0.0.5/", dev).ok).toBe(false);
    expect(checkUrl("https://evil.example/", dev).ok).toBe(false);
    expect(checkUrl("http://127.0.0.1:4100/page", createPolicy({ environment: "development" })).ok).toBe(false);
    expect(checkUrl("http://127.0.0.1:4100/page", createPolicy({ environment: "staging", allowLoopbackHttp: true })).ok).toBe(false);
    expect(checkUrl("http://127.0.0.1/", prod).ok).toBe(false);
  });

  it("the policy object cannot be changed after creation", () => {
    expect(() => {
      (prod.hosts as string[]).push("evil.example");
    }).toThrow();
    expect(checkUrl("https://evil.example/", prod).ok).toBe(false);
  });
});

describe("resolved addresses: private, loopback, link-local and metadata results are refused", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.5.5", "172.31.255.255", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "::ffff:10.0.0.1", "::ffff:7f00:1", "ff02::1", "64:ff9b::7f00:1", "2001:db8::1", "garbage", ""])("blocks %j", (ip) => expect(isBlockedAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public %s", (ip) => expect(isBlockedAddress(ip)).toBe(false));

  it("requires EVERY resolved address to be public (a rebinding answer with one private address is refused)", async () => {
    expect(await resolvePublicAddresses("valta.hexalyte.com", async () => ["203.0.113.5".replace("203.0.113.5", "8.8.4.4")])).toEqual({ ok: true, addresses: ["8.8.4.4"] });
    expect(await resolvePublicAddresses("x", async () => ["8.8.4.4", "127.0.0.1"])).toEqual({ ok: false, reason: "private_address" });
    expect(await resolvePublicAddresses("x", async () => ["169.254.169.254"])).toEqual({ ok: false, reason: "private_address" });
    expect(await resolvePublicAddresses("x", async () => [])).toEqual({ ok: false, reason: "dns_failed" });
    expect(await resolvePublicAddresses("x", async () => { throw new Error("nxdomain"); })).toEqual({ ok: false, reason: "dns_failed" });
  });
});
