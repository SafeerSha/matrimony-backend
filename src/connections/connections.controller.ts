import { Controller, Post, Get, Param, UseGuards, Query } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Post('interest/:userId')
  async sendInterest(@CurrentUser() user: any, @Param('userId') targetId: string) {
    return this.connectionsService.sendInterest(user.sub, targetId);
  }

  @Post('accept/:userId')
  async acceptInterest(@CurrentUser() user: any, @Param('userId') senderId: string) {
    return this.connectionsService.acceptInterest(user.sub, senderId);
  }

  @Post('reject/:userId')
  async rejectInterest(@CurrentUser() user: any, @Param('userId') senderId: string) {
    return this.connectionsService.rejectInterest(user.sub, senderId);
  }

  @Post('shortlist/:userId')
  async shortlistProfile(@CurrentUser() user: any, @Param('userId') targetId: string) {
    return this.connectionsService.shortlistProfile(user.sub, targetId);
  }

  @Get()
  async getConnections(@CurrentUser() user: any, @Query('type') type: 'sent' | 'received' | 'matches') {
    return this.connectionsService.getConnections(user.sub, type);
  }
}
