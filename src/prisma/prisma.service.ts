import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
      await this.ensureCoreTablesExist();
    } catch (err: any) {
      this.logger.error(`Database connection failed on startup: ${err.message}`);
    }
  }

  async ensureCoreTablesExist() {
    try {
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ContactUnlock" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "targetUserId" TEXT NOT NULL,
            "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "ContactUnlock_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "ContactUnlock_userId_targetUserId_key" ON "ContactUnlock"("userId", "targetUserId");
        CREATE INDEX IF NOT EXISTS "ContactUnlock_userId_idx" ON "ContactUnlock"("userId");
        CREATE INDEX IF NOT EXISTS "ContactUnlock_targetUserId_idx" ON "ContactUnlock"("targetUserId");

        CREATE TABLE IF NOT EXISTS "Feedback" (
            "id" TEXT NOT NULL,
            "userId" TEXT,
            "rating" INTEGER NOT NULL,
            "type" TEXT NOT NULL,
            "message" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
            "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
            "rmNotes" TEXT,
            "reviewedById" TEXT,
            "reviewedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
        );
        ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
        ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "rmNotes" TEXT;
        ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
        ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
        CREATE INDEX IF NOT EXISTS "Feedback_status_idx" ON "Feedback"("status");
        CREATE INDEX IF NOT EXISTS "Feedback_priority_idx" ON "Feedback"("priority");
        ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "friendshipGoals" TEXT;
        ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "genderPreference" TEXT;
        ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "nakshatra" TEXT;
        ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "habits" TEXT;
        CREATE TABLE IF NOT EXISTS "MessageReaction" (
            "id" TEXT NOT NULL,
            "messageId" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "emoji" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");
        CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
        CREATE INDEX IF NOT EXISTS "MessageReaction_userId_idx" ON "MessageReaction"("userId");
        CREATE TABLE IF NOT EXISTS "ProfileVisit" (
            "id" TEXT NOT NULL,
            "visitorId" TEXT NOT NULL,
            "viewedUserId" TEXT NOT NULL,
            "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "ProfileVisit_visitorId_viewedUserId_key" ON "ProfileVisit"("visitorId", "viewedUserId");
        CREATE INDEX IF NOT EXISTS "ProfileVisit_viewedUserId_visitedAt_idx" ON "ProfileVisit"("viewedUserId", "visitedAt" DESC);
        CREATE INDEX IF NOT EXISTS "ProfileVisit_visitorId_idx" ON "ProfileVisit"("visitorId");
      `);
      this.logger.log('Core tables checked and ensured.');
    } catch (e: any) {
      this.logger.warn(`Could not ensure core tables: ${e?.message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
