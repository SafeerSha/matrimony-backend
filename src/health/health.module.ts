import { Controller, Get, Module } from '@nestjs/common';

@Controller('health')
class HealthController {
  @Get()
  health() { return { status: 'ok' }; }

  @Get('ready')
  ready() { return { status: 'ready' }; }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
