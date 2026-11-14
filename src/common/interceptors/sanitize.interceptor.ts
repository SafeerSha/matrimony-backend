import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { sanitizeObject, containsMaliciousPattern } from '../utils/sanitize.util';

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SecuritySanitizer');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();

    if (req) {
      // 1. Sanitize request body if present
      if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        req.body = sanitizeObject(req.body);
      }

      // 2. Sanitize request query parameters if present
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
      }

      // 3. Sanitize request URL params if present
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params);
      }
    }

    return next.handle();
  }
}
