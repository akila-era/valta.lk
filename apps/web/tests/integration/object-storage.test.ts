/**
 * Product images go to the private object storage when it is configured (database keeps only a key), are read back
 * from it, and are removed with their row. The storage server is replaced by an in-memory fake.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

const store = vi.hoisted(() => new Map<string, Uint8Array>());
const state = vi.hoisted(() => ({ configured: true, down: false }));

vi.mock("@/lib/media/storage", () => ({
  storageConfigured: () => state.configured,
  putObject: async (key: string, bytes: Uint8Array) => {
    if (state.down) throw new Error("down");
    store.set(key, bytes);
  },
  getObject: async (key: string) => store.get(key) ?? null,
  deleteObject: async (key?: string | null) => void (key && store.delete(key)),
}));
let pg: PGlite;
let db: PrismaClient;

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort()) {
    await pg.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec(`TRUNCATE "ProductContent", "MediaAsset"`);
  store.clear();
  state.configured = true;
  state.down = false;
});

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe("object storage for product images", () => {
  it("stores the bytes in storage and only a key in the database", async () => {
    const { addImage } = await import("@/lib/admin/product-content");
    const id = await addImage(db, "p1", png());
    const row = await db.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.data).toBeNull();
    expect(row.storageKey).toMatch(/^products\/p1\//);
    expect(store.get(row.storageKey!)).toEqual(png());
  });

  it("falls back to the database when storage is not configured", async () => {
    state.configured = false;
    const { addImage } = await import("@/lib/admin/product-content");
    const id = await addImage(db, "p1", png());
    const row = await db.mediaAsset.findUniqueOrThrow({ where: { id } });
    expect(row.storageKey).toBeNull();
    expect(row.data).not.toBeNull();
    expect(store.size).toBe(0);
  });

  it("saves nothing when storage is down", async () => {
    state.down = true;
    const { addImage } = await import("@/lib/admin/product-content");
    await expect(addImage(db, "p1", png())).rejects.toMatchObject({ code: "STORAGE" });
    expect(await db.mediaAsset.count()).toBe(0);
  });

  it("removes the stored object when an unused upload is cleaned up", async () => {
    const { addImage, cleanupAssets } = await import("@/lib/admin/product-content");
    const id = await addImage(db, "p1", png());
    const key = (await db.mediaAsset.findUniqueOrThrow({ where: { id } })).storageKey!;
    await db.mediaAsset.update({ where: { id }, data: { createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } });
    await cleanupAssets(db, "p1");
    expect(await db.mediaAsset.count()).toBe(0);
    expect(store.has(key)).toBe(false);
  });
});
