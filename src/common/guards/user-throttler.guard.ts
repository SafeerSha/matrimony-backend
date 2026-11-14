import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerLimitDetail, ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';

/**
 * Extracts and sanitizes the client IP address.
 * Validates against IPv4/IPv6 patterns to avoid header injection.
 */
function extractClientIp(req: Record<string, any>): string {
  const candidate =
    req.headers?.['cf-connecting-ip'] ||
    req.headers?.['x-real-ip'] ||
    (typeof req.headers?.['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : null) ||
    (req.ips && req.ips.length > 0 ? req.ips[0] : req.ip) ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  const clean = String(candidate).trim();
  const normalized = clean.replace(/^::ffff:/, '');
  if (/^[a-fA-F0-9:.]+$/.test(normalized) && normalized.length <= 45) {
    return normalized;
  }
  return '127.0.0.1';
}

/**
 * Extracts normalized user identity (email, phone, user id) if present.
 */
function extractIdentifier(req: Record<string, any>): string | null {
  const raw =
    req.body?.phone ||
    req.body?.email ||
    req.body?.identifier ||
    req.user?.sub ||
    req.user?.id;
  if (!raw) return null;
  const str = String(raw).trim().toLowerCase();
  return str.length > 0 && str.length <= 150 ? str : null;
}

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } = requestProps;
    const { req, res } = this.getRequestResponse(context);

    const throttlerName = throttler.name ?? 'default';

    // 1. IP-level rate limiting: guaranteed protection against IP DDoS / volumetric floods
    const clientIp = extractClientIp(req);
    const ipKey = generateKey(context, `ip_${clientIp}`, throttlerName);
    const ipRecord = await this.storageService.increment(
      ipKey,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );

    if (ipRecord.isBlocked) {
      const waitSec = Math.ceil(ipRecord.timeToBlockExpire / 1000);
      this.setResponseHeader(res, 'Retry-After', waitSec);
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key: ipKey,
        tracker: clientIp,
        totalHits: ipRecord.totalHits,
        timeToExpire: ipRecord.timeToExpire,
        isBlocked: true,
        timeToBlockExpire: ipRecord.timeToBlockExpire,
      });
      return false;
    }

    // 2. Identifier rate limiting: protects specific accounts from distributed brute-force attacks
    const identifier = extractIdentifier(req);
    if (identifier) {
      const idKey = generateKey(context, `id_${identifier}`, throttlerName);
      const idRecord = await this.storageService.increment(
        idKey,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );

      if (idRecord.isBlocked) {
        const waitSec = Math.ceil(idRecord.timeToBlockExpire / 1000);
        this.setResponseHeader(res, 'Retry-After', waitSec);
        await this.throwThrottlingException(context, {
          limit,
          ttl,
          key: idKey,
          tracker: identifier,
          totalHits: idRecord.totalHits,
          timeToExpire: idRecord.timeToExpire,
          isBlocked: true,
          timeToBlockExpire: idRecord.timeToBlockExpire,
        });
        return false;
      }
    }

    return true;
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
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
