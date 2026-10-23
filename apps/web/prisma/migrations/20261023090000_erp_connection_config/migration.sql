CREATE TABLE "ErpConnectionConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseUrl" TEXT NOT NULL,
    "credentialEnc" TEXT NOT NULL,
    "credentialHint" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpConnectionConfig_pkey" PRIMARY KEY ("id")
);
