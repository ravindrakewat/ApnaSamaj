-- AlterTable ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN "isDeletedForEveryone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "deletedByUserId" TEXT;

-- AlterTable DirectMessage
ALTER TABLE "DirectMessage" ADD COLUMN "isDeletedForEveryone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DirectMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "DirectMessage" ADD COLUMN "deletedByUserId" TEXT;

-- CreateTable ChatMessageDeletion
CREATE TABLE "ChatMessageDeletion" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable DirectMessageDeletion
CREATE TABLE "DirectMessageDeletion" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessageDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageDeletion_messageId_userId_key" ON "ChatMessageDeletion"("messageId", "userId");
CREATE INDEX "ChatMessageDeletion_userId_idx" ON "ChatMessageDeletion"("userId");
CREATE INDEX "ChatMessageDeletion_messageId_idx" ON "ChatMessageDeletion"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessageDeletion_messageId_userId_key" ON "DirectMessageDeletion"("messageId", "userId");
CREATE INDEX "DirectMessageDeletion_userId_idx" ON "DirectMessageDeletion"("userId");
CREATE INDEX "DirectMessageDeletion_messageId_idx" ON "DirectMessageDeletion"("messageId");

-- AddForeignKey
ALTER TABLE "ChatMessageDeletion" ADD CONSTRAINT "ChatMessageDeletion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageDeletion" ADD CONSTRAINT "ChatMessageDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessageDeletion" ADD CONSTRAINT "DirectMessageDeletion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessageDeletion" ADD CONSTRAINT "DirectMessageDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

