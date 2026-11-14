-- CreateTable
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- Seed default cooling off period setting if not exists
INSERT INTO "PlatformSetting" ("key", "value", "description", "updatedAt")
VALUES ('COOLING_OFF_PERIOD_ENABLED', 'true', 'Controls whether user deletion 30-day cooling-off period is enforced before re-registering', NOW())
ON CONFLICT ("key") DO NOTHING;
