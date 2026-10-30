import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsService } from './analytics.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [AdminService, AnalyticsService],
  controllers: [AdminController],
  exports: [AdminService, AnalyticsService],
})
export class AdminModule {}
