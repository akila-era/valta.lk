/** Admin-saved Koko settings: precedence over env, the on/off switch, and encryption at rest (real DB via PGlite). */
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/erp/connection";
import { checkKeyPair, getActiveKoko, invalidateKokoConfig, isKokoOffered, kokoSource } from "@/lib/payments/koko-config";

vi.mock("@/lib/db", () => ({ getDb: () => (globalThis as unknown as { __testDb: unknown }).__testDb }));

const pem = () => generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
const mine = pem();
const kokos = pem();
let pg: PGlite;
let db: PrismaClient;

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  (globalThis as unknown as { __testDb: unknown }).__testDb = db;
  process.env.SETTINGS_ENCRYPTION_KEY = "k".repeat(40);
}, 60_000);
afterAll(async () => {
  await db?.$disconnect();
});
beforeEach(async () => {
  for (const k of ["KOKO_BASE_URL", "KOKO_MERCHANT_ID", "KOKO_API_KEY", "KOKO_PLUGIN_NAME", "KOKO_PLUGIN_VERSION", "KOKO_MERCHANT_PRIVATE_KEY", "KOKO_PUBLIC_KEY", "APP_URL", "SITE_URL"]) delete process.env[k];
  await db.kokoConnectionConfig.deleteMany();
  invalidateKokoConfig();
});

const save = (enabled: boolean) =>
  db.kokoConnectionConfig.create({
    data: {
      enabled, baseUrl: "https://qaapi.paykoko.com", merchantId: "ADMIN-M", apiKeyEnc: encryptSecret("admin-api-key"), apiKeyHint: "…key",
      pluginName: "customapi", pluginVersion: "1", privateKeyEnc: encryptSecret(mine.privateKey), publicKey: kokos.publicKey, appUrl: "https://valta.example",
    },
  });

describe("admin-saved Koko settings", () => {
  it("nothing configured: not offered", async () => {
    expect(await isKokoOffered()).toBe(false);
    expect(await kokoSource()).toBe("none");
  });

  it("saved settings are decrypted for use, and the switch controls whether Koko is offered", async () => {
    await save(false);
    let k = await getActiveKoko();
    expect(k.cfg?.merchantId).toBe("ADMIN-M");
    expect(k.cfg?.apiKey).toBe("admin-api-key");
    expect(k.cfg?.privateKey).toBe(mine.privateKey);
    expect(k.enabled).toBe(false);
    expect(await isKokoOffered()).toBe(false); // off: hidden from checkout, but config still usable for callbacks
    await db.kokoConnectionConfig.update({ where: { id: "default" }, data: { enabled: true } });
    invalidateKokoConfig();
    k = await getActiveKoko();
    expect(await isKokoOffered()).toBe(true);
    expect(await kokoSource()).toBe("admin");
  });

  it("admin-saved settings win over environment variables", async () => {
    Object.assign(process.env, { KOKO_BASE_URL: "https://prodapi.paykoko.com", KOKO_MERCHANT_ID: "ENV-M", KOKO_API_KEY: "e", KOKO_PLUGIN_NAME: "p", KOKO_PLUGIN_VERSION: "9", KOKO_MERCHANT_PRIVATE_KEY: "a", KOKO_PUBLIC_KEY: "b", APP_URL: "https://env.example" });
    expect((await getActiveKoko()).cfg?.merchantId).toBe("ENV-M");
    expect(await kokoSource()).toBe("environment");
    await save(true);
    invalidateKokoConfig();
    expect((await getActiveKoko()).cfg?.merchantId).toBe("ADMIN-M");
  });

  it("secrets are not stored in plain text", async () => {
    await save(true);
    const row = await db.kokoConnectionConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.apiKeyEnc).not.toContain("admin-api-key");
    expect(row.privateKeyEnc).not.toContain("BEGIN");
  });

  it("checkKeyPair rejects junk and non-RSA input", () => {
    expect(checkKeyPair(mine.privateKey, kokos.publicKey)).toBeNull();
    expect(checkKeyPair("junk", kokos.publicKey)).toMatch(/private key/);
    expect(checkKeyPair(mine.privateKey, "junk")).toMatch(/public key/);
    expect(checkKeyPair(mine.privateKey.replace(/\n/g, "\\n"), kokos.publicKey.replace(/\n/g, "\\n"))).toBeNull();
  });
});
