CREATE TABLE "PreOrderRequest" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "erpItemId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreOrderRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreOrderRequest_ref_key" ON "PreOrderRequest"("ref");

CREATE INDEX "PreOrderRequest_status_createdAt_idx" ON "PreOrderRequest"("status", "createdAt");
