import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PayzyCheckoutError,
  PayzyConfigError,
  assertPayzyKey,
  buildRequestFields,
  buildRequestSignString,
  buildResponseSignString,
  createPayzyCheckout,
  formatPayzyAmount,
  getPayzyConfig,
  hmacBase64,
  signRequest,
  signaturesMatch,
  verifyPayzyResponse,
  type PayzyConfig,
} from "@/lib/payments/payzy";

// A fake key with the right shape (60 chars, $2b$ prefix). The real sandbox key is never committed.
const FAKE_KEY = "$2b$12$" + "N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy".slice(0, 53);
const VECTOR: Record<string, string> = {
  x_test_mode: "on", x_shopid: "2", x_amount: "10", x_order_id: "ABC-0001", x_response_url: "http://localhost:8080/responce.html",
  x_first_name: "John", x_last_name: "Doe", x_company: "ABC Company", x_address: "123 Main St", x_country: "Sri Lanka", x_state: "Western", x_city: "Colombo", x_zip: "12345", x_phone: "1234567890", x_email: "exampl@email.com",
  x_ship_to_first_name: "John", x_ship_to_last_name: "Doe", x_ship_to_company: "ABC Company", x_ship_to_address: "123 Main St", x_ship_to_country: "Sri Lanka", x_ship_to_state: "Western", x_ship_to_city: "Colombo", x_ship_to_zip: "12345",
  x_freight: "0", x_platform: "custom", x_version: "1.0",
};
const LIST = "x_test_mode,x_shopid,x_amount,x_order_id,x_response_url,x_first_name,x_last_name,x_company,x_address,x_country,x_state,x_city,x_zip,x_phone,x_email,x_ship_to_first_name,x_ship_to_last_name,x_ship_to_company,x_ship_to_address,x_ship_to_country,x_ship_to_state,x_ship_to_city,x_ship_to_zip,x_freight,x_platform,x_version,signed_field_names";
const PAIRS = "x_test_mode=on,x_shopid=2,x_amount=10,x_order_id=ABC-0001,x_response_url=http://localhost:8080/responce.html,x_first_name=John,x_last_name=Doe,x_company=ABC Company,x_address=123 Main St,x_country=Sri Lanka,x_state=Western,x_city=Colombo,x_zip=12345,x_phone=1234567890,x_email=exampl@email.com,x_ship_to_first_name=John,x_ship_to_last_name=Doe,x_ship_to_company=ABC Company,x_ship_to_address=123 Main St,x_ship_to_country=Sri Lanka,x_ship_to_state=Western,x_ship_to_city=Colombo,x_ship_to_zip=12345,x_freight=0,x_platform=custom,x_version=1.0";

describe("sign strings", () => {
  it("request string is name=value pairs in order, ending with signed_field_names=<list>", () => {
    expect(buildRequestSignString(VECTOR)).toBe(`${PAIRS},signed_field_names=${LIST}`);
  });

  it("response string has response_code first and the list with response_code prepended", () => {
    expect(buildResponseSignString(VECTOR, "00")).toBe(`response_code=00,${PAIRS},signed_field_names=response_code,${LIST}`);
  });

  it("legacy flag reproduces the sample's x_version1.0 typo in the request only", () => {
    expect(buildRequestSignString(VECTOR, { legacyVersionSigning: true })).toContain(",x_platform=custom,x_version1.0,signed_field_names=");
    expect(buildResponseSignString(VECTOR, "00")).toContain(",x_version=1.0,");
  });

  it("missing optional values are empty strings, identical in the string", () => {
    expect(buildRequestSignString({ ...VECTOR, x_company: "" })).toContain("x_company=,x_address=");
  });
});

describe("HMAC", () => {
  it("matches an independent HMAC-SHA256/base64 computation with the key as a raw UTF-8 string", () => {
    const s = buildRequestSignString(VECTOR);
    expect(hmacBase64(s, FAKE_KEY)).toBe(createHmac("sha256", Buffer.from(FAKE_KEY, "utf8")).update(Buffer.from(s, "utf8")).digest("base64"));
  });

  // Payzy's known-good vectors. They need the real sandbox key, supplied only through the environment (never committed).
  const vectorKey = process.env.PAYZY_VECTOR_KEY;
  it.skipIf(!vectorKey)("Payzy request test vector", () => {
    expect(hmacBase64(buildRequestSignString(VECTOR), vectorKey!)).toBe("Z7n92Q+zkArlbV27Rf2JyrLUE+med/+tvCsXVsv0ixg=");
  });
  it.skipIf(!vectorKey)("Payzy response test vector (response_code=00)", () => {
    expect(hmacBase64(buildResponseSignString(VECTOR, "00"), vectorKey!)).toBe("BGwVVG7JcAQv9mJP/mASkbDdY6pfY0gCaUBGXRhyXKk=");
  });
});

describe("response verification", () => {
  const sig = hmacBase64(buildResponseSignString(VECTOR, "00"), FAKE_KEY);
  it("accepts the right signature, rejects a changed code, field, key or empty signature", () => {
    expect(verifyPayzyResponse(VECTOR, "00", sig, FAKE_KEY)).toBe(true);
    expect(verifyPayzyResponse(VECTOR, "01", sig, FAKE_KEY)).toBe(false);
    expect(verifyPayzyResponse({ ...VECTOR, x_amount: "1" }, "00", sig, FAKE_KEY)).toBe(false);
    expect(verifyPayzyResponse(VECTOR, "00", sig, FAKE_KEY.slice(0, -1) + "x")).toBe(false);
    expect(verifyPayzyResponse(VECTOR, "00", "", FAKE_KEY)).toBe(false);
  });
  it("restores '+' that arrived as a space, and tolerates different lengths", () => {
    expect(signaturesMatch("ab+c", "ab c")).toBe(true);
    expect(signaturesMatch("abc", "abcd")).toBe(false);
  });
});

describe("key guard and env loading", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    delete process.env.PAYZY_TEST_KEY_LOAD;
  });
  const loadFrom = (line: string) => {
    // vitest runs with NODE_ENV=test, where Next loads .env.test.local; the $VAR expansion is the same code as for .env.local.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "payzy-env-"));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, ".env.test.local"), line + "\n");
    loadEnvConfig(dir, true, { info: () => undefined, error: () => undefined }, true);
    return process.env.PAYZY_TEST_KEY_LOAD ?? "";
  };

  it("an escaped key (\\$) loads to length 60 and passes the guard", () => {
    const loaded = loadFrom(`PAYZY_TEST_KEY_LOAD=${FAKE_KEY.replace(/\$/g, "\\$")}`);
    expect(loaded).toHaveLength(60);
    expect(loaded).toBe(FAKE_KEY);
    expect(() => assertPayzyKey(loaded)).not.toThrow();
  });

  it("an unescaped key is mangled by Next's $VAR expansion and the guard fires", () => {
    const loaded = loadFrom(`PAYZY_TEST_KEY_LOAD=${FAKE_KEY}`);
    expect(loaded).not.toBe(FAKE_KEY);
    expect(loaded.length).toBeLessThan(60);
    expect(() => assertPayzyKey(loaded)).toThrow(PayzyConfigError);
  });

  it("rejects wrong length and wrong prefix, and never echoes the key", () => {
    expect(() => assertPayzyKey(FAKE_KEY.slice(1))).toThrow(/malformed/);
    expect(() => assertPayzyKey("$2a$12$" + FAKE_KEY.slice(7))).toThrow(PayzyConfigError);
    expect(() => assertPayzyKey(".EGvWy")).toThrow(/length 6\b/);
    try {
      assertPayzyKey(".EGvWy");
    } catch (e) {
      expect((e as Error).message).not.toContain("EGvWy");
    }
  });

  it("getPayzyConfig requires every variable and a valid key", () => {
    const env = { PAYZY_BASE_URL: "https://api.payzypay.xyz/", PAYZY_SHOP_ID: "2", PAYZY_SECRET_KEY: FAKE_KEY, PAYZY_TEST_MODE: "on", APP_URL: "https://shop.example/" } as unknown as NodeJS.ProcessEnv;
    expect(getPayzyConfig(env)).toMatchObject({ baseUrl: "https://api.payzypay.xyz", shopId: "2", testMode: "on", appUrl: "https://shop.example", legacyVersionSigning: false });
    expect(() => getPayzyConfig({ ...env, PAYZY_SHOP_ID: "" } as NodeJS.ProcessEnv)).toThrow(/PAYZY_SHOP_ID/);
    expect(() => getPayzyConfig({ ...env, PAYZY_SECRET_KEY: ".EGvWy" } as NodeJS.ProcessEnv)).toThrow(PayzyConfigError);
  });
});

describe("request fields and create checkout", () => {
  const cfg: PayzyConfig = { baseUrl: "https://api.payzypay.xyz", shopId: "2", secretKey: FAKE_KEY, testMode: "on", appUrl: "https://shop.example", legacyVersionSigning: false };
  const addr = { firstName: "John", lastName: "Doe", company: "", address: "1 Main St", country: "Sri Lanka", state: "Western", city: "Colombo", zip: "" };
  const fields = buildRequestFields(cfg, { payzyOrderId: "VOLTA-X-1", amount: "10", billing: { ...addr, phone: "+94771234567", email: "" }, shipping: addr, freight: "0" });

  it("formats amounts once: whole numbers plain, others with two decimals", () => {
    expect(formatPayzyAmount("10.00")).toBe("10");
    expect(formatPayzyAmount("12500.5")).toBe("12500.50");
    expect(() => formatPayzyAmount("0")).toThrow();
  });

  it("builds all string fields with our return URL and a signature over exactly those fields", () => {
    expect(fields.x_response_url).toBe("https://shop.example/api/payments/payzy/return");
    expect(fields.x_platform).toBe("custom");
    expect(fields.signed_field_names).toBe(LIST);
    expect(Object.values(fields).every((v) => typeof v === "string")).toBe(true);
    const body = signRequest(cfg, fields);
    expect(body.signature).toBe(hmacBase64(buildRequestSignString(fields), FAKE_KEY));
    expect(signRequest({ ...cfg, legacyVersionSigning: true }, fields).signature).not.toBe(body.signature);
  });

  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("success: POSTs JSON to custom-checkout and returns the url", async () => {
    const f = reply(200, { url: "https://pay.payzypay.xyz/session/abc" });
    const body = signRequest(cfg, fields);
    expect(await createPayzyCheckout(cfg, body, f as unknown as typeof fetch)).toBe("https://pay.payzypay.xyz/session/abc");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.payzypay.xyz/checkout/custom-checkout");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it.each([[400, { message: "bad" }], [401, { message: "no" }], [404, "not found"], [200, { nourl: true }], [200, { url: "javascript:alert(1)" }], [200, "<html>"]])("failure (%s) throws PayzyCheckoutError without leaking the key", async (status, b) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createPayzyCheckout(cfg, signRequest(cfg, fields), reply(status as number, b) as unknown as typeof fetch)).rejects.toBeInstanceOf(PayzyCheckoutError);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_KEY);
    spy.mockRestore();
  });

  it("a network error becomes PayzyCheckoutError", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createPayzyCheckout(cfg, {}, (async () => { throw new Error("boom"); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(PayzyCheckoutError);
    spy.mockRestore();
  });
});
