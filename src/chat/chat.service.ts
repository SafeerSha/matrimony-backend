import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { calculateCompatibility } from '../common/utils/compatibility.util';

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
    const [connections, currentUser] = await Promise.all([
      this.prisma.connection.findMany({
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
              lastActiveAt: true,
              profile: true,
              photos: {
                select: {
                  id: true,
                  url: true,
                  isPrimary: true,
                  isVerified: true,
                  createdAt: true,
                },
              },
            } as any,
          },
          receiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              isPhoneVerified: true,
              isEmailVerified: true,
              status: true,
              lastActiveAt: true,
              profile: true,
              photos: {
                select: {
                  id: true,
                  url: true,
                  isPrimary: true,
                  isVerified: true,
                  createdAt: true,
                },
              },
            } as any,
          },
        } as any,
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true, preference: true },
      }),
    ]);

    const conversations = await Promise.all(
      connections.map(async (connection: any) => {
        const partner: any =
          connection.senderId === userId ? connection.receiver : connection.sender;

        const sortedPhotos = [...(partner?.photos || [])].sort((a: any, b: any) => {
          if (a.isPrimary === b.isPrimary) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return a.isPrimary ? -1 : 1;
        });

        const formattedPhotos = sortedPhotos.map((p: any) => ({
          id: p.id,
          url: p.url,
          isPrimary: p.isPrimary,
          isVerified: p.isVerified,
        }));

        const isVerified = Boolean(
          partner?.isPhoneVerified ||
            partner?.isEmailVerified ||
            partner?.status === 'ACTIVE' ||
            partner?.photos?.some((p: any) => p.isVerified),
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

        const FIVE_MINUTES_MS = 5 * 60 * 1000;
        const lastActive = (partner as any).lastActiveAt ? new Date((partner as any).lastActiveAt) : null;
        const isOnline = lastActive
          ? Date.now() - lastActive.getTime() <= FIVE_MINUTES_MS
          : false;

        const compatibility = calculateCompatibility(currentUser, partner);

        return {
          id: partner.id,
          connectionId: connection.id,
          participantId: partner.id,
          online: isOnline,
          isOnline,
          lastActiveAt: (partner as any).lastActiveAt || null,
          compatibility,
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
            online: isOnline,
            isOnline,
            lastActiveAt: (partner as any).lastActiveAt || null,
            compatibility,
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
   * Retrieves message history between two users.
   */
  async getChatHistory(userId: string, contactId: string) {
    const blocked = await this.prisma.connection.findFirst({
      where: {
        status: 'BLOCKED',
        OR: [
          { senderId: userId, receiverId: contactId },
          { senderId: contactId, receiverId: userId },
        ],
      },
    });

    if (blocked) {
      throw new ForbiddenException('Cannot view chat with this profile.');
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
   * Sends a message to a partner, establishes connection if needed, and triggers notification.
   */
  async sendMessage(senderId: string, receiverId: string, content: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send messages to yourself.');
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty.');
    }

    // Verify recipient exists and is not banned
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, isBanned: true },
    });
    if (!receiver || receiver.isBanned) {
      throw new BadRequestException('Recipient is not available.');
    }

    const blocked = await this.prisma.connection.findFirst({
      where: {
        status: 'BLOCKED',
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (blocked) {
      throw new ForbiddenException('Cannot message this profile.');
    }

    // Ensure connection is established and accepted so mutual conversations/matches are active
    const existingConnection = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (!existingConnection) {
      await this.prisma.connection.create({
        data: {
          senderId,
          receiverId,
          status: 'ACCEPTED',
        },
      });
    } else if (existingConnection.status !== 'ACCEPTED') {
      await this.prisma.connection.update({
        where: { id: existingConnection.id },
        data: { status: 'ACCEPTED' },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content: trimmed,
      },
    });

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      include: {
        profile: true,
      },
    });

    const senderName =
      `${sender?.profile?.firstName || sender?.firstName || ''} ${sender?.profile?.lastName || sender?.lastName || ''}`.trim() ||
      'Member';

    await this.notificationsService.upsertMessageNotification(
      receiverId,
      senderId,
      senderName,
      trimmed,
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

    await this.notificationsService.markMessageNotificationAsRead(userId, contactId);

    return { success: true };
  }
}
