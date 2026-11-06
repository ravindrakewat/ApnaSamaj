-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "ChatAttachment" ADD COLUMN "duration" INTEGER;
