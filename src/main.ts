import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(process.env.API_PREFIX || 'api/v1');
  app.use(helmet());
  app.use(cookieParser());
  const allowedOrigins = process.env.CORS_ORIGINS;
  app.enableCors({
    origin: allowedOrigins
      ? allowedOrigins === '*'
        ? true
        : allowedOrigins.split(',').map((o) => o.trim())
      : ['http://localhost:3000'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
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

  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`Application running on http://0.0.0.0:${port}/${process.env.API_PREFIX || 'api/v1'}`);
}
bootstrap();
