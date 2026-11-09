import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(userId: string, type: string, content: string, referenceId?: string) {
    // Check user's notification preferences before creating
    if (type === 'NEW_INTEREST' || type === 'INTEREST_RECEIVED') {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (profile?.preferences as any)?.notificationPreferences;
      if (prefs && prefs.notifyInterests === false) {
        return null;
      }
    }

    if (type === 'MATCH_RECOMMENDATION' || type === 'RECOMMENDED_MATCH') {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (profile?.preferences as any)?.notificationPreferences;
      if (prefs && prefs.notifyMatches === false) {
        return null;
      }
    }

    if (type === 'MARKETING' || type === 'PROMOTION') {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (profile?.preferences as any)?.notificationPreferences;
      if (prefs && prefs.notifyMarketing === false) {
        return null;
      }
    }

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
    // Check if recipient has muted chat & message alerts
    const profile = await this.prisma.profile.findUnique({
      where: { userId: recipientId },
      select: { preferences: true },
    });
    const prefs = (profile?.preferences as any)?.notificationPreferences;
    if (prefs && prefs.notifyMessages === false) {
      return null;
    }

    let cleanMessage = messageContent;
    if (typeof messageContent === 'string' && (messageContent.trim().startsWith('{"replyTo":') || messageContent.trim().startsWith('{"text":'))) {
      try {
        const parsed = JSON.parse(messageContent.trim());
        if (parsed && typeof parsed.text === 'string' && parsed.text.trim()) {
          cleanMessage = parsed.text.trim();
        } else {
          cleanMessage = 'New message';
        }
      } catch {}
    }

    const snippet = cleanMessage.length > 80 ? `${cleanMessage.substring(0, 77)}...` : cleanMessage;
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
      // Clean up any extra duplicates from this sender so strictly only 1 notification exists
      await this.prisma.notification.deleteMany({
        where: {
          userId: recipientId,
          type: 'NEW_MESSAGE',
          referenceId: senderId,
          id: { not: existing.id },
        },
      });

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
      where: {
        userId,
        NOT: {
          referenceId: userId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Deduplicate NEW_MESSAGE notifications by sender so each user appears only once (latest notification only)
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

    // Enrich with sender profile details (name, photo, city)
    const userIdsToFetch = Array.from(
      new Set(distinctList.map((n) => n.referenceId).filter((id): id is string => Boolean(id)))
    );

    const senders = userIdsToFetch.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIdsToFetch } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: {
              select: {
                city: true,
                occupation: true,
                firstName: true,
                lastName: true,
              },
            },
            photos: {
              select: {
                url: true,
                isPrimary: true,
              },
            },
          },
        })
      : [];

    const senderMap = new Map(
      senders.map((s) => {
        const photo = s.photos.find((p) => p.isPrimary)?.url || s.photos[0]?.url || null;
        const name =
          `${s.profile?.firstName || s.firstName || ''} ${s.profile?.lastName || s.lastName || ''}`.trim() ||
          'Member';
        return [
          s.id,
          {
            id: s.id,
            name,
            avatarUrl: photo,
            city: s.profile?.city || null,
            occupation: s.profile?.occupation || null,
          },
        ];
      })
    );

    return distinctList.map((notif) => {
      const sender = notif.referenceId ? senderMap.get(notif.referenceId) || null : null;
      let content = notif.content;
      // If legacy content was "You have a new message!", replace with sender name
      if (content === 'You have a new message!' && sender) {
        content = `${sender.name}: Sent you a message`;
      }
      return {
        ...notif,
        content,
        sender,
      };
    });
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
  async getPreferences(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const prefs = (profile?.preferences as any)?.notificationPreferences || {};
    return {
      notifyInterests: prefs.notifyInterests ?? true,
      notifyMessages: prefs.notifyMessages ?? true,
      notifyMatches: prefs.notifyMatches ?? true,
      notifyMarketing: prefs.notifyMarketing ?? false,
    };
  }

  async updatePreferences(
    userId: string,
    data: {
      notifyInterests?: boolean;
      notifyMessages?: boolean;
      notifyMatches?: boolean;
      notifyMarketing?: boolean;
    },
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    const currentPrefs = (profile?.preferences as any) || {};
    const existingNotifPrefs = currentPrefs.notificationPreferences || {};

    const updatedNotifPrefs = {
      notifyInterests:
        data.notifyInterests !== undefined ? Boolean(data.notifyInterests) : (existingNotifPrefs.notifyInterests ?? true),
      notifyMessages:
        data.notifyMessages !== undefined ? Boolean(data.notifyMessages) : (existingNotifPrefs.notifyMessages ?? true),
      notifyMatches:
        data.notifyMatches !== undefined ? Boolean(data.notifyMatches) : (existingNotifPrefs.notifyMatches ?? true),
      notifyMarketing:
        data.notifyMarketing !== undefined ? Boolean(data.notifyMarketing) : (existingNotifPrefs.notifyMarketing ?? false),
    };

    const newPreferences = {
      ...currentPrefs,
      notificationPreferences: updatedNotifPrefs,
    };

    await this.prisma.profile.upsert({
      where: { userId },
      update: { preferences: newPreferences },
      create: {
        userId,
        preferences: newPreferences,
      },
    });

    return updatedNotifPrefs;
  }
}
