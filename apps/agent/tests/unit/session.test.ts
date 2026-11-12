import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createSessionStore, emptySession, sessionKey, TtlLruStore } from "../../src/session/store";

describe("TtlLruStore", () => {
  it("evicts the least recently used entry when full", () => {
    const s = new TtlLruStore<number>({ max: 3, ttlMs: 1000 });
    s.set("a", 1);
    s.set("b", 2);
    s.set("c", 3);
    s.get("a"); // a becomes most recent; b is now the oldest
    s.set("d", 4);
    expect(s.get("b")).toBeUndefined();
    expect([s.get("a"), s.get("c"), s.get("d")]).toEqual([1, 3, 4]);
    expect(s.size()).toBe(3);
  });

  it("expires entries after the time to live and slides it on use", () => {
    let t = 0;
    const s = new TtlLruStore<string>({ max: 10, ttlMs: 1000, now: () => t });
    s.set("k", "v");
    t = 900;
    expect(s.get("k")).toBe("v"); // use extends the life
    t = 1800;
    expect(s.get("k")).toBe("v");
    t = 2900;
    expect(s.get("k")).toBeUndefined();
    expect(s.size()).toBe(0);
  });

  it("sweeps expired entries in bulk", () => {
    let t = 0;
    const s = new TtlLruStore<number>({ max: 10, ttlMs: 100, now: () => t });
    s.set("a", 1);
    s.set("b", 2);
    t = 50;
    s.set("c", 3);
    t = 120;
    expect(s.sweep()).toBe(2);
    expect(s.size()).toBe(1);
  });

  it("overwrites and deletes", () => {
    const s = new TtlLruStore<number>({ max: 3, ttlMs: 1000 });
    s.set("a", 1);
    s.set("a", 2);
    expect(s.get("a")).toBe(2);
    expect(s.size()).toBe(1);
    s.delete("a");
    expect(s.get("a")).toBeUndefined();
  });

  it("uses the documented defaults: 300 sessions, 30 minutes", () => {
    let t = 0;
    const s = createSessionStore(() => t);
    for (let i = 0; i < 305; i++) s.set(`k${i}`, emptySession());
    expect(s.size()).toBe(300);
    expect(s.get("k0")).toBeUndefined();
    expect(s.get("k304")).toBeDefined();
    t = 30 * 60_000 + 1;
    expect(s.get("k304")).toBeUndefined();
  });
});

describe("session keys and state", () => {
  it("separate guests, customers and different session ids", () => {
    const sid = "sess_0123456789abcdef";
    const keys = new Set([
      sessionKey({ kind: "guest" }, sid),
      sessionKey({ kind: "customer", customerId: "c1" }, sid),
      sessionKey({ kind: "customer", customerId: "c2" }, sid),
      sessionKey({ kind: "guest" }, "sess_other_0123456789"),
    ]);
    expect(keys.size).toBe(4);
  });

  it("knowing a session id is not enough to read another identity's state", () => {
    const store = createSessionStore();
    const sid = "sess_0123456789abcdef";
    const mine = emptySession();
    mine.slots.brand = "Nova";
    store.set(sessionKey({ kind: "customer", customerId: "owner" }, sid), mine);
    expect(store.get(sessionKey({ kind: "customer", customerId: "attacker" }, sid))).toBeUndefined();
    expect(store.get(sessionKey({ kind: "guest" }, sid))).toBeUndefined();
  });

  it("emptySession never shares mutable state between sessions", () => {
    const a = emptySession();
    const b = emptySession();
    a.lastShownProductIds.push("p1");
    a.slots.brand = "Nova";
    expect(b.lastShownProductIds).toEqual([]);
    expect(b.slots).toEqual({});
  });

  it("holds no message text by design", () => {
    expect(Object.keys(emptySession()).sort()).toEqual(["lastShownProductIds", "slots"]);
  });
});

describe("no persistence", () => {
  it("the session module never touches the file system, network or child processes", () => {
    const dir = fileURLToPath(new URL("../../src/session", import.meta.url));
    for (const file of readdirSync(dir)) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src, file).not.toMatch(/node:fs|from\s+["']fs|fs\/promises|writeFile|appendFile|createWriteStream|node:net|node:http|child_process|fetch\(/);
    }
  });
});
