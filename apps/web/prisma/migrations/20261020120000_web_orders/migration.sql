-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "WebOrder" (
    "externalRef" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ONLINE_STORE',
    "customerId" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "deliveryCharge" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "payload" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "accessHash" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "erpStatus" TEXT,
    "erpPaymentStatus" TEXT,
    "erpStatusAt" TIMESTAMP(3),
    "trackingNumber" TEXT,
    "carrierName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebOrder_pkey" PRIMARY KEY ("externalRef")
);

-- CreateIndex
CREATE INDEX "WebOrder_syncStatus_nextAttemptAt_idx" ON "WebOrder"("syncStatus", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebOrder_createdAt_idx" ON "WebOrder"("createdAt");

-- CreateIndex
CREATE INDEX "WebOrder_customerId_createdAt_idx" ON "WebOrder"("customerId", "createdAt");


-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
