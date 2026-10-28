-- CreateEnum
CREATE TYPE "PostAppealStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PostAppeal" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "PostAppealStatus" NOT NULL DEFAULT 'PENDING',
    "moderatorId" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostAppeal_authorId_idx" ON "PostAppeal"("authorId");

-- CreateIndex
CREATE INDEX "PostAppeal_postId_idx" ON "PostAppeal"("postId");

-- CreateIndex
CREATE INDEX "PostAppeal_status_createdAt_idx" ON "PostAppeal"("status", "createdAt" DESC);

-- CreateIndex: Partial Unique Index enforcing at most one active (PENDING or UNDER_REVIEW) appeal per moderated post
CREATE UNIQUE INDEX "post_appeals_active_unique_idx" ON "PostAppeal"("postId") WHERE "status" IN ('PENDING', 'UNDER_REVIEW');

-- AddForeignKey
ALTER TABLE "PostAppeal" ADD CONSTRAINT "PostAppeal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAppeal" ADD CONSTRAINT "PostAppeal_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

