/**
 * Demo data for a LOCAL preview, laid out like a big accessories store (ugreen.lk). Pair it with the mock ERP's demo
 * catalogue (MOCK_ERP_DEMO=1), which supplies the products, prices and stock.
 *
 * Fills the website's own data: Store Details (top bar, contact, hours, social links, payment badges, delivery lines),
 * the KOKO / Mintpay line, short lines for the categories, Hot Deals (the demo items on sale) and approved sample
 * product reviews, and product details (description, key points, specifications) for every demo product, saved as
 * published website content; a product staff have edited in the admin is left as they made it. The Google rating is left empty: only the store's real rating belongs there.
 *
 * Refuses any database that is not on this computer unless run with --server. With --server (a public demo site) it
 * writes only the KOKO / Mintpay line, Hot Deals and the product details: the sample reviews would look like real customers' words and the
 * sample phone numbers could belong to real people, so staff enter real contact details in the admin instead.
 * Run again at any time; it replaces what it wrote before.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5498/postgres?sslmode=disable npx tsx scripts/seed-demo.ts
 *   docker compose run --rm --no-deps web npx tsx scripts/seed-demo.ts --server      (on the demo server)
 */
import { Client } from "pg";
import { DEMO_CATALOGUE } from "../tests/mock-erp/demo-catalogue";
import { contentDocSchema } from "../src/lib/content/schema";
import { demoDetails } from "./demo-details";

const itemId = (n: number) => `cm0item${String(n).padStart(8, "0")}`;
const BY = "demo-seed";

const STORE_INFO = {
  topLine: "VOLTA.LK Sri Lanka Official Store",
  phone: "077 123 4567",
  phone2: "011 234 5678",
  whatsapp: "+94 77 123 4567",
  email: "info@volta.lk",
  address: "123 Galle Road, Colombo 03, Sri Lanka",
  mapUrl: "https://maps.google.com/?q=Galle+Road+Colombo+03",
  hours: ["Mon - Sat: 9:00 AM - 7:00 PM", "Sunday: 10:00 AM - 4:00 PM"],
  social: { facebook: "https://www.facebook.com/", instagram: "https://www.instagram.com/", tiktok: "https://www.tiktok.com/", youtube: "https://www.youtube.com/" },
  payments: ["koko", "mintpay", "visa", "mastercard", "bank", "cod"],
  deliveryTime: "Islandwide delivery in 3 to 4 working days",
  pickupInfo: "Store pickup orders are ready within 1 to 2 hours during business hours",
  // Local preview only (never seeded on a server): a sample account so Direct bank transfer appears at checkout.
  bankName: "Demo Bank",
  bankBranch: "Colombo 03",
  bankAccountName: "VOLTA.LK Demo",
  bankAccountNumber: "0000 1111 2222",
};

/** Short lines for the homepage range tiles (category slug -> line). */
const TAGLINES: Record<string, string> = {
  "power-banks": "Power up anywhere",
  "charging-adapters": "Power up fast",
  cables: "Strong and durable",
  "headphones-earphones": "Sound for every day",
  "hubs-docks": "More ports, less clutter",
  "wireless-chargers": "Just put it down",
};

const REVIEWS: [number, string, string][] = [
  [5, "Nimal P.", "Charges my phone twice over and still fits in my pocket. Delivery was quick too."],
  [5, "Shanika R.", "Exactly as described. Well packed and the price was better than other shops."],
  [4, "Kasun D.", "Works well. Gets a little warm when fast charging, but that is normal."],
  [5, "Dilini W.", "Second one I have bought. Cash on delivery made it easy."],
  [4, "Ruwan S.", "Good build quality. Would like a longer cable in the box."],
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const server = process.argv.includes("--server");
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!local && !server) {
    console.error("Refusing to seed: DATABASE_URL must point to a database on this computer (127.0.0.1 or localhost), or pass --server.");
    process.exit(1);
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  const setting = (key: string, value: unknown) =>
    db.query(
      `INSERT INTO "StoreSetting" (key, value, "updatedBy", "updatedAt") VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()`,
      [key, JSON.stringify(value), BY],
    );

  if (local) await setting("store-info", STORE_INFO);
  await setting("category-taglines", TAGLINES);
  await setting("instalments", { enabled: true, providers: ["koko", "mintpay"], parts: 3 });

  // Hot Deals: the demo items that are on sale, cheapest saving last.
  const onSale = DEMO_CATALOGUE.map((d, i) => ({ d, id: itemId(i + 1) })).filter((x) => x.d.sale && (x.d.stock ?? 25) > 0);
  await db.query(`DELETE FROM "HotDeal" WHERE "updatedBy" = $1`, [BY]);
  for (const [n, x] of onSale.entries()) {
    await db.query(
      `INSERT INTO "HotDeal" (id, "erpItemId", "sortOrder", "startsAt", active, "updatedBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now() - interval '1 day', true, $4, now(), now())
       ON CONFLICT ("erpItemId") DO UPDATE SET "sortOrder" = EXCLUDED."sortOrder", active = true, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()`,
      [`demo-deal-${n}`, x.id, n, BY],
    );
  }

  // Product details for every demo product (the made-up demo items only). Rows staff have saved are never replaced.
  let details = 0;
  for (const [i, d] of DEMO_CATALOGUE.entries()) {
    const doc = contentDocSchema.parse(demoDetails(d));
    const r = await db.query(
      `INSERT INTO "ProductContent" ("erpItemId", draft, published, "publishedAt", version, "updatedBy", "updatedAt")
       VALUES ($1, $2, $2, now(), 1, $3, now())
       ON CONFLICT ("erpItemId") DO UPDATE SET draft = EXCLUDED.draft, published = EXCLUDED.published, "publishedAt" = now(),
         version = "ProductContent".version + 1, "updatedAt" = now()
       WHERE "ProductContent"."updatedBy" = $3`,
      [itemId(i + 1), JSON.stringify(doc), BY],
    );
    details += r.rowCount ?? 0;
  }

  // Approved sample reviews on every third demo product (two or three each), so stars show on cards and pages.
  // Local previews only; on a server any reviews this script wrote before are removed.
  await db.query(`DELETE FROM "ProductReview" WHERE "moderatedBy" = $1`, [BY]);
  let count = 0;
  for (let i = 0; local && i < DEMO_CATALOGUE.length; i += 3) {
    const picks = REVIEWS.slice(i % 3, (i % 3) + 2 + (i % 2));
    for (const [k, [rating, name, body]] of picks.entries()) {
      await db.query(
        `INSERT INTO "ProductReview" (id, "erpItemId", rating, body, name, verified, status, "moderatedBy", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, true, 'APPROVED', $6, now() - ($7 || ' days')::interval, now())`,
        [`demo-review-${i}-${k}`, itemId(i + 1), rating, body, name, BY, String(3 + k * 5)],
      );
      count++;
    }
  }

  await db.end();
  console.log(local
    ? `Demo data ready: store details, KOKO / Mintpay line, category lines, ${onSale.length} hot deals, ${count} reviews, details for ${details} products.`
    : `Demo data ready: KOKO / Mintpay line, category lines and ${onSale.length} hot deals, details for ${details} products (no sample reviews or contact details on a server).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
