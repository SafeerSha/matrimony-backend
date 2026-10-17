import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Chat')
@ApiBearerAuth('JWT-auth')
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({
    summary: 'Get active conversations for the authenticated user',
    description:
      'Returns matched partner profiles, last exchanged message, and unread count, sorted by most recent activity.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active conversations list retrieved successfully',
  })
  async getConversations(@CurrentUser() user: any) {
    return this.chatService.getConversations(user.sub);
  }

  @Get('history/:contactId')
  @ApiOperation({
    summary: 'Get full message history with a matched contact',
    description:
      'Retrieves all messages between current user and contact in ascending chronological order.',
  })
  @ApiParam({
    name: 'contactId',
    description: 'UUID of the matched contact',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Chat history retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if the users are not mutually matched',
  })
  async getHistory(
    @CurrentUser() user: any,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.chatService.getChatHistory(user.sub, contactId);
  }

  @Put('read/:contactId')
  @ApiOperation({
    summary: 'Mark all incoming unread messages from a contact as read',
  })
  @ApiParam({
    name: 'contactId',
    description: 'UUID of the sender whose messages are being marked as read',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Messages marked as read successfully',
  })
  async markAsRead(
    @CurrentUser() user: any,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.chatService.markAsRead(user.sub, contactId);
  }

  @Post('messages')
  @ApiOperation({
    summary: 'Send a message over HTTP (REST fallback)',
    description:
      'Provides fallback message sending when WebSocket connection is offline or reconnecting.',
  })
  @ApiResponse({
    status: 201,
    description: 'Message created and delivered successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden if the users are not mutually matched',
  })
  async sendMessage(
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user.sub, dto.receiverId, dto.content);
  }

  @Post('message')
  @ApiOperation({
    summary: 'Send a message over HTTP (singular endpoint alias)',
  })
  @ApiResponse({
    status: 201,
    description: 'Message created and delivered successfully',
  })
  async sendMessageAlias(
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user.sub, dto.receiverId, dto.content);
  }
}
