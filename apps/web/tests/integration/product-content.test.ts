/**
 * Website-owned product content (draft/publish, images, sanitising) against in-process PostgreSQL with the real
 * migrations. The ERP keeps identity, price and stock: content can never change them.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { addImage, cleanupAssets, ContentError, discardDraft, getRecord, listStates, publish, saveDraft, unpublish } from "@/lib/admin/product-content";
import { contentDocSchema, emptyDoc, groupSpecs, hasContent, isComplete, normalizeDoc } from "@/lib/content/schema";
import { htmlToText, sanitizeHtml } from "@/lib/content/sanitize";
import { applyContent } from "@/lib/erp/content-overlay";
import type { ErpProduct } from "@/lib/erp/types";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT, sniffImage } from "@/lib/media/sniff";

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
});

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2]);
const webp = () => new Uint8Array([...Buffer.from("RIFF"), 1, 0, 0, 0, ...Buffer.from("WEBP"), 9]);
const by = "admin@x.test";

const product = (over: Partial<ErpProduct> = {}): ErpProduct => ({
  id: "p1", slug: "p1", name: "Phone", description: "ERP text", images: ["https://erp/x.jpg"], price: 100, salePrice: null, specs: { Warranty: "12 months" }, variants: [], hasVariants: false,
  available: true, purchasableQuantity: 5, publishedAt: null, updatedAt: "2026-01-01", ...over,
});

describe("rich-text sanitiser", () => {
  it("keeps headings, paragraphs, emphasis, lists and safe links", () => {
    const html = "<h2>Why buy</h2><p>Fast <strong>charging</strong> and <em>safe</em>.</p><ul><li>25W</li><li>45W</li></ul><ol><li>one</li></ol><a href=\"https://volta.lk/x\">link</a>";
    const out = sanitizeHtml(html);
    expect(out).toContain("<h2>Why buy</h2>");
    expect(out).toContain("<strong>charging</strong>");
    expect(out).toContain("<ul><li>25W</li><li>45W</li></ul>");
    expect(out).toContain('<a href="https://volta.lk/x" target="_blank" rel="noopener noreferrer nofollow">link</a>');
  });

  it("removes scripts, event handlers, iframes, styles and javascript: links", () => {
    const evil = [
      '<p onclick="alert(1)" style="x">hi</p>',
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      '<iframe src="https://evil.test"></iframe>',
      '<a href="javascript:alert(1)">bad</a>',
      '<a href="  JaVaScRiPt:alert(1)">bad2</a>',
      '<a href="data:text/html;base64,AAAA">bad3</a>',
      '<svg onload="alert(1)"><circle/></svg>',
      "<style>body{display:none}</style>",
    ].join("");
    const out = sanitizeHtml(evil);
    expect(out).not.toMatch(/script|onerror|onclick|onload|iframe|javascript:|data:|<style|<svg|<img|style=/i);
    expect(out).toContain("<p>hi</p>");
    expect(htmlToText(out)).toContain("bad");
  });

  it("escapes stray angle brackets and ampersands, and closes unbalanced tags", () => {
    expect(sanitizeHtml("<p>1 < 2 && 3 > 2")).toBe("<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>");
    expect(sanitizeHtml("<ul><li>a<li>b")).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  it("is idempotent", () => {
    const once = sanitizeHtml('<h1>T</h1><p>a <b>b</b> <i>c</i><br>d</p><div>x</div>');
    expect(sanitizeHtml(once)).toBe(once);
    expect(once).toContain("<h2>T</h2>");
  });
});

describe("content document", () => {
  it("fills defaults, trims, and sanitises the description", () => {
    const d = contentDocSchema.parse({ displayTitle: "  Nova  ", descriptionHtml: '<p>ok</p><script>x</script>' });
    expect(d.displayTitle).toBe("Nova");
    expect(d.descriptionHtml).toBe("<p>ok</p>");
    expect(d.features).toEqual([]);
    expect(hasContent(emptyDoc())).toBe(false);
    expect(hasContent(d)).toBe(true);
  });

  it("rejects features without a title, specs without a value, unknown labels and over-long fields", () => {
    expect(contentDocSchema.safeParse({ features: [{ title: "", description: "x" }] }).success).toBe(false);
    expect(contentDocSchema.safeParse({ specs: [{ group: "G", name: "Weight", value: "" }] }).success).toBe(false);
    expect(contentDocSchema.safeParse({ badges: ["best-seller"] }).success).toBe(false);
    expect(contentDocSchema.safeParse({ shortDescription: "x".repeat(301) }).success).toBe(false);
    expect(normalizeDoc({ badges: ["nope"] })).toEqual(emptyDoc()); // stored junk never crashes the storefront
  });

  it("groups specifications and judges completeness", () => {
    const d = contentDocSchema.parse({ specs: [{ group: "Power", name: "Capacity", value: "20000", unit: "mAh" }, { group: "", name: "Colour", value: "Black" }, { group: "Power", name: "Input", value: "45W" }] });
    expect(groupSpecs(d.specs).map((g) => [g.group, g.rows.length])).toEqual([["Power", 2], ["General", 1]]);
    expect(isComplete(d)).toBe(false);
  });
});

describe("image validation", () => {
  it("identifies images by their bytes, not by name or declared type", () => {
    expect(sniffImage(png())).toBe("image/png");
    expect(sniffImage(jpeg())).toBe("image/jpeg");
    expect(sniffImage(webp())).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });

  it("rejects non-images, empty files and files over the size limit", async () => {
    await expect(addImage(db, "p1", new TextEncoder().encode("hello"))).rejects.toMatchObject({ code: "BAD_TYPE" });
    await expect(addImage(db, "p1", new Uint8Array(0))).rejects.toMatchObject({ code: "TOO_LARGE" });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(png());
    await expect(addImage(db, "p1", big)).rejects.toBeInstanceOf(ContentError);
    expect(await db.mediaAsset.count()).toBe(0);
  });

  it("limits uploads per product", async () => {
    for (let i = 0; i < MAX_IMAGES_PER_PRODUCT + 8; i++) await addImage(db, "p1", png());
    await expect(addImage(db, "p1", png())).rejects.toMatchObject({ code: "TOO_MANY" });
  });
});

describe("draft, save, publish", () => {
  it("saves a draft that is NOT visible to customers until published", async () => {
    const r = await saveDraft(db, "p1", { displayTitle: "Nova X1", shortDescription: "Fast", specs: [{ group: "Power", name: "Battery", value: "5000", unit: "mAh" }] }, 0, by);
    expect(r.version).toBe(1);
    const rec = await getRecord(db, "p1");
    expect(rec?.draft.displayTitle).toBe("Nova X1");
    expect(rec?.published).toBeNull();
    expect(rec?.updatedBy).toBe(by);
    expect((await listStates(db)).get("p1")?.published).toBeNull();

    await publish(db, "p1", by);
    const live = await getRecord(db, "p1");
    expect(live?.published?.displayTitle).toBe("Nova X1");
    expect(live?.publishedAt).toBeInstanceOf(Date);
  });

  it("keeps the published copy while a newer draft is edited, and discard goes back to it", async () => {
    await saveDraft(db, "p1", { displayTitle: "Live title" }, 0, by);
    await publish(db, "p1", by);
    await saveDraft(db, "p1", { displayTitle: "Draft title" }, 1, by);
    let rec = await getRecord(db, "p1");
    expect([rec?.draft.displayTitle, rec?.published?.displayTitle]).toEqual(["Draft title", "Live title"]);
    await discardDraft(db, "p1", by);
    rec = await getRecord(db, "p1");
    expect(rec?.draft.displayTitle).toBe("Live title");
    expect(rec?.version).toBe(3);
  });

  it("unpublish takes it off the storefront but keeps the draft", async () => {
    await saveDraft(db, "p1", { subtitle: "Hello" }, 0, by);
    await publish(db, "p1", by);
    await unpublish(db, "p1", by);
    const rec = await getRecord(db, "p1");
    expect(rec?.published).toBeNull();
    expect(rec?.publishedAt).toBeNull();
    expect(rec?.draft.subtitle).toBe("Hello");
    await expect(publish(db, "nothing", by)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a stale save instead of overwriting another editor's work", async () => {
    await saveDraft(db, "p1", { subtitle: "A" }, 0, by);
    await saveDraft(db, "p1", { subtitle: "B" }, 1, "other@x.test");
    await expect(saveDraft(db, "p1", { subtitle: "C" }, 1, by)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(saveDraft(db, "p2", { subtitle: "new" }, 5, by)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getRecord(db, "p1"))?.draft.subtitle).toBe("B");
  });

  it("allows only one content record per product", async () => {
    await Promise.all([saveDraft(db, "p1", { subtitle: "1" }, 0, by).catch(() => null), saveDraft(db, "p1", { subtitle: "2" }, 0, by).catch(() => null)]);
    expect(await db.productContent.count()).toBe(1);
  });

  it("returns readable problems for invalid input and never saves it", async () => {
    const e = await saveDraft(db, "p1", { features: [{ title: "", description: "x" }] }, 0, by).catch((x) => x);
    expect(e).toBeInstanceOf(ContentError);
    expect(e.code).toBe("INVALID");
    expect(e.issues.join(" ")).toMatch(/feature/i);
    expect(await db.productContent.count()).toBe(0);
    await expect(saveDraft(db, "p1", { related: ["p1"] }, 0, by)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("stores images in order and refuses images that belong to another product", async () => {
    const a = await addImage(db, "p1", png());
    const b = await addImage(db, "p1", jpeg());
    const other = await addImage(db, "p2", png());
    await saveDraft(db, "p1", { gallery: [{ id: b, alt: "Back", caption: "" }, { id: a, alt: "Front", caption: "Hero" }] }, 0, by);
    expect((await getRecord(db, "p1"))?.draft.gallery.map((g) => g.id)).toEqual([b, a]);
    await expect(saveDraft(db, "p1", { gallery: [{ id: other, alt: "", caption: "" }] }, 1, by)).rejects.toMatchObject({ code: "INVALID" });
    await expect(saveDraft(db, "p1", { gallery: [{ id: "doesnotexist1", alt: "", caption: "" }] }, 1, by)).rejects.toMatchObject({ code: "INVALID" });
    const asset = await db.mediaAsset.findUnique({ where: { id: a } });
    expect(asset?.contentType).toBe("image/png");
    expect(Buffer.from(asset!.data).subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("cleans up uploads nobody uses, but not recent ones or ones the live page still shows", async () => {
    const live = await addImage(db, "p1", png());
    await saveDraft(db, "p1", { gallery: [{ id: live, alt: "", caption: "" }] }, 0, by);
    await publish(db, "p1", by);
    await saveDraft(db, "p1", { gallery: [] }, 1, by); // draft drops it, the published copy still uses it
    const stale = await addImage(db, "p1", png());
    const fresh = await addImage(db, "p1", png());
    await db.mediaAsset.update({ where: { id: stale }, data: { createdAt: new Date(Date.now() - 2 * 3600_000) } });
    await db.mediaAsset.update({ where: { id: live }, data: { createdAt: new Date(Date.now() - 2 * 3600_000) } });
    await cleanupAssets(db, "p1");
    expect(await db.mediaAsset.findUnique({ where: { id: stale } })).toBeNull();
    expect(await db.mediaAsset.findUnique({ where: { id: fresh } })).not.toBeNull();
    expect(await db.mediaAsset.findUnique({ where: { id: live } })).not.toBeNull();
  });
});

describe("migration from the first content version", () => {
  it("turns legacy rows into live drafts (checked on a throw-away database)", async () => {
    const legacy = new PGlite();
    const dir = path.resolve(__dirname, "../../prisma/migrations");
    const names = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()).sort();
    for (const m of names.filter((n) => n < "20261022")) await legacy.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    await legacy.exec(`INSERT INTO "ProductContent" ("erpItemId","description","imageIds","updatedAt") VALUES ('old1', E'Line one <b>\\nLine two', ARRAY['abcdefghij1','abcdefghij2'], now())`);
    for (const m of names.filter((n) => n >= "20261022")) await legacy.exec(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    const row = (await legacy.query<{ draft: { descriptionHtml: string; gallery: { id: string }[] }; published: unknown }>(`SELECT draft, published FROM "ProductContent" WHERE "erpItemId"='old1'`)).rows[0];
    expect(row.published).toEqual(row.draft);
    expect(row.draft.gallery.map((g) => g.id)).toEqual(["abcdefghij1", "abcdefghij2"]);
    expect(row.draft.descriptionHtml).toBe("<p>Line one &lt;b&gt;</p><p>Line two</p>");
    expect(sanitizeHtml(row.draft.descriptionHtml)).toBe(row.draft.descriptionHtml);
    await legacy.close();
  }, 20_000);
});

describe("storefront overlay", () => {
  it("never changes name, SKU, price, stock or availability", () => {
    const doc = contentDocSchema.parse({ displayTitle: "Pretty title", descriptionHtml: "<p>Website text</p>", gallery: [{ id: "abcdefghij1", alt: "x", caption: "" }] });
    const out = applyContent(product({ sku: "SKU-1", price: 100, salePrice: 90 }), doc);
    expect(out).toMatchObject({ name: "Phone", sku: "SKU-1", price: 100, salePrice: 90, purchasableQuantity: 5, available: true });
    expect(out.images).toEqual(["/api/media/abcdefghij1"]);
    expect(out.description).toBe("Website text");
    expect(out.content?.displayTitle).toBe("Pretty title");
  });

  it("falls back to the ERP's images and description for anything left empty", () => {
    const out = applyContent(product(), emptyDoc());
    expect(out.images).toEqual(["https://erp/x.jpg"]);
    expect(out.description).toBe("ERP text");
    expect(applyContent(product(), undefined)).toEqual(product());
  });

  it("is applied afresh to every ERP product, so an ERP sync cannot remove it", () => {
    const doc = contentDocSchema.parse({ subtitle: "Kept" });
    const afterSync = applyContent(product({ price: 120, purchasableQuantity: 1, updatedAt: "2026-02-01" }), doc);
    expect(afterSync.content?.subtitle).toBe("Kept");
    expect(afterSync).toMatchObject({ price: 120, purchasableQuantity: 1 }); // new ERP numbers win
  });
});
