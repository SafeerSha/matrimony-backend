import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionPermitGuard } from './guards/subscription-permit.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionPermitGuard],
  exports: [SubscriptionService, SubscriptionPermitGuard],
})
export class SubscriptionModule {}

