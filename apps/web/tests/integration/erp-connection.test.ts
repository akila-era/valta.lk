import { describe, expect, it, beforeAll } from "vitest";
import { decryptSecret, encryptSecret, normalizeErpBase } from "@/lib/erp/connection";

beforeAll(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = "unit-test-key-0123456789-abcdefghijkl";
});

describe("ERP address", () => {
  it("accepts an IP with port, a host, or a full URL and adds the store-api path", () => {
    expect(normalizeErpBase("192.168.1.10:3001")).toEqual({ ok: true, base: "http://192.168.1.10:3001/api/v1/store-api" });
    expect(normalizeErpBase("https://erp.example.com/")).toEqual({ ok: true, base: "https://erp.example.com/api/v1/store-api" });
    expect(normalizeErpBase("https://erp.example.com/api/v1/store-api/")).toEqual({ ok: true, base: "https://erp.example.com/api/v1/store-api" });
  });
  it("refuses empty, malformed, credentialed and cloud-metadata addresses", () => {
    for (const bad of ["", "   ", "http://", "http://user:pw@host", "http://host?x=1", "http://169.254.169.254", "ftp://host", "http://bad host"]) {
      expect(normalizeErpBase(bad).ok, bad).toBe(false);
    }
  });
});

describe("credential encryption", () => {
  it("round-trips, uses a fresh IV, and rejects tampering or another key", () => {
    const a = encryptSecret("hxs_abc.secret");
    expect(a).not.toContain("secret");
    expect(a).not.toBe(encryptSecret("hxs_abc.secret"));
    expect(decryptSecret(a)).toBe("hxs_abc.secret");
    const parts = a.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(decryptSecret(parts.join("."))).toBeNull();
    process.env.SETTINGS_ENCRYPTION_KEY = "another-key-0123456789-abcdefghijklmnop";
    expect(decryptSecret(a)).toBeNull();
    process.env.SETTINGS_ENCRYPTION_KEY = "unit-test-key-0123456789-abcdefghijkl";
  });
});
