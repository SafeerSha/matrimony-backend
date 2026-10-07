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
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
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

  const port = process.env.PORT || 4000;
  await app.listen(port);
}
bootstrap();
