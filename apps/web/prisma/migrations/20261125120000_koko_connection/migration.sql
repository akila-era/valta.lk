-- CreateTable
CREATE TABLE "KokoConnectionConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "apiKeyHint" TEXT NOT NULL,
    "pluginName" TEXT NOT NULL,
    "pluginVersion" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "appUrl" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KokoConnectionConfig_pkey" PRIMARY KEY ("id")
);
