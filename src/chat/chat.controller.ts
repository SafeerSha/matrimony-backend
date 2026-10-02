import { Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('history/:contactId')
  async getHistory(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    return this.chatService.getChatHistory(user.sub, contactId);
  }

  @Put('read/:contactId')
  async markAsRead(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    await this.chatService.markAsRead(user.sub, contactId);
    return { success: true };
  }
}
