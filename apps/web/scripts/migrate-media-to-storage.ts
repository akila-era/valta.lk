/**
 * Moves images that still live in the website database (product uploads and banner pictures) into the private object
 * storage, then empties their database bytes. Safe to re-run: rows already moved are skipped, and a row is only emptied
 * after its object has been read back with the same size.
 *
 *   npm run media:migrate              # does the move
 *   npm run media:migrate -- --dry-run # only counts what would move
 *
 * Needs DATABASE_URL and S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY in the environment. Run it against
 * production only with the owner's approval, ideally after a database backup.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

async function main() {
  const dry = process.argv.includes("--dry-run");
  const { getDb } = await import("../src/lib/db");
  const { getObject, putObject, storageConfigured } = await import("../src/lib/media/storage");
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is not set.");
  if (!storageConfigured()) throw new Error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY must all be set.");

  let moved = 0;
  let failed = 0;

  const assets = await db.mediaAsset.findMany({ where: { storageKey: null, data: { not: null } }, select: { id: true, erpItemId: true, contentType: true, size: true } });
  console.log(`${assets.length} product image(s) in the database.`);
  for (const a of assets) {
    if (dry) continue;
    try {
      const row = await db.mediaAsset.findUnique({ where: { id: a.id }, select: { data: true } });
      if (!row?.data) continue;
      const key = `products/${a.erpItemId}/${a.id}`;
      await putObject(key, row.data, a.contentType);
      const back = await getObject(key);
      if (!back || back.length !== row.data.length) throw new Error("read-back mismatch");
      await db.mediaAsset.update({ where: { id: a.id }, data: { storageKey: key, data: null } });
      moved++;
    } catch (e) {
      failed++;
      console.error(`  product image ${a.id}: ${(e as Error).message}`);
    }
  }

  const banners = await db.banner.findMany({ where: { imageKey: null, imageData: { not: null } }, select: { id: true, imageType: true } });
  console.log(`${banners.length} banner picture(s) in the database.`);
  for (const b of banners) {
    if (dry) continue;
    try {
      const row = await db.banner.findUnique({ where: { id: b.id }, select: { imageData: true } });
      if (!row?.imageData || !b.imageType) continue;
      const key = `banners/${b.id}`;
      await putObject(key, row.imageData, b.imageType);
      const back = await getObject(key);
      if (!back || back.length !== row.imageData.length) throw new Error("read-back mismatch");
      // updatedAt is part of the public URL (?v=), so leave it alone: the picture itself did not change.
      await db.$executeRaw`UPDATE "Banner" SET "imageKey" = ${key}, "imageData" = NULL WHERE "id" = ${b.id}`;
      moved++;
    } catch (e) {
      failed++;
      console.error(`  banner ${b.id}: ${(e as Error).message}`);
    }
  }

  console.log(dry ? "Dry run: nothing changed." : `Moved ${moved}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
