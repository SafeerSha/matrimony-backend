-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedRmId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rmAssignedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rmAssignedBy" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clientStage" TEXT NOT NULL DEFAULT 'NEW_LEAD';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileRejectionReason" TEXT;

-- CreateTable RmShortlist
CREATE TABLE IF NOT EXISTS "RmShortlist" (
    "id" TEXT NOT NULL,
    "rmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmShortlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable RmInteraction
CREATE TABLE IF NOT EXISTS "RmInteraction" (
    "id" TEXT NOT NULL,
    "rmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'CALL',
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "clientStage" TEXT NOT NULL DEFAULT 'EXPLORING',
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "interactionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable RmFollowUp
CREATE TABLE IF NOT EXISTS "RmFollowUp" (
    "id" TEXT NOT NULL,
    "rmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RmFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RmShortlist_clientId_candidateId_key" ON "RmShortlist"("clientId", "candidateId");
CREATE INDEX IF NOT EXISTS "RmShortlist_rmId_idx" ON "RmShortlist"("rmId");
CREATE INDEX IF NOT EXISTS "RmShortlist_clientId_idx" ON "RmShortlist"("clientId");
CREATE INDEX IF NOT EXISTS "RmShortlist_candidateId_idx" ON "RmShortlist"("candidateId");
CREATE INDEX IF NOT EXISTS "RmShortlist_createdAt_idx" ON "RmShortlist"("createdAt");

CREATE INDEX IF NOT EXISTS "RmInteraction_rmId_interactionAt_idx" ON "RmInteraction"("rmId", "interactionAt" DESC);
CREATE INDEX IF NOT EXISTS "RmInteraction_clientId_interactionAt_idx" ON "RmInteraction"("clientId", "interactionAt" DESC);
CREATE INDEX IF NOT EXISTS "RmInteraction_clientStage_idx" ON "RmInteraction"("clientStage");

CREATE INDEX IF NOT EXISTS "RmFollowUp_rmId_scheduledAt_idx" ON "RmFollowUp"("rmId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "RmFollowUp_clientId_idx" ON "RmFollowUp"("clientId");
CREATE INDEX IF NOT EXISTS "RmFollowUp_status_idx" ON "RmFollowUp"("status");

CREATE INDEX IF NOT EXISTS "User_assignedRmId_idx" ON "User"("assignedRmId");
CREATE INDEX IF NOT EXISTS "User_clientStage_idx" ON "User"("clientStage");

-- AddForeignKey (with do blocks so repeated runs are idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_assignedRmId_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_assignedRmId_fkey" FOREIGN KEY ("assignedRmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmShortlist_rmId_fkey') THEN
        ALTER TABLE "RmShortlist" ADD CONSTRAINT "RmShortlist_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmShortlist_clientId_fkey') THEN
        ALTER TABLE "RmShortlist" ADD CONSTRAINT "RmShortlist_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmShortlist_candidateId_fkey') THEN
        ALTER TABLE "RmShortlist" ADD CONSTRAINT "RmShortlist_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmInteraction_rmId_fkey') THEN
        ALTER TABLE "RmInteraction" ADD CONSTRAINT "RmInteraction_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmInteraction_clientId_fkey') THEN
        ALTER TABLE "RmInteraction" ADD CONSTRAINT "RmInteraction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmFollowUp_rmId_fkey') THEN
        ALTER TABLE "RmFollowUp" ADD CONSTRAINT "RmFollowUp_rmId_fkey" FOREIGN KEY ("rmId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RmFollowUp_clientId_fkey') THEN
        ALTER TABLE "RmFollowUp" ADD CONSTRAINT "RmFollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
