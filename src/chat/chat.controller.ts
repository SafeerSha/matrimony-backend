import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionPermitGuard, RequirePermit } from '../subscription/guards/subscription-permit.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Chat')
@ApiBearerAuth('JWT-auth')
@Controller('chat')
@UseGuards(JwtAuthGuard, SubscriptionPermitGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@CurrentUser() user: any) {
    return this.chatService.getConversations(user.sub);
  }

  @Post('initiate/:contactId')
  @RequirePermit()
  async initiateChat(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    return this.chatService.initiateChat(user.sub, contactId);
  }

  @Post('initiate')
  @RequirePermit()
  async initiateChatBody(@CurrentUser() user: any, @Body('contactId') contactId: string) {
    return this.chatService.initiateChat(user.sub, contactId);
  }

  @Get('history/:contactId')
  async getHistory(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    return this.chatService.getChatHistory(user.sub, contactId);
  }

  @Get('conversations/:conversationId/messages')
  async getConversationMessages(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string
  ) {
    const contactId = conversationId.replace('conv-', '');
    return this.chatService.getChatHistory(user.sub, contactId);
  }

  @Post('messages')
  @RequirePermit()
  async sendMessageHttp(
    @CurrentUser() user: any,
    @Body() body: { receiverId: string; content: string }
  ) {
    return this.chatService.sendMessage(user.sub, body.receiverId, body.content);
  }

  @Put('read/:contactId')
  async markAsRead(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    await this.chatService.markAsRead(user.sub, contactId);
    return { success: true };
  }

  @Post('conversations/:conversationId/read')
  async markConversationAsRead(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string
  ) {
    const contactId = conversationId.replace('conv-', '');
    await this.chatService.markAsRead(user.sub, contactId);
    return { success: true };
  }
}
