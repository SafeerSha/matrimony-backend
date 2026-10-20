import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const rawIp =
      req.headers?.['cf-connecting-ip'] ||
      req.headers?.['x-real-ip'] ||
      (typeof req.headers?.['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : null) ||
      (req.ips && req.ips.length > 0 ? req.ips[0] : req.ip) ||
      req.socket?.remoteAddress ||
      '127.0.0.1';

    // Extract individual user identifier if present (phone, email, identifier, or authenticated user ID)
    const rawIdentifier =
      req.body?.phone ||
      req.body?.email ||
      req.body?.identifier ||
      req.user?.sub ||
      req.user?.id;

    const normalizedIdentifier = rawIdentifier ? String(rawIdentifier).trim().toLowerCase() : null;

    // Isolate rate limits per user identifier and client IP
    const tracker = normalizedIdentifier ? `${rawIp}_${normalizedIdentifier}` : rawIp;
    return Promise.resolve(tracker);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const timeToWaitSec = Math.ceil((throttlerLimitDetail.timeToBlockExpire || 60000) / 1000);
    const friendlyMessage =
      timeToWaitSec > 0 && timeToWaitSec <= 60
        ? `Too many attempts. For your security, please wait ${timeToWaitSec} seconds before requesting again.`
        : `Too many attempts. For your security, please wait a minute before requesting again.`;

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: friendlyMessage,
        error: 'Too Many Requests',
        retryAfter: timeToWaitSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
