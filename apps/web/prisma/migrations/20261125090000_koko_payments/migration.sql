-- CreateEnum
CREATE TYPE "KokoPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "WebOrder" ADD COLUMN "awaitingPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentStatus" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KokoPayment" (
    "id" TEXT NOT NULL,
    "kokoOrderId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "KokoPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "trnId" TEXT,
    "rawCallback" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KokoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KokoPayment_kokoOrderId_key" ON "KokoPayment"("kokoOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "KokoPayment_orderRef_attemptNo_key" ON "KokoPayment"("orderRef", "attemptNo");

-- CreateIndex
CREATE INDEX "KokoPayment_status_createdAt_idx" ON "KokoPayment"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "KokoPayment" ADD CONSTRAINT "KokoPayment_orderRef_fkey" FOREIGN KEY ("orderRef") REFERENCES "WebOrder"("externalRef") ON DELETE CASCADE ON UPDATE CASCADE;
