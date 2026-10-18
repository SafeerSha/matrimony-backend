import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Retrieves active conversations for the authenticated user based on accepted connections.
   */
  async getConversations(userId: string) {
    const connections = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            isPhoneVerified: true,
            isEmailVerified: true,
            status: true,
            profile: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                city: true,
                occupation: true,
              },
            },
            photos: {
              select: {
                id: true,
                url: true,
                isPrimary: true,
                isVerified: true,
                createdAt: true,
              },
            },
          },
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            isPhoneVerified: true,
            isEmailVerified: true,
            status: true,
            profile: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                city: true,
                occupation: true,
              },
            },
            photos: {
              select: {
                id: true,
                url: true,
                isPrimary: true,
                isVerified: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    const conversations = await Promise.all(
      connections.map(async (connection) => {
        const partner =
          connection.senderId === userId ? connection.receiver : connection.sender;

        const sortedPhotos = [...(partner.photos || [])].sort((a, b) => {
          if (a.isPrimary === b.isPrimary) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return a.isPrimary ? -1 : 1;
        });

        const formattedPhotos = sortedPhotos.map((p) => ({
          id: p.id,
          url: p.url,
          isPrimary: p.isPrimary,
          isVerified: p.isVerified,
        }));

        const isVerified = Boolean(
          partner.isPhoneVerified ||
            partner.isEmailVerified ||
            partner.status === 'ACTIVE' ||
            partner.photos?.some((p) => p.isVerified),
        );

        const lastMessage = await this.prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: partner.id },
              { senderId: partner.id, receiverId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            senderId: true,
            receiverId: true,
            content: true,
            isRead: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        const unreadCount = await this.prisma.message.count({
          where: {
            receiverId: userId,
            senderId: partner.id,
            isRead: false,
          },
        });

        const updatedAt = lastMessage ? lastMessage.createdAt : connection.updatedAt;

        return {
          id: partner.id,
          connectionId: connection.id,
          participantId: partner.id,
          participant: {
            id: partner.id,
            userId: partner.id,
            firstName: partner.firstName || partner.profile?.firstName || '',
            lastName: partner.lastName || partner.profile?.lastName || '',
            photos: formattedPhotos,
            avatarUrl: formattedPhotos[0]?.url || null,
            city: partner.profile?.city || null,
            occupation: partner.profile?.occupation || null,
            isVerified,
          },
          lastMessage: lastMessage || null,
          unreadCount,
          updatedAt,
        };
      }),
    );

    return conversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /**
   * Retrieves message history between two matched users.
   */
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
      throw new ForbiddenException('You can only message matched profiles.');
    }

    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId },
        ],
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        content: true,
        isRead: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Sends a message to a matched partner and triggers notification.
   */
  async sendMessage(senderId: string, receiverId: string, content: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send messages to yourself.');
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty.');
    }

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
      throw new ForbiddenException('You can only message matched profiles.');
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content: trimmed,
      },
    });

    await this.notificationsService.createNotification(
      receiverId,
      'NEW_MESSAGE',
      'You have a new message!',
      message.id,
    );

    return message;
  }

  /**
   * Marks unread messages from a contact as read.
   */
  async markAsRead(userId: string, contactId: string) {
    await this.prisma.message.updateMany({
      where: {
        receiverId: userId,
        senderId: contactId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return { success: true };
  }

  async initiateChat(userId: string, contactId: string) {
    if (userId === contactId) {
      throw new ForbiddenException('Cannot initiate chat with yourself.');
    }

    const connection = await this.prisma.connection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: true,
            photos: { select: { url: true, isPrimary: true, isVerified: true } },
          },
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profile: true,
            photos: { select: { url: true, isPrimary: true, isVerified: true } },
          },
        },
      },
    });

    if (!connection) {
      throw new ForbiddenException('You can only message users you have matched with.');
    }

    const partner = connection.senderId === userId ? connection.receiver : connection.sender;

    const lastMessage = await this.prisma.message.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      conversationId: `conv-${partner.id}`,
      contactId: partner.id,
      partner: {
        id: partner.id,
        name: `${partner.firstName || ''} ${partner.lastName || ''}`.trim() || 'Match',
        photo: partner.photos?.[0]?.url || null,
        bio: partner.profile?.bio || null,
        city: partner.profile?.city || null,
        occupation: partner.profile?.occupation || null,
      },
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            conversationId: `conv-${partner.id}`,
            senderId: lastMessage.senderId,
            receiverId: lastMessage.receiverId,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt.toISOString(),
            isRead: lastMessage.isRead,
          }
        : null,
      message: 'Conversation initialized successfully',
    };
  }
}
