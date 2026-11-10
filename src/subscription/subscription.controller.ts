import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '../common/decorators/throttle.decorator';

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
  @Get('usage')
  async getUsage(@CurrentUser() user: any) {
    const userId = user?.sub || user?.id;
    return this.subscriptionService.getUserSubscription(userId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('contacts/status/:targetId')
  async getContactStatus(
    @CurrentUser() user: any,
    @Param('targetId') targetId: string,
  ) {
    const userId = user?.sub || user?.id;
    if (!userId) {
      throw new BadRequestException('Authenticated user identification missing');
    }
    return this.subscriptionService.getContactStatus(userId, targetId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('contacts/unlock/:targetId')
  async unlockContact(
    @CurrentUser() user: any,
    @Param('targetId') targetId: string,
  ) {
    const userId = user?.sub || user?.id;
    if (!userId) {
      throw new BadRequestException('Authenticated user identification missing');
    }
    return this.subscriptionService.unlockContact(userId, targetId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('contacts/my-unlocked')
  async getMyUnlockedContacts(@CurrentUser() user: any) {
    const userId = user?.sub || user?.id;
    if (!userId) {
      throw new BadRequestException('Authenticated user identification missing');
    }
    return this.subscriptionService.getUnlockedContacts(userId);
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

