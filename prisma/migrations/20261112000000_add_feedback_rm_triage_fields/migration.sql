-- Add RM triage fields to Feedback
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "rmNotes" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_status_idx" ON "Feedback"("status");
CREATE INDEX IF NOT EXISTS "Feedback_priority_idx" ON "Feedback"("priority");

