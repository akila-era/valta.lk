-- CreateEnum
CREATE TYPE "PayzyPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "PayzyPayment" (
    "id" TEXT NOT NULL,
    "payzyOrderId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PayzyPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "requestFields" JSONB NOT NULL,
    "redirectUrl" TEXT,
    "responseCode" TEXT,
    "failureReason" TEXT,
    "rawReturn" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayzyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayzyPayment_payzyOrderId_key" ON "PayzyPayment"("payzyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PayzyPayment_orderRef_attemptNo_key" ON "PayzyPayment"("orderRef", "attemptNo");

-- CreateIndex
CREATE INDEX "PayzyPayment_status_createdAt_idx" ON "PayzyPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PayzyPayment" ADD CONSTRAINT "PayzyPayment_orderRef_fkey" FOREIGN KEY ("orderRef") REFERENCES "WebOrder"("externalRef") ON DELETE CASCADE ON UPDATE CASCADE;
