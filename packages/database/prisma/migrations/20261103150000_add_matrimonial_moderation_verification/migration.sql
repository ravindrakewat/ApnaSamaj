-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATRIMONIAL_PROFILE_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATRIMONIAL_DOCUMENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATRIMONIAL_DOCUMENT_REJECTED';

-- AlterEnum
ALTER TYPE "MatrimonialProfileStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

-- CreateEnum
CREATE TYPE "MatrimonialDocumentType" AS ENUM ('GOVERNMENT_ID', 'EDUCATION_PROOF', 'OCCUPATION_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "MatrimonialDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MatrimonialReportReason" AS ENUM ('FAKE_PROFILE', 'INCORRECT_INFORMATION', 'MISLEADING_PHOTOS', 'SUSPICIOUS_ACTIVITY', 'HARASSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MatrimonialReportStatus" AS ENUM ('PENDING', 'UNDER_INVESTIGATION', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "MatrimonialProfile" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MatrimonialDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "documentType" "MatrimonialDocumentType" NOT NULL,
    "documentName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "MatrimonialDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrimonialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MatrimonialReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedProfileId" TEXT NOT NULL,
    "reason" "MatrimonialReportReason" NOT NULL,
    "explanation" TEXT,
    "status" "MatrimonialReportStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrimonialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MatrimonialBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrimonialBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MatrimonialDocument_profileId_idx" ON "MatrimonialDocument"("profileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MatrimonialDocument_status_idx" ON "MatrimonialDocument"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MatrimonialReport_reportedProfileId_idx" ON "MatrimonialReport"("reportedProfileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MatrimonialReport_status_idx" ON "MatrimonialReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MatrimonialReport_reporterId_reportedProfileId_key" ON "MatrimonialReport"("reporterId", "reportedProfileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MatrimonialBlock_blockerId_idx" ON "MatrimonialBlock"("blockerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MatrimonialBlock_blockedUserId_idx" ON "MatrimonialBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MatrimonialBlock_blockerId_blockedUserId_key" ON "MatrimonialBlock"("blockerId", "blockedUserId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialProfile_verifiedById_fkey') THEN
        ALTER TABLE "MatrimonialProfile" ADD CONSTRAINT "MatrimonialProfile_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialDocument_profileId_fkey') THEN
        ALTER TABLE "MatrimonialDocument" ADD CONSTRAINT "MatrimonialDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatrimonialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialDocument_reviewedById_fkey') THEN
        ALTER TABLE "MatrimonialDocument" ADD CONSTRAINT "MatrimonialDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialReport_reporterId_fkey') THEN
        ALTER TABLE "MatrimonialReport" ADD CONSTRAINT "MatrimonialReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialReport_reportedProfileId_fkey') THEN
        ALTER TABLE "MatrimonialReport" ADD CONSTRAINT "MatrimonialReport_reportedProfileId_fkey" FOREIGN KEY ("reportedProfileId") REFERENCES "MatrimonialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialReport_resolvedById_fkey') THEN
        ALTER TABLE "MatrimonialReport" ADD CONSTRAINT "MatrimonialReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialBlock_blockerId_fkey') THEN
        ALTER TABLE "MatrimonialBlock" ADD CONSTRAINT "MatrimonialBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatrimonialBlock_blockedUserId_fkey') THEN
        ALTER TABLE "MatrimonialBlock" ADD CONSTRAINT "MatrimonialBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

