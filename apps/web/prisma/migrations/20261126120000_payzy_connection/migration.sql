-- CreateTable
CREATE TABLE "PayzyConnectionConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "secretKeyHint" TEXT NOT NULL,
    "testMode" TEXT NOT NULL,
    "appUrl" TEXT NOT NULL,
    "legacyVersionSigning" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayzyConnectionConfig_pkey" PRIMARY KEY ("id")
);
