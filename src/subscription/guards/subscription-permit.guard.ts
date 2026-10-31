import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../subscription.service';

export const REQUIRE_PERMIT_KEY = 'require_chat_permit';
export const RequirePermit = () => SetMetadata(REQUIRE_PERMIT_KEY, true);

@Injectable()
export class SubscriptionPermitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPermitRequired = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_PERMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If endpoint doesn't explicitly require a permit, allow through
    if (!isPermitRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;

    if (!userId) {
      throw new ForbiddenException('User is not authenticated.');
    }

    const hasPermit = await this.subscriptionService.hasActiveChatPermit(userId);

    if (!hasPermit) {
      throw new ForbiddenException({
        code: 'PERMIT_REQUIRED',
        message: 'An active Chat Permit is required to initiate chat or send messages.',
      });
    }

    return true;
  }
}

