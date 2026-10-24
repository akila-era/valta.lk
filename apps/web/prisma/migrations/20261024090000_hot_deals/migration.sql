CREATE TABLE "HotDeal" (
    "id" TEXT NOT NULL,
    "erpItemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotDeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotDeal_erpItemId_key" ON "HotDeal"("erpItemId");

CREATE INDEX "HotDeal_active_sortOrder_idx" ON "HotDeal"("active", "sortOrder");
