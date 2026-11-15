import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EgressProxy } from "../../src/browser/egress-proxy";
import { createPolicy, productionPolicy } from "../../src/security/url-policy";
import { FIXTURE_HOSTS, startFixture, testResolver, type Fixture } from "./fixture";

/**
 * The network layer on its own: raw CONNECT and plain-http requests against the proxy (no browser), and a RAW Chromium that has the proxy
 * and NO page-level interception at all. If these hold, the guarantee does not depend on Playwright route handlers or on tool code.
 */
let fx: Fixture;
beforeAll(async () => {
  fx = await startFixture();
});
afterAll(async () => {
  await fx.close();
});

const basic = (p: EgressProxy) => `Basic ${Buffer.from(`volta:${p.credential}`).toString("base64")}`;

/** Sends one CONNECT request and returns the proxy's status line code. */
function connectStatus(proxy: EgressProxy, target: string, auth: string | null): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = connect({ host: "127.0.0.1", port: proxy.port });
    let buf = "";
    s.on("data", (d) => {
      buf += d.toString("latin1");
      const m = /^HTTP\/1\.1 (\d{3})/.exec(buf);
      if (m) {
        s.destroy();
        resolve(Number(m[1]));
      }
    });
    s.on("error", reject);
    s.on("close", () => resolve(0)); // closed without any answer: also a refusal
    s.setTimeout(5_000, () => {
      s.destroy();
      reject(new Error("no answer"));
    });
    s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ""}\r\n`);
  });
}

function plainStatus(proxy: EgressProxy, absolute: string, auth: string | null): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = new URL(absolute);
    const req = httpRequest({ host: "127.0.0.1", port: proxy.port, method: "GET", path: absolute, headers: { host: u.host, ...(auth ? { "proxy-authorization": auth } : {}) } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.setTimeout(5_000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const prod = (resolver: (h: string) => Promise<string[]>, extra: Partial<ConstructorParameters<typeof EgressProxy>[0]> = {}) => new EgressProxy({ policy: productionPolicy(), resolver, ...extra });

describe("egress proxy: production policy (no browser involved)", () => {
  it("listens on loopback only and refuses requests without the per-instance credential", async () => {
    const p = prod(async () => ["93.184.216.34"]);
    await p.start();
    try {
      expect(await connectStatus(p, "valta.hexalyte.com:443", null)).toBe(407);
      expect(await connectStatus(p, "valta.hexalyte.com:443", `Basic ${Buffer.from("volta:wrong").toString("base64")}`)).toBe(407);
      expect(p.snapshotStats().refusedReasons.proxy_auth).toBe(2);
      expect(p.snapshotStats().resolverCalls).toBe(0);
    } finally {
      await p.stop();
    }
  });

  it("refuses every non-allowlisted target by name, port or literal address, without resolving DNS for most of them", async () => {
    const calls: string[] = [];
    const p = prod(async (h) => {
      calls.push(h);
      return ["93.184.216.34"];
    });
    await p.start();
    try {
      const refused = [
        "evil.example.com:443",
        "valta.hexalyte.com.evil.com:443",
        "sub.valta.hexalyte.com:443",
        "valta.hexalyte.com:8443",
        "valta.hexalyte.com:80",
        "127.0.0.1:443",
        "[::1]:443",
        "localhost:443",
        "169.254.169.254:80",
        "169.254.169.254:443",
        "0x7f000001:443",
        "2130706433:443",
        "10.0.0.5:443",
        "[fd00:ec2::254]:443",
        "[::ffff:169.254.169.254]:443",
        "metadata.google.internal:443",
        "not a target",
      ];
      for (const t of refused) expect(await connectStatus(p, t, basic(p)), t).not.toBe(200);
      for (const t of refused.filter((x) => x !== "not a target")) expect(await connectStatus(p, t, basic(p)), t).toBeGreaterThanOrEqual(400);
      expect(calls).toEqual([]); // none of them even reached DNS
    } finally {
      await p.stop();
    }
  });

  it("resolves the allowed name itself and refuses when ANY answer is non-public (private, loopback, metadata, mapped, unique-local, CGNAT)", async () => {
    const bad = [["10.0.0.5"], ["127.0.0.1"], ["169.254.169.254"], ["::1"], ["::ffff:10.0.0.1"], ["::ffff:169.254.169.254"], ["fd00:ec2::254"], ["100.64.0.1"], ["0.0.0.0"], ["93.184.216.34", "10.0.0.5"], ["192.168.1.1"], ["172.16.0.1"]];
    for (const answer of bad) {
      const p = prod(async () => answer);
      await p.start();
      try {
        expect(await connectStatus(p, "valta.hexalyte.com:443", basic(p)), answer.join(",")).toBe(403);
        expect(p.snapshotStats().refusedReasons.private_address).toBe(1);
      } finally {
        await p.stop();
      }
    }
    const failing = prod(async () => {
      throw new Error("NXDOMAIN");
    });
    await failing.start();
    expect(await connectStatus(failing, "valta.hexalyte.com:443", basic(failing))).toBe(403);
    expect(failing.snapshotStats().refusedReasons.dns_failed).toBe(1);
    await failing.stop();
    const empty = prod(async () => []);
    await empty.start();
    expect(await connectStatus(empty, "valta.hexalyte.com:443", basic(empty))).toBe(403);
    await empty.stop();
  });

  it("refuses plain http in production, even to the allowed host", async () => {
    const p = prod(async () => ["93.184.216.34"]);
    await p.start();
    try {
      expect(await plainStatus(p, "http://valta.hexalyte.com/", basic(p))).toBe(403);
      expect(await plainStatus(p, `http://127.0.0.1:${fx.port}/secret`, basic(p))).toBe(403);
      expect(fx.hitCount("/secret")).toBe(0);
    } finally {
      await p.stop();
    }
  });
});

describe("egress proxy: DNS pinning (rebinding)", () => {
  const policy = createPolicy({ environment: "development", hosts: FIXTURE_HOSTS });

  it("resolves a name once, pins the validated answer, and never uses a later private answer", async () => {
    let n = 0;
    const r = testResolver({ "rebind.test": () => (n++ === 0 ? ["127.0.0.1"] : ["169.254.169.254"]) });
    const p = new EgressProxy({ policy, resolver: r.resolve, pinTtlMs: 60_000, testOnly: { treatAsPublic: ["127.0.0.1"], fixturePort: fx.port } });
    await p.start();
    try {
      for (let i = 0; i < 4; i++) expect(await plainStatus(p, fx.url("/products", "rebind.test"), basic(p))).toBe(200);
      expect(r.calls.filter((h) => h === "rebind.test")).toHaveLength(1); // the second (private) answer was never even requested
      expect(p.snapshotStats().resolverCalls).toBe(1);
      expect(fx.hitCount("/products", "rebind.test")).toBe(4);
    } finally {
      await p.stop();
    }
  });

  it("after the pin expires the name is resolved AND validated again: a rebinding answer is then refused", async () => {
    let n = 0;
    const r = testResolver({ "rebind.test": () => (n++ === 0 ? ["127.0.0.1"] : ["10.0.0.5"]) });
    const p = new EgressProxy({ policy, resolver: r.resolve, pinTtlMs: 50, testOnly: { treatAsPublic: ["127.0.0.1"], fixturePort: fx.port } });
    await p.start();
    try {
      expect(await plainStatus(p, fx.url("/", "rebind.test"), basic(p))).toBe(200);
      await new Promise((res) => setTimeout(res, 120));
      const before = fx.hitCount("/", "rebind.test");
      expect(await plainStatus(p, fx.url("/", "rebind.test"), basic(p))).toBe(403);
      expect(fx.hitCount("/", "rebind.test")).toBe(before);
    } finally {
      await p.stop();
    }
  });

  it("a mixed answer (one public, one private) is refused as a whole", async () => {
    const r = testResolver({ "rebind.test": ["127.0.0.1", "10.0.0.5"] });
    const p = new EgressProxy({ policy, resolver: r.resolve, testOnly: { treatAsPublic: ["127.0.0.1"], fixturePort: fx.port } });
    await p.start();
    try {
      expect(await plainStatus(p, fx.url("/", "rebind.test"), basic(p))).toBe(403);
    } finally {
      await p.stop();
    }
  });
});

describe("network layer alone: a RAW Chromium with the proxy and NO page-level interception", () => {
  it("cannot reach loopback, hex/decimal/short IPs, mapped IPv6, metadata or a non-allowlisted name; the allowed name works", async () => {
    const r = testResolver();
    const p = new EgressProxy({ policy: createPolicy({ environment: "development", hosts: FIXTURE_HOSTS }), resolver: r.resolve, testOnly: { treatAsPublic: ["127.0.0.1"], fixturePort: fx.port } });
    await p.start();
    const browser = await chromium.launch({
      headless: true,
      proxy: { server: `http://127.0.0.1:${p.port}`, bypass: "<-loopback>", username: "volta", password: p.credential },
      args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"],
    });
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage(); // no route(), no checks of any kind
      const targets = [
        `http://127.0.0.1:${fx.port}/secret?t=1`,
        `http://localhost:${fx.port}/secret?t=2`,
        `http://0x7f000001:${fx.port}/secret?t=3`,
        `http://2130706433:${fx.port}/secret?t=4`,
        `http://127.1:${fx.port}/secret?t=5`,
        `http://[::1]:${fx.port}/secret?t=6`,
        `http://[::ffff:7f00:1]:${fx.port}/secret?t=7`,
        `http://evil.test:${fx.port}/landing?t=8`,
        "http://169.254.169.254/latest/meta-data/",
        "https://169.254.169.254/",
        `http://shop.test:${fx.port + 1}/`,
      ];
      // A refused plain-http request may come back as the proxy's own 403 page (not a network error): both mean "nothing was fetched".
      for (const t of targets) {
        const r = await page.goto(t, { timeout: 6_000 }).catch(() => null);
        expect(r === null || r.status() >= 400, t).toBe(true);
      }
      // page script (hostile) tries too
      await page.goto(fx.url("/products")).catch(() => {});
      const viaScript = await page.evaluate(async (port) => {
        const out: string[] = [];
        for (const u of [`http://127.0.0.1:${port}/secret?s=1`, `http://0x7f000001:${port}/secret?s=2`, `http://evil.test:${port}/landing?s=3`, "http://169.254.169.254/"]) {
          out.push(await fetch(u).then(() => "reached", () => "blocked"));
        }
        return out;
      }, fx.port);
      expect(viaScript).toHaveLength(4); // a refused request may surface as a CORS failure or a 403; the server log below is the proof
      expect(fx.hitCount("/secret")).toBe(0);
      expect(fx.hitCount("/landing")).toBe(0);
      expect(fx.hitCount("/", "shop.test")).toBe(0);
      const ok = await page.goto(fx.url("/products"));
      expect(ok?.status()).toBe(200);
      expect(fx.hitCount("/products", "shop.test")).toBeGreaterThanOrEqual(1);
      const s = p.snapshotStats();
      expect(s.refused).toBeGreaterThanOrEqual(8);
      expect(s.refusedReasons.host_not_allowed).toBeGreaterThanOrEqual(1);
      expect(s.refusedReasons.ip_literal).toBeGreaterThanOrEqual(1);
    } finally {
      await browser.close();
      await p.stop();
    }
  });

  it("the browser cannot bypass the proxy by connecting directly to a loopback fixture (bypass list cleared, names unresolvable)", async () => {
    const p = new EgressProxy({ policy: createPolicy({ environment: "development", hosts: FIXTURE_HOSTS }), resolver: testResolver().resolve, testOnly: { treatAsPublic: ["127.0.0.1"], fixturePort: fx.port } });
    await p.start();
    const browser = await chromium.launch({ headless: true, proxy: { server: `http://127.0.0.1:${p.port}`, bypass: "<-loopback>", username: "volta", password: p.credential }, args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"] });
    try {
      const page = await (await browser.newContext()).newPage();
      const before = p.snapshotStats().refused;
      const r = await page.goto(`http://127.0.0.1:${fx.port}/secret?direct=1`, { timeout: 5_000 }).catch(() => null);
      expect(r === null || r.status() >= 400).toBe(true);
      expect(p.snapshotStats().refused).toBeGreaterThan(before); // it went to the proxy and was refused there, not around it
      expect(fx.hitCount("/secret")).toBe(0);
    } finally {
      await browser.close();
      await p.stop();
    }
  });
});
