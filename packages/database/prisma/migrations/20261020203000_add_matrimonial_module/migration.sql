-- CreateEnum
CREATE TYPE "MatrimonialProfileStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('NEVER_MARRIED', 'DIVORCED', 'WIDOWED', 'AWAITING_DIVORCE');

-- CreateEnum
CREATE TYPE "ManglikStatus" AS ENUM ('MANGLIK', 'NON_MANGLIK', 'ANSHIK', 'DONT_KNOW');

-- CreateEnum
CREATE TYPE "EmploymentSector" AS ENUM ('PRIVATE_SECTOR', 'GOVERNMENT_PSU', 'BUSINESS_SELF_EMPLOYED', 'DEFENSE', 'NOT_WORKING');

-- CreateEnum
CREATE TYPE "FamilyType" AS ENUM ('NUCLEAR', 'JOINT');

-- CreateEnum
CREATE TYPE "FamilyValues" AS ENUM ('TRADITIONAL', 'MODERATE', 'LIBERAL');

-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('VEGETARIAN', 'NON_VEGETARIAN', 'EGGETARIAN', 'JAIN');

-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('NO', 'YES', 'OCCASIONALLY');

-- CreateEnum
CREATE TYPE "MatrimonialInterestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MATRIMONIAL_INTEREST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'MATRIMONIAL_INTEREST_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'MATRIMONIAL_PROFILE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'MATRIMONIAL_PROFILE_REJECTED';

-- CreateTable
CREATE TABLE "MatrimonialProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MatrimonialProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectionReason" TEXT,
    "maritalStatus" "MaritalStatus" NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "weightKg" INTEGER,
    "motherTongue" TEXT NOT NULL DEFAULT 'Hindi',
    "religion" TEXT NOT NULL DEFAULT 'Hindu',
    "caste" TEXT,
    "subCaste" TEXT,
    "gotra" TEXT,
    "manglik" "ManglikStatus" NOT NULL DEFAULT 'DONT_KNOW',
    "birthTime" TEXT,
    "birthCity" TEXT,
    "rashi" TEXT,
    "nakshatra" TEXT,
    "highestEducation" TEXT NOT NULL,
    "educationDetails" TEXT,
    "employedIn" "EmploymentSector" NOT NULL DEFAULT 'PRIVATE_SECTOR',
    "occupation" TEXT NOT NULL,
    "companyName" TEXT,
    "annualIncome" TEXT NOT NULL,
    "workCity" TEXT,
    "workState" TEXT,
    "workCountry" TEXT NOT NULL DEFAULT 'India',
    "familyType" "FamilyType" NOT NULL DEFAULT 'NUCLEAR',
    "familyValues" "FamilyValues" NOT NULL DEFAULT 'TRADITIONAL',
    "fatherName" TEXT,
    "fatherOccupation" TEXT,
    "motherName" TEXT,
    "motherOccupation" TEXT,
    "brothersCount" INTEGER NOT NULL DEFAULT 0,
    "brothersMarried" INTEGER NOT NULL DEFAULT 0,
    "sistersCount" INTEGER NOT NULL DEFAULT 0,
    "sistersMarried" INTEGER NOT NULL DEFAULT 0,
    "familyNativePlace" TEXT,
    "aboutFamily" TEXT,
    "diet" "DietType" NOT NULL DEFAULT 'VEGETARIAN',
    "smoking" "HabitFrequency" NOT NULL DEFAULT 'NO',
    "drinking" "HabitFrequency" NOT NULL DEFAULT 'NO',
    "aboutMe" TEXT,
    "partnerExpectations" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrimonialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrimonialPartnerPreference" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL DEFAULT 18,
    "maxAge" INTEGER NOT NULL DEFAULT 45,
    "minHeightCm" INTEGER NOT NULL DEFAULT 140,
    "maxHeightCm" INTEGER NOT NULL DEFAULT 210,
    "maritalStatuses" "MaritalStatus"[] DEFAULT ARRAY[]::"MaritalStatus"[],
    "manglik" "ManglikStatus",
    "diet" "DietType",
    "preferredEducations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredOccupations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredStates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minIncome" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrimonialPartnerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrimonialPhoto" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrimonialPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrimonialInterest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "MatrimonialInterestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrimonialInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatrimonialProfile_userId_key" ON "MatrimonialProfile"("userId");

-- CreateIndex
CREATE INDEX "MatrimonialProfile_status_idx" ON "MatrimonialProfile"("status");

-- CreateIndex
CREATE INDEX "MatrimonialProfile_maritalStatus_idx" ON "MatrimonialProfile"("maritalStatus");

-- CreateIndex
CREATE INDEX "MatrimonialProfile_heightCm_idx" ON "MatrimonialProfile"("heightCm");

-- CreateIndex
CREATE INDEX "MatrimonialProfile_diet_idx" ON "MatrimonialProfile"("diet");

-- CreateIndex
CREATE INDEX "MatrimonialProfile_manglik_idx" ON "MatrimonialProfile"("manglik");

-- CreateIndex
CREATE UNIQUE INDEX "MatrimonialPartnerPreference_profileId_key" ON "MatrimonialPartnerPreference"("profileId");

-- CreateIndex
CREATE INDEX "MatrimonialPhoto_profileId_idx" ON "MatrimonialPhoto"("profileId");

-- CreateIndex
CREATE INDEX "MatrimonialPhoto_profileId_isPrimary_idx" ON "MatrimonialPhoto"("profileId", "isPrimary");

-- CreateIndex
CREATE INDEX "MatrimonialInterest_senderId_status_idx" ON "MatrimonialInterest"("senderId", "status");

-- CreateIndex
CREATE INDEX "MatrimonialInterest_receiverId_status_idx" ON "MatrimonialInterest"("receiverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatrimonialInterest_senderId_receiverId_key" ON "MatrimonialInterest"("senderId", "receiverId");

-- AddForeignKey
ALTER TABLE "MatrimonialProfile" ADD CONSTRAINT "MatrimonialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrimonialProfile" ADD CONSTRAINT "MatrimonialProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrimonialPartnerPreference" ADD CONSTRAINT "MatrimonialPartnerPreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatrimonialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrimonialPhoto" ADD CONSTRAINT "MatrimonialPhoto_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatrimonialProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrimonialInterest" ADD CONSTRAINT "MatrimonialInterest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrimonialInterest" ADD CONSTRAINT "MatrimonialInterest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
