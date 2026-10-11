-- DropIndex
DROP INDEX IF EXISTS "OtpVerification_phone_idx";

-- AlterTable
ALTER TABLE "OtpVerification" 
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'SMS',
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OtpVerification_email_consumed_expiresAt_idx" 
  ON "OtpVerification"("email", "consumed", "expiresAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OtpVerification_userId_fkey'
  ) THEN
    ALTER TABLE "OtpVerification" 
      ADD CONSTRAINT "OtpVerification_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "User"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
