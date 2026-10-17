import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  @Get()
  root() {
    return {
      name: 'Matrimony Backend API',
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}

@ApiTags('System')
@Controller('health')
export class HealthController {
  @Get()
  health() { return { status: 'ok' }; }

  @Get('ready')
  ready() { return { status: 'ready' }; }
}

@Module({ controllers: [AppController, HealthController] })
export class HealthModule {}

