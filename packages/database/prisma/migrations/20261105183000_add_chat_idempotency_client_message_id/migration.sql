-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "clientMessageId" TEXT;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN "clientMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_groupId_senderId_clientMessageId_key" ON "ChatMessage"("groupId", "senderId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_conversationId_senderId_clientMessageId_key" ON "DirectMessage"("conversationId", "senderId", "clientMessageId");

