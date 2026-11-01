import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsService } from './analytics.service';
import { StorageModule } from '../storage/storage.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [StorageModule, SubscriptionModule],
  providers: [AdminService, AnalyticsService],
  controllers: [AdminController],
  exports: [AdminService, AnalyticsService],
})
export class AdminModule {}
