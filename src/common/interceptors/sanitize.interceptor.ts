import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { sanitizeObject } from '../utils/sanitize.util';

/**
 * In-place sanitization helper for objects that may have non-writable or getter-only properties (like req.query).
 */
function sanitizeInPlace(target: Record<string, any>) {
  if (!target || typeof target !== 'object' || Buffer.isBuffer(target)) {
    return;
  }
  try {
    const cleaned = sanitizeObject(target);
    for (const key of Object.keys(target)) {
      if (key in cleaned) {
        target[key] = cleaned[key];
      } else {
        delete target[key];
      }
    }
    for (const [key, value] of Object.entries(cleaned)) {
      target[key] = value;
    }
  } catch {
    // If mutation fails on read-only object, do not throw 500
  }
}

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SecuritySanitizer');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();

    if (req) {
      // 1. Sanitize request body if present (in-place to prevent stream/reference issues)
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        sanitizeInPlace(req.body);
      }

      // 2. Sanitize request query parameters in-place (req.query is getter-only on IncomingMessage)
      if (req.query && typeof req.query === 'object') {
        sanitizeInPlace(req.query);
      }

      // 3. Sanitize request URL params in-place
      if (req.params && typeof req.params === 'object') {
        sanitizeInPlace(req.params);
      }
    }

    return next.handle();
  }
}
