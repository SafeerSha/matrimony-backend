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
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  onModuleDestroy(): void {
    // Close all Socket.io connections gracefully
    if (this.server) {
      this.server.disconnectSockets?.(true);
    }
    this.userSockets.clear();
  }

  private pruneDeadSockets(sockets: Set<string>, keepSocketId?: string): void {
    const liveSockets = (this.server as any)?.sockets?.sockets;
    if (!(liveSockets instanceof Map)) {
      return;
    }
    for (const id of sockets) {
      if (id !== keepSocketId && !liveSockets.has(id)) {
        sockets.delete(id);
      }
    }
  }

  private addSocket(userId: string, socketId: string): void {
    if (!userId || !socketId) return;
    let sockets = this.userSockets.get(userId);
    if (sockets) {
      this.pruneDeadSockets(sockets, socketId);
    } else {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
  }

  private removeSocket(
    userId: string,
    socketId: string,
  ): { removed: boolean; wentOffline: boolean } {
    const sockets = this.userSockets.get(userId);
    if (!sockets || !sockets.has(socketId)) {
      return { removed: false, wentOffline: false };
    }
    sockets.delete(socketId);
    this.pruneDeadSockets(sockets);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      return { removed: true, wentOffline: true };
    }
    return { removed: true, wentOffline: false };
  }

  private getActiveSockets(userId: string): Set<string> | null {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return null;
    }
    this.pruneDeadSockets(sockets);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
      return null;
    }
    return sockets;
  }

  isUserOnline(userId: string): boolean {
    return this.getActiveSockets(userId) !== null;
  }

  getUserSocketCount(userId: string): number {
    return this.getActiveSockets(userId)?.size ?? 0;
  }

  async handleConnection(client: Socket) {
    try {
      if (!client?.id || (client as any).disconnected) {
        return;
      }

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

      client.data = client.data || {};
      client.data.user = payload;
      this.addSocket(userId, client.id);
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

      // Guard against client disconnecting while DB update was in-flight
      if ((client as any).disconnected || !this.userSockets.get(userId)?.has(client.id)) {
        this.removeSocket(userId, client.id);
        return;
      }

      this.server?.emit?.('user_presence', {
        userId,
        isOnline: true,
        lastActiveAt: new Date().toISOString(),
      });
    } catch (error: any) {
      const userId = client?.data?.user?.sub;
      if (userId && client?.id) {
        this.removeSocket(userId, client.id);
      }
      this.logger.warn(
        `Socket authentication failed for client ${client?.id}: ${error?.message}`,
      );
      client?.disconnect?.();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client?.data?.user?.sub;
    if (!userId || !client?.id) {
      return;
    }

    const { removed, wentOffline } = this.removeSocket(userId, client.id);
    if (!removed) {
      return;
    }

    this.logger.log(`User ${userId} disconnected from socket ${client.id}`);

    if (!wentOffline) {
      return;
    }

    const now = new Date();
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveAt: now } as any,
      });
    } catch (e: any) {
      this.logger.warn(`Failed updating lastActiveAt on disconnect for ${userId}: ${e?.message}`);
    }

    this.server?.emit?.('user_presence', {
      userId,
      isOnline: false,
      lastActiveAt: now.toISOString(),
    });
  }

  emitToUser(userId: string, event: string, data: any): boolean {
    const sockets = this.getActiveSockets(userId);
    if (!sockets || !this.server) {
      return false;
    }
    for (const socketId of sockets) {
      this.server.to(socketId).emit(event, data);
    }
    return true;
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = client?.data?.user?.sub;
    if (userId && client?.id) {
      const now = new Date();
      this.addSocket(userId, client.id);
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
        data: { userId: payload.userId, isOnline: this.isUserOnline(payload.userId) },
      };
    }
    if (Array.isArray(payload?.userIds)) {
      const statuses: Record<string, boolean> = {};
      for (const id of payload.userIds.slice(0, 500)) {
        if (typeof id === 'string' && id) {
          statuses[id] = this.isUserOnline(id);
        }
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

      const targetReceiverId = message?.receiverId || payload.receiverId;
      this.emitToUser(targetReceiverId, 'receive_message', message);

      return { event: 'message_sent', data: message };
    } catch (error: any) {
      const response = typeof error?.getResponse === 'function' ? error.getResponse() : error?.response;
      const message =
        (typeof response === 'object' && response?.message)
          ? response.message
          : (typeof response === 'string' ? response : error?.message || 'Failed to send message');
      const code = (typeof response === 'object' && response?.code) ? response.code : 'ERROR';
      return { event: 'error', data: { code, message } };
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

      // Notify the sender across all connected sockets that their messages have been read
      this.emitToUser(payload.contactId, 'messages_read', {
        readerId: userId,
        contactId: payload.contactId,
      });

      return { event: 'mark_read_ack', data: { success: true } };
    } catch (error: any) {
      return { event: 'error', data: error.message || 'Failed to mark as read' };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { receiverId: string; isTyping: boolean },
  ) {
    const senderId = client.data?.user?.sub;
    if (!senderId || !payload?.receiverId) return;

    this.emitToUser(payload.receiverId, 'user_typing', {
      senderId,
      isTyping: Boolean(payload.isTyping),
    });
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
