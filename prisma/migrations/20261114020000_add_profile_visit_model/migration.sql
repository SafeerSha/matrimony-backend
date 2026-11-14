-- CreateTable
CREATE TABLE IF NOT EXISTS "ProfileVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "viewedUserId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProfileVisit_visitorId_viewedUserId_key" ON "ProfileVisit"("visitorId", "viewedUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProfileVisit_viewedUserId_visitedAt_idx" ON "ProfileVisit"("viewedUserId", "visitedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProfileVisit_visitorId_idx" ON "ProfileVisit"("visitorId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProfileVisit_visitorId_fkey'
    ) THEN
        ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProfileVisit_viewedUserId_fkey'
    ) THEN
        ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_viewedUserId_fkey" FOREIGN KEY ("viewedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

