-- AlterTable Profile
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "employmentStatus" TEXT;

-- AlterTable Preference
ALTER TABLE "Preference" ADD COLUMN IF NOT EXISTS "occupations" TEXT;
ALTER TABLE "Preference" ADD COLUMN IF NOT EXISTS "employmentStatuses" TEXT;
