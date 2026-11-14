-- Add response and resolvedAt to SupportInquiry
ALTER TABLE "SupportInquiry" ADD COLUMN IF NOT EXISTS "response" TEXT;
ALTER TABLE "SupportInquiry" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
