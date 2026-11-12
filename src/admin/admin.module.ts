import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsService } from './analytics.service';
import { RevenueService } from './revenue.service';
import { RevenueController } from './revenue.controller';
import { StorageModule } from '../storage/storage.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ChatModule } from '../chat/chat.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [StorageModule, SubscriptionModule, UsersModule, forwardRef(() => ChatModule)],
  providers: [AdminService, AnalyticsService, RevenueService],
  controllers: [AdminController, RevenueController],
  exports: [AdminService, AnalyticsService, RevenueService],
})
export class AdminModule {}
