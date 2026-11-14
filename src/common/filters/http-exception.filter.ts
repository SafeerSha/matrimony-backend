import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalSecurityExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProd = process.env.NODE_ENV === 'production';
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: any = 'An internal error occurred. Please try again later.';
    let errorName = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || message;
        errorName = (res as any).error || exception.name;
      }
    } else {
      // Unhandled / unexpected exception (e.g. Database, Prisma, Network)
      const err = exception as any;
      this.logger.error(
        `[SECURITY] Unhandled ${request.method} ${request.url} - Error: ${err?.message}`,
        err?.stack,
      );

      // In production, NEVER leak internal error messages or database details to the client
      if (!isProd) {
        message = err?.message || message;
      }
    }

    // Sanitize message: never allow stack traces or raw database syntax in client responses
    if (typeof message === 'string') {
      if (
        message.includes('PrismaClient') ||
        message.includes('SELECT') ||
        message.includes('syntax error at') ||
        message.includes('relation "')
      ) {
        message = 'A database error occurred. Please try again later.';
      }
    }

    response.status(status).json({
      statusCode: status,
      error: errorName,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
