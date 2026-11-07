ALTER TABLE "ChatConversation" ADD COLUMN "customerId" TEXT;

CREATE INDEX "ChatConversation_customerId_idx" ON "ChatConversation"("customerId");
