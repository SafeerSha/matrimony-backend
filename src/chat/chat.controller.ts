import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '../common/decorators/throttle.decorator';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionPermitGuard, RequirePermit } from '../subscription/guards/subscription-permit.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChatHistoryQueryDto } from './dto/chat-history-query.dto';
import { ReactMessageDto } from './dto/reaction.dto';
import { SendMessageDto } from './dto/send-message.dto';

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

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('initiate/:contactId')
  @RequirePermit()
  async initiateChat(@CurrentUser() user: any, @Param('contactId') contactId: string) {
    return this.chatService.initiateChat(user.sub, contactId);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('initiate')
  @RequirePermit()
  async initiateChatBody(@CurrentUser() user: any, @Body('contactId') contactId: string) {
    return this.chatService.initiateChat(user.sub, contactId);
  }

  @Get('history/:contactId')
  async getHistory(
    @CurrentUser() user: any,
    @Param('contactId') contactId: string,
    @Query() query: ChatHistoryQueryDto = {},
  ) {
    return this.chatService.getChatHistory(user.sub, contactId, query);
  }

  @Get('conversations/:conversationId/messages')
  async getConversationMessages(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
    @Query() query: ChatHistoryQueryDto = {},
  ) {
    const contactId = conversationId.replace('conv-', '');
    return this.chatService.getChatHistory(user.sub, contactId, query);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('messages')
  @RequirePermit()
  async sendMessageHttp(
    @CurrentUser() user: any,
    @Body() body: SendMessageDto,
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

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('messages/:messageId/reactions')
  async toggleReactionHttp(
    @CurrentUser() user: any,
    @Param('messageId') messageId: string,
    @Body() body: ReactMessageDto,
  ) {
    return this.chatService.toggleReaction(user.sub, messageId, body.emoji);
  }
}
