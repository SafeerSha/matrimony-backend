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
