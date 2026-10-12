-- AlterTable
ALTER TABLE "User" 
  ADD COLUMN IF NOT EXISTS "isPasswordEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- Backfill existing users who already have passwordHash set
UPDATE "User" 
  SET "isPasswordEnabled" = true,
      "passwordChangedAt" = COALESCE("passwordChangedAt", "updatedAt")
  WHERE "passwordHash" IS NOT NULL;
