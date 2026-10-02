import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {}

  async sendMessage(senderId: string, receiverId: string, content: string) {
    const connection = await this.prisma.connection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (!connection) {
      throw new ForbiddenException('You can only message users you have matched with.');
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
    });

    await this.notificationsService.createNotification(
      receiverId,
      'NEW_MESSAGE',
      'You have a new message!',
      message.id
    );

    return message;
  }

  async getChatHistory(userId: string, contactId: string) {
    const connection = await this.prisma.connection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId },
        ],
      },
    });

    if (!connection) {
      throw new ForbiddenException('No active connection with this user.');
    }

    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markAsRead(userId: string, senderId: string) {
    return this.prisma.message.updateMany({
      where: {
        receiverId: userId,
        senderId: senderId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }
}
