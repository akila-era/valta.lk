-- Accessory links can name one ERP variant. An empty key keeps the existing product-wide link.
ALTER TABLE "AccessoryLink" ADD COLUMN "sourceVariantKey" TEXT NOT NULL DEFAULT '';

DROP INDEX "AccessoryLink_sourceItemId_accessoryItemId_key";

CREATE UNIQUE INDEX "AccessoryLink_sourceItemId_sourceVariantKey_accessoryItemId_key" ON "AccessoryLink"("sourceItemId", "sourceVariantKey", "accessoryItemId");
