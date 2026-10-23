-- CreateEnum
CREATE TYPE "AccessoryKind" AS ENUM ('BACK_COVER', 'SCREEN_PROTECTOR', 'LENS_PROTECTOR', 'CHARGER', 'CABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "WebOrder" ADD COLUMN "priceBreakdown" JSONB;

-- CreateTable
CREATE TABLE "AccessoryLink" (
    "id" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "accessoryItemId" TEXT NOT NULL,
    "kind" "AccessoryKind" NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "accessoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountCents" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bundleAccessoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "customerId" TEXT,
    "discount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessoryLink_sourceItemId_idx" ON "AccessoryLink"("sourceItemId");

-- CreateIndex
CREATE INDEX "AccessoryLink_accessoryItemId_idx" ON "AccessoryLink"("accessoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessoryLink_sourceItemId_accessoryItemId_key" ON "AccessoryLink"("sourceItemId", "accessoryItemId");

-- CreateIndex
CREATE INDEX "RecommendationEvent_sourceItemId_type_idx" ON "RecommendationEvent"("sourceItemId", "type");

-- CreateIndex
CREATE INDEX "RecommendationEvent_createdAt_idx" ON "RecommendationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PromotionRedemption_externalRef_idx" ON "PromotionRedemption"("externalRef");

-- CreateIndex
CREATE INDEX "PromotionRedemption_customerId_idx" ON "PromotionRedemption"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_promotionId_externalRef_key" ON "PromotionRedemption"("promotionId", "externalRef");

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
