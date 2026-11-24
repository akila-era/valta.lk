-- Anonymous storefront funnel events (see StorefrontEvent in schema.prisma). Additive only: one new enum, one new table,
-- indexes and CHECK constraints. No existing table, column or row is changed.

-- CreateEnum
CREATE TYPE "StorefrontEventType" AS ENUM ('PRODUCT_VIEW', 'PRODUCT_CLICK', 'ADD_TO_CART', 'CHECKOUT_START', 'ORDER_PLACED');

-- CreateTable
CREATE TABLE "StorefrontEvent" (
    "id" TEXT NOT NULL,
    "type" "StorefrontEventType" NOT NULL,
    "visitId" VARCHAR(64) NOT NULL,
    "erpItemId" VARCHAR(64),
    "variantKey" VARCHAR(128),
    "placement" VARCHAR(32),
    "quantity" INTEGER,
    "externalRef" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontEvent_pkey" PRIMARY KEY ("id"),
    -- An order reference appears on ORDER_PLACED rows only, and every ORDER_PLACED row has one. With the unique index
    -- below this makes "order placed" idempotent: one row per order, however often the browser reports it.
    CONSTRAINT "StorefrontEvent_orderRef_check" CHECK (("type" = 'ORDER_PLACED') = ("externalRef" IS NOT NULL)),
    CONSTRAINT "StorefrontEvent_quantity_check" CHECK ("quantity" IS NULL OR "quantity" BETWEEN 1 AND 99)
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontEvent_externalRef_key" ON "StorefrontEvent"("externalRef");

-- CreateIndex
CREATE INDEX "StorefrontEvent_type_createdAt_idx" ON "StorefrontEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontEvent_erpItemId_type_createdAt_idx" ON "StorefrontEvent"("erpItemId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "StorefrontEvent_visitId_idx" ON "StorefrontEvent"("visitId");

-- CreateIndex (retention: rows older than 13 months are found by creation time)
CREATE INDEX "StorefrontEvent_createdAt_idx" ON "StorefrontEvent"("createdAt");
