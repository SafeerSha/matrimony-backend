import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(userId: string, type: string, content: string, referenceId?: string) {
    return this.prisma.notification.create({
      data: {
        userId,
        type,
        content,
        referenceId,
      },
    });
  }

  /**
   * Upsert a distinct message notification per sender.
   * If an unread notification from this sender already exists, update its content & timestamp.
   */
  async upsertMessageNotification(
    recipientId: string,
    senderId: string,
    senderName: string,
    messageContent: string,
  ) {
    const snippet = messageContent.length > 80 ? `${messageContent.substring(0, 77)}...` : messageContent;
    const content = `${senderName}: ${snippet}`;

    // Look for existing notification from this sender
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: recipientId,
        type: 'NEW_MESSAGE',
        referenceId: senderId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.prisma.notification.update({
        where: { id: existing.id },
        data: {
          content,
          isRead: false,
          createdAt: new Date(),
        },
      });
    }

    return this.prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'NEW_MESSAGE',
        content,
        referenceId: senderId,
        isRead: false,
      },
    });
  }

  /**
   * Mark all message notifications from a contact as read when the conversation is opened
   */
  async markMessageNotificationAsRead(userId: string, senderId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        type: 'NEW_MESSAGE',
        referenceId: senderId,
      },
      data: { isRead: true },
    });
  }

  async getUserNotifications(userId: string) {
    const all = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Deduplicate NEW_MESSAGE notifications by sender so each user appears only once (latest notification)
    const seenSenders = new Set<string>();
    const distinctList = [];

    for (const notif of all) {
      if (notif.type === 'NEW_MESSAGE' && notif.referenceId) {
        if (seenSenders.has(notif.referenceId)) {
          continue;
        }
        seenSenders.add(notif.referenceId);
      }
      distinctList.push(notif);
    }

    return distinctList;
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
