CREATE TABLE "BrandLogo" (
    "id" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandLogo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandLogo_brandKey_key" ON "BrandLogo"("brandKey");
