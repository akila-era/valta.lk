/**
 * Demo data for a LOCAL preview, laid out like a big accessories store (ugreen.lk). Pair it with the mock ERP's demo
 * catalogue (MOCK_ERP_DEMO=1), which supplies the products, prices and stock.
 *
 * Fills the website's own data: Store Details (top bar, contact, hours, social links, payment badges), the KOKO /
 * Mintpay line, Hot Deals (the demo items on sale) and approved sample product reviews.
 *
 * Refuses any database that is not on this computer unless run with --server. With --server (a public demo site) it
 * writes only the KOKO / Mintpay line and Hot Deals: the sample reviews would look like real customers' words and the
 * sample phone numbers could belong to real people, so staff enter real contact details in the admin instead.
 * Run again at any time; it replaces what it wrote before.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5498/postgres?sslmode=disable npx tsx scripts/seed-demo.ts
 *   docker compose run --rm --no-deps web npx tsx scripts/seed-demo.ts --server      (on the demo server)
 */
import { Client } from "pg";
import { DEMO_CATALOGUE } from "../tests/mock-erp/demo-catalogue";

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
    ? `Demo data ready: store details, KOKO / Mintpay line, ${onSale.length} hot deals, ${count} reviews.`
    : `Demo data ready: KOKO / Mintpay line and ${onSale.length} hot deals (no sample reviews or contact details on a server).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
