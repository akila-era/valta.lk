-- Images can now live in the private object storage; existing rows keep their bytes until migrated.
ALTER TABLE "MediaAsset" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "MediaAsset" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Banner" ADD COLUMN "imageKey" TEXT;
