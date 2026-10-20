import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', true);

  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'", 'https:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https:'],
          'img-src': ["'self'", 'data:', 'https:', 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  const allowedOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins === '*' || allowedOrigins?.split(',').map((o) => o.trim()).includes(origin)) {
        return callback(null, true);
      }

      // In development or local testing, allow localhost/127.0.0.1 and local subnet origins
      if (
        process.env.NODE_ENV !== 'production' ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('http://10.') ||
        origin.startsWith('http://192.168.')
      ) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With'],
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
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

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Matrimony API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
    },
  });

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`Application running on http://127.0.0.1:${port}/${process.env.API_PREFIX || 'api/v1'}`);
  console.log(`Swagger documentation available at http://0.0.0.0:${port}/api/docs`);
}
bootstrap();
