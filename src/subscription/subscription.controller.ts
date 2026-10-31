import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('plans')
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@CurrentUser() user: any) {
    const userId = user?.sub || user?.id;
    return this.subscriptionService.getUserSubscription(userId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('activate')
  async activatePermit(
    @CurrentUser() user: any,
    @Body() body: { tier: string; paymentId?: string },
  ) {
    const userId = user?.sub || user?.id;
    if (!body?.tier) {
      throw new BadRequestException('Plan tier is required (e.g. BASIC, STANDARD, PLUS, ELITE).');
    }

    return this.subscriptionService.activatePermit(userId, body.tier, {
      paymentId: body.paymentId,
    });
  }
}

