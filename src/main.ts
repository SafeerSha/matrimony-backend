import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SanitizeInterceptor } from './common/interceptors/sanitize.interceptor';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(){

  console.log('Environment diagnostics:', {
    nodeEnv: process.env.NODE_ENV,
    jwtAccessSecretAvailable: !!process.env.JWT_ACCESS_SECRET,
    jwtRefreshSecretAvailable: !!process.env.JWT_REFRESH_SECRET,
    databaseUrlAvailable: !!process.env.DATABASE_URL,
  });

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
      throw new Error(
        'SECURITY CONFIGURATION ERROR: JWT_ACCESS_SECRET must be configured with at least 32 characters in production.',
      );
    }
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  // Disable fingerprinting header
  expressApp.disable('x-powered-by');

  // Enforce explicit payload body size limits to prevent memory exhaustion / DoS
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'", 'https://sdk.cashfree.com'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:', 'blob:'],
          'connect-src': ["'self'", 'https:', 'wss:'],
          'frame-ancestors': ["'none'"],
          'object-src': ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cookieParser());
  const allowedOrigins = process.env.CORS_ORIGINS;
  const configuredOrigins = allowedOrigins
    ? allowedOrigins.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean)
    : [];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, server-to-server, health checks)
      if (!origin) return callback(null, true);

      const lowerOrigin = origin.toLowerCase().trim();

      // Wildcard or explicit match in configured origins
      if (allowedOrigins === '*' || configuredOrigins.includes('*') || configuredOrigins.includes(lowerOrigin)) {
        return callback(null, true);
      }

      // Safe domain parsing without regex backtracking (ReDoS prevention)
      try {
        const parsedUrl = new URL(lowerOrigin);
        const hostname = parsedUrl.hostname.toLowerCase();

        // Always allow primary domain and verified subdomains of ishtamchat.com
        if (hostname === 'ishtamchat.com' || hostname.endsWith('.ishtamchat.com')) {
          return callback(null, true);
        }

        // Allow verified IshtamChat Vercel deployments (prevents rogue 3rd-party vercel apps)
        if (
          (hostname.startsWith('ishtamchat') || hostname.startsWith('matrimony-web-')) &&
          hostname.endsWith('.vercel.app')
        ) {
          return callback(null, true);
        }
      } catch {
        return callback(null, false);
      }

      // Interchangeably match apex and www for any configured origin (e.g. www.domain.com <-> domain.com)
      for (const conf of configuredOrigins) {
        const confHost = conf.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        const originHost = lowerOrigin.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        if (confHost && confHost === originHost) {
          return callback(null, true);
        }
      }

      // In development or local testing, allow localhost/127.0.0.1 and local subnet origins
      if (
        process.env.NODE_ENV !== 'production' ||
        lowerOrigin.startsWith('http://localhost:') ||
        lowerOrigin.startsWith('http://127.0.0.1:') ||
        lowerOrigin.startsWith('http://10.') ||
        lowerOrigin.startsWith('http://192.168.')
      ) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
      'x-webhook-signature',
      'x-webhook-timestamp',
      'Cache-Control',
      'Pragma',
      'sentry-trace',
      'baggage',
    ],
  });

  // Global Input Sanitization: automatically sanitizes all request bodies, queries, and params
  app.useGlobalInterceptors(new SanitizeInterceptor());

  // Global Exception Filter: prevents internal errors, SQL errors, or stack traces from leaking to clients
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Bind root '/' on http adapter so requests to either '/' or '/api/v1' succeed
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/', (req: any, res: any) => {
    res.json({
      name: 'Matrimony Backend API',
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Matrimony Backend API')
    .setDescription('Production-ready API documentation for Matrimony platform')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT Access Token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addCookieAuth('__Host-matrimony_session', {
      type: 'apiKey',
      in: 'cookie',
      name: '__Host-matrimony_session',
      description: 'HttpOnly Session Cookie',
    })
    .build();

  const isSwaggerEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (isSwaggerEnabled) {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'Matrimony API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
      },
    });
  }

  const port = Number(process.env.PORT || 4000);
  await app.init();
  await app.listen(port);
  console.log(`Application running on http://127.0.0.1:${port}/${process.env.API_PREFIX || 'api/v1'}`);
  if (isSwaggerEnabled) {
    console.log(`Swagger documentation available at http://0.0.0.0:${port}/api/docs`);
  }

  // Enable graceful shutdown hooks (SIGTERM/SIGINT).
  // Triggers onModuleDestroy on all providers (PrismaService.$disconnect, ChatGateway cleanup).
  app.enableShutdownHooks();
}
bootstrap();
