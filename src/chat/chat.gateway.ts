import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets: Map<string, string> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Unauthorized socket connection attempt (no token): ${client.id}`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) {
        this.logger.warn(`Invalid JWT payload on socket connection: ${client.id}`);
        client.disconnect();
        return;
      }

      this.userSockets.set(userId, client.id);
      client.data.user = payload;
      this.logger.log(`User ${userId} authenticated on socket ${client.id}`);

      // Update lastActiveAt in database and broadcast live presence
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastActiveAt: new Date() } as any,
        });
      } catch (e: any) {
        this.logger.warn(`Failed updating lastActiveAt for ${userId}: ${e?.message}`);
      }

      this.server.emit('user_presence', {
        userId,
        isOnline: true,
        lastActiveAt: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.warn(
        `Socket authentication failed for client ${client.id}: ${error?.message}`,
      );
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.user?.sub;
    if (userId && this.userSockets.get(userId) === client.id) {
      this.userSockets.delete(userId);
      this.logger.log(`User ${userId} disconnected from socket ${client.id}`);

      const now = new Date();
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastActiveAt: now } as any,
        });
      } catch (e: any) {
        this.logger.warn(`Failed updating lastActiveAt on disconnect for ${userId}: ${e?.message}`);
      }

      this.server.emit('user_presence', {
        userId,
        isOnline: false,
        lastActiveAt: now.toISOString(),
      });
    }
  }

  emitToUser(userId: string, event: string, data: any): boolean {
    const socketId = this.userSockets.get(userId);
    if (socketId && this.server) {
      this.server.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = client.data?.user?.sub;
    if (userId) {
      const now = new Date();
      this.userSockets.set(userId, client.id);
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastActiveAt: now } as any,
        });
      } catch {}
      return { event: 'heartbeat_ack', data: { timestamp: now.toISOString(), isOnline: true } };
    }
    return { event: 'heartbeat_ack', data: { isOnline: false } };
  }

  @SubscribeMessage('check_online')
  handleCheckOnline(@MessageBody() payload: { userId?: string; userIds?: string[] }) {
    if (payload?.userId) {
      return {
        event: 'user_presence',
        data: { userId: payload.userId, isOnline: this.userSockets.has(payload.userId) },
      };
    }
    if (Array.isArray(payload?.userIds)) {
      const statuses: Record<string, boolean> = {};
      for (const id of payload.userIds) {
        statuses[id] = this.userSockets.has(id);
      }
      return { event: 'batch_presence', data: statuses };
    }
    return { event: 'batch_presence', data: {} };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { receiverId: string; content: string },
  ) {
    const senderId = client.data?.user?.sub;
    if (!senderId) {
      return { event: 'error', data: 'Unauthorized' };
    }

    const hasPermit = await this.subscriptionService.hasActiveChatPermit(senderId);
    if (!hasPermit) {
      return {
        event: 'subscription_required',
        data: {
          code: 'PERMIT_REQUIRED',
          message: 'An active Chat Permit is required to send messages.',
        },
      };
    }

    if (!payload?.receiverId || !payload?.content?.trim()) {
      return {
        event: 'error',
        data: 'receiverId and non-empty content are required',
      };
    }

    try {
      const message = await this.chatService.sendMessage(
        senderId,
        payload.receiverId,
        payload.content.trim(),
      );

      const receiverSocketId = this.userSockets.get(payload.receiverId);
      if (receiverSocketId) {
        this.server.to(receiverSocketId).emit('receive_message', message);
      }

      return { event: 'message_sent', data: message };
    } catch (error: any) {
      return { event: 'error', data: error.message || 'Failed to send message' };
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { contactId: string },
  ) {
    const userId = client.data?.user?.sub;
    if (!userId || !payload?.contactId) {
      return { event: 'error', data: 'Unauthorized or missing contactId' };
    }

    try {
      await this.chatService.markAsRead(userId, payload.contactId);

      // Notify the sender that their messages have been read
      const senderSocketId = this.userSockets.get(payload.contactId);
      if (senderSocketId) {
        this.server.to(senderSocketId).emit('messages_read', {
          readerId: userId,
          contactId: payload.contactId,
        });
      }

      return { event: 'mark_read_ack', data: { success: true } };
    } catch (error: any) {
      return { event: 'error', data: error.message || 'Failed to mark as read' };
    }
  }

  private extractToken(client: Socket): string | null {
    // 1. client.handshake.auth.token
    const authToken = client.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    // 2. client.handshake.headers['authorization']
    const authHeader =
      client.handshake?.headers?.['authorization'] ||
      client.handshake?.headers?.['Authorization'];
    if (typeof authHeader === 'string' && authHeader.trim()) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1].trim();
      }
      return authHeader.replace(/^Bearer\s+/i, '').trim();
    }

    // 3. client.handshake.headers.cookie
    const cookieHeader = client.handshake?.headers?.cookie;
    if (typeof cookieHeader === 'string' && cookieHeader.trim()) {
      const cookies = cookieHeader.split(';').reduce((acc, curr) => {
        const idx = curr.indexOf('=');
        if (idx > -1) {
          const key = curr.slice(0, idx).trim();
          const val = curr.slice(idx + 1).trim();
          acc[key] = decodeURIComponent(val);
        }
        return acc;
      }, {} as Record<string, string>);

      const cookieToken =
        cookies['access_token'] ||
        cookies['jwt'] ||
        cookies['__Host-matrimony_session'] ||
        cookies['token'];
      if (cookieToken) {
        return cookieToken.replace(/^Bearer\s+/i, '').trim();
      }
    }

    // 4. Fallback: query parameter
    const queryToken = (client.handshake?.query as any)?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }
}
