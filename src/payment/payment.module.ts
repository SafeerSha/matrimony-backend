import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, SubscriptionModule, NotificationsModule, ConfigModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

