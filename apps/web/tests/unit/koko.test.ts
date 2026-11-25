import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCallbackDataString,
  buildCreateDataString,
  buildKokoForm,
  buildOrderViewDataString,
  formatKokoAmount,
  getKokoConfig,
  getKokoOrderStatus,
  normalizePem,
  signData,
  splitName,
  verifyData,
  verifyKokoCallback,
  type KokoConfig,
} from "@/lib/payments/koko";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
const other = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" } });

const cfg: KokoConfig = {
  baseUrl: "https://qaapi.paykoko.com",
  merchantId: "M1",
  apiKey: "KEY",
  pluginName: "customapi",
  pluginVersion: "1",
  privateKey: pair.privateKey,
  publicKey: pair.publicKey,
  appUrl: "https://shop.example",
};

describe("Koko data strings", () => {
  it("orderCreate: documented order, no separators", () => {
    const s = buildCreateDataString({
      _mId: "A", _amount: "B", _currency: "C", _pluginName: "D", _pluginVersion: "E", _returnUrl: "F", _cancelUrl: "G",
      _orderId: "H", _reference: "I", _firstName: "J", _lastName: "K", _email: "L", _description: "M", api_key: "N", _responseUrl: "O",
    });
    expect(s).toBe("ABCDEFGHIJKLMNO");
  });

  it("orderView: _mId + _pluginName + _pluginVersion + _orderId + api_key", () => {
    expect(buildOrderViewDataString({ _mId: "A", _pluginName: "B", _pluginVersion: "C", _orderId: "D", api_key: "E" })).toBe("ABCDE");
  });

  it("callback: orderId + trnId + status + desc, missing desc is empty", () => {
    expect(buildCallbackDataString({ orderId: "o", trnId: "t", status: "SUCCESS", desc: "d" })).toBe("otSUCCESSd");
    expect(buildCallbackDataString({ orderId: "o", trnId: "t", status: "SUCCESS" })).toBe("otSUCCESS");
  });

  it("the form signs exactly the strings it sends", () => {
    const form = buildKokoForm(cfg, { kokoOrderId: "VLK-1-1", amount: "12500.00", currency: "LKR", customerName: "Nimal Perera", email: "n@example.com", mobile: "+94771234567", description: "3 items" });
    const f = form.fields;
    expect(form.action).toBe("https://qaapi.paykoko.com/api/merchants/orderCreate");
    expect(f._returnUrl).toBe("https://shop.example/api/payments/koko/return");
    expect(f._cancelUrl).toBe("https://shop.example/api/payments/koko/cancel");
    expect(f._responseUrl).toBe("https://shop.example/api/payments/koko/webhook");
    expect(f._amount).toBe("12500.00");
    expect(f._orderId).toBe(f._reference);
    expect(f._firstName).toBe("Nimal");
    expect(f._lastName).toBe("Perera");
    const expected = "M1" + "12500.00" + "LKR" + "customapi" + "1" + f._returnUrl + f._cancelUrl + "VLK-1-1" + "VLK-1-1" + "Nimal" + "Perera" + "n@example.com" + "3 items" + "KEY" + f._responseUrl;
    expect(f.dataString).toBe(expected);
    expect(verifyData(f.dataString, f.signature, pair.publicKey)).toBe(true);
    expect(f._mobileNo).toBe("+94771234567");
  });
});

describe("Koko signing", () => {
  it("sign then verify round-trips and rejects any change", () => {
    const sig = signData("hello", pair.privateKey);
    expect(verifyData("hello", sig, pair.publicKey)).toBe(true);
    expect(verifyData("hellO", sig, pair.publicKey)).toBe(false);
    expect(verifyData("hello", sig, other.publicKey)).toBe(false);
    expect(verifyData("hello", "not-a-signature", pair.publicKey)).toBe(false);
    expect(verifyData("hello", sig, "not a key")).toBe(false);
  });

  it("accepts escaped newlines in PEM env values", () => {
    const escaped = pair.privateKey.replace(/\n/g, "\\n");
    expect(normalizePem(`"${escaped}"`).trim()).toBe(pair.privateKey.trim());
    expect(verifyData("x", signData("x", normalizePem(escaped)), pair.publicKey)).toBe(true);
  });

  it("a signature whose + became a space in form encoding still verifies", () => {
    let sig = "";
    let data = "";
    for (let i = 0; i < 200 && !sig.includes("+"); i++) {
      data = `row-${i}`;
      sig = signData(data, pair.privateKey);
    }
    expect(sig).toContain("+");
    expect(verifyData(data, sig.replace(/\+/g, " "), pair.publicKey)).toBe(true);
  });
});

/** Real Koko public key: from the environment or .env.local when present. Never printed. */
function realPublicKey(): string | null {
  let raw = process.env.KOKO_PUBLIC_KEY ?? "";
  if (!raw) {
    try {
      const text = fs.readFileSync(path.resolve(__dirname, "../../.env.local"), "utf8");
      raw = text.match(/^KOKO_PUBLIC_KEY=(.*)$/m)?.[1] ?? "";
    } catch {
      /* no .env.local */
    }
  }
  return raw.trim() ? normalizePem(raw) : null;
}

describe("Koko known-good callback vector", () => {
  const vector = {
    orderId: "ONL24052603430",
    trnId: "825e85224f13ba6c652cc2d5c0f599b9",
    status: "SUCCESS",
    desc: "",
    signature: "guYQuVV92QtJO8V11ekmyo6px5VaGefxiiIThmoq8XbH8/+wnsT7mkgYUWsvg5oVrpSZyw0c8Odu41+rT59Cm0KCajFJ7kcICrdWNodZgd9PNCO2KjxO83NKZHo71hVb9mnScL/df5j7Y6e2Flezd5f8pMD+LZEtQt7+8lz7xoE=",
  };
  const key = realPublicKey();

  // Skipped (not failed) while KOKO_PUBLIC_KEY is not configured on this machine.
  it.skipIf(!key)("verifies with the real KOKO_PUBLIC_KEY", () => {
    expect(verifyKokoCallback(vector, key!)).toBe(true);
  });

  it.skipIf(!key)("fails when any character changes", () => {
    expect(verifyKokoCallback({ ...vector, orderId: "ONL24052603431" }, key!)).toBe(false);
    expect(verifyKokoCallback({ ...vector, trnId: "925e85224f13ba6c652cc2d5c0f599b9" }, key!)).toBe(false);
    expect(verifyKokoCallback({ ...vector, status: "FAILED" }, key!)).toBe(false);
    expect(verifyKokoCallback({ ...vector, desc: "x" }, key!)).toBe(false);
    const flipped = (vector.signature[10] === "A" ? "B" : "A");
    expect(verifyKokoCallback({ ...vector, signature: vector.signature.slice(0, 10) + flipped + vector.signature.slice(11) }, key!)).toBe(false);
  });

  it("is rejected by an unrelated key (so the vector is not accepted blindly)", () => {
    expect(verifyKokoCallback(vector, pair.publicKey)).toBe(false);
  });
});

describe("helpers", () => {
  it("formats the amount once with two decimals", () => {
    expect(formatKokoAmount("12500")).toBe("12500.00");
    expect(formatKokoAmount(99.5)).toBe("99.50");
    expect(formatKokoAmount("1234.567")).toBe("1234.57");
    expect(() => formatKokoAmount(0)).toThrow();
    expect(() => formatKokoAmount("abc")).toThrow();
  });

  it("splits names", () => {
    expect(splitName("Nimal")).toEqual({ first: "Nimal", last: "-" });
    expect(splitName("  Nimal  de Silva ")).toEqual({ first: "Nimal", last: "de Silva" });
  });

  it("config is null unless every variable is present", () => {
    const env = { KOKO_BASE_URL: "https://x/", KOKO_MERCHANT_ID: "m", KOKO_API_KEY: "k", KOKO_PLUGIN_NAME: "p", KOKO_PLUGIN_VERSION: "1", KOKO_MERCHANT_PRIVATE_KEY: "a", KOKO_PUBLIC_KEY: "b", APP_URL: "https://shop/" } as unknown as NodeJS.ProcessEnv;
    expect(getKokoConfig(env)?.baseUrl).toBe("https://x");
    expect(getKokoConfig(env)?.appUrl).toBe("https://shop");
    expect(getKokoConfig({ ...env, KOKO_API_KEY: "" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("getKokoOrderStatus", () => {
  const answer = (fields: Record<string, string>, contentType: string) => async () => {
    const body = contentType.includes("json") ? JSON.stringify(fields) : new URLSearchParams(fields).toString();
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
  };
  const signed = (status: string, orderId = "ORD-1") => ({ orderId, trnId: "T1", status, desc: "", signature: signData(orderId + "T1" + status, pair.privateKey) });

  it("sends the signed form and accepts a verified JSON answer", async () => {
    let sent: { url: string; body: URLSearchParams } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: new URLSearchParams(String(init.body)) };
      return answer(signed("SUCCESS"), "application/json")();
    }) as unknown as typeof fetch;
    const r = await getKokoOrderStatus("ORD-1", cfg, f);
    expect(r?.status).toBe("SUCCESS");
    expect(sent!.url).toBe("https://qaapi.paykoko.com/api/merchants/orderView");
    const b = sent!.body;
    expect(verifyData("M1" + "customapi" + "1" + "ORD-1" + "KEY", b.get("signature")!, pair.publicKey)).toBe(true);
    expect(b.get("_orderId")).toBe("ORD-1");
  });

  it("accepts a verified form-encoded answer and maps FAILURE to FAILED", async () => {
    const r = await getKokoOrderStatus("ORD-1", cfg, answer(signed("FAILURE"), "application/x-www-form-urlencoded") as unknown as typeof fetch);
    expect(r?.status).toBe("FAILED");
  });

  it("returns null for a bad signature, a different order, or junk", async () => {
    const bad = { ...signed("SUCCESS"), signature: signData("other", pair.privateKey) };
    expect(await getKokoOrderStatus("ORD-1", cfg, answer(bad, "application/json") as unknown as typeof fetch)).toBeNull();
    expect(await getKokoOrderStatus("ORD-1", cfg, answer(signed("SUCCESS", "ORD-2"), "application/json") as unknown as typeof fetch)).toBeNull();
    expect(await getKokoOrderStatus("ORD-1", cfg, (async () => new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch)).toBeNull();
    expect(await getKokoOrderStatus("ORD-1", cfg, (async () => new Response("no", { status: 500 })) as unknown as typeof fetch)).toBeNull();
  });
});
