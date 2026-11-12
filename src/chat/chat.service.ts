import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { calculateCompatibility } from '../common/utils/compatibility.util';
import {
  DEFAULT_CHAT_HISTORY_LIMIT,
  MAX_CHAT_HISTORY_LIMIT,
} from './dto/chat-history-query.dto';

export interface ChatHistoryOptions {
  cursor?: string;
  limit?: number;
  direction?: 'before' | 'after';
}

export interface ChatHistoryMeta {
  limit: number;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface PaginatedChatHistory {
  data: any[];
  meta: ChatHistoryMeta;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * Retrieves active conversations for the authenticated user based on accepted connections.
   * Optimized: replaces N+1 per-conversation message queries with two batched queries
   * (all messages + grouped unread counts), reducing round trips from 1+2N to 3.
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
              deletedAt: true,
              deactivatedAt: true,
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
              deletedAt: true,
              deactivatedAt: true,
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

    const partnerIds = connections.map((c: any) =>
      c.senderId === userId ? c.receiverId : c.senderId,
    );

    // Batch: fetch latest message per (sender, receiver) direction in one query
    const allMessages =
      partnerIds.length > 0
        ? await this.prisma.message.findMany({
            where: {
              OR: [
                { senderId: userId, receiverId: { in: partnerIds } },
                { senderId: { in: partnerIds }, receiverId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            distinct: ['senderId', 'receiverId'],
            select: {
              id: true,
              senderId: true,
              receiverId: true,
              content: true,
              isRead: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : [];

    // Index last message per partner (first encountered in desc order = latest)
    const lastMessageByPartner = new Map<string, any>();
    for (const msg of allMessages) {
      const partnerId =
        msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!lastMessageByPartner.has(partnerId)) {
        lastMessageByPartner.set(partnerId, msg);
      }
    }

    // Batch: grouped unread counts per sender in one query
    let unreadCounts: any = [];
    if (partnerIds.length > 0) {
      try {
        unreadCounts = await this.prisma.message.groupBy({
          by: ['senderId'],
          where: {
            receiverId: userId,
            isRead: false,
            senderId: { in: partnerIds },
          },
          _count: true,
        });
      } catch {
        unreadCounts = [];
      }
    }

    const unreadCountBySender = new Map<string, number>();
    for (const uc of unreadCounts) {
      unreadCountBySender.set(uc.senderId, uc._count);
    }

    const conversations = connections.map((connection: any) => {
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

      const lastMessage = lastMessageByPartner.get(partner.id) || null;
      const unreadCount = unreadCountBySender.get(partner.id) || 0;

      const updatedAt = lastMessage ? lastMessage.createdAt : connection.updatedAt;

      const FIVE_MINUTES_MS = 5 * 60 * 1000;
      const lastActive = (partner as any).lastActiveAt ? new Date((partner as any).lastActiveAt) : null;
      const isOnline = lastActive
        ? Date.now() - lastActive.getTime() <= FIVE_MINUTES_MS
        : false;

      const compatibility = calculateCompatibility(currentUser, partner);

      const partnerName =
        `${partner.firstName || partner.profile?.firstName || ''} ${partner.lastName || partner.profile?.lastName || ''}`.trim() ||
        partner.name ||
        partner.profile?.name ||
        'Member';

      const partnerPhoto = formattedPhotos[0]?.url || (partner.profile as any)?.image || null;

      return {
        id: partner.id,
        connectionId: connection.id,
        participantId: partner.id,
        name: partnerName,
        online: isOnline,
        isOnline,
        lastActiveAt: (partner as any).lastActiveAt || null,
        compatibility,
        participant: {
          id: partner.id,
          userId: partner.id,
          name: partnerName,
          firstName: partner.firstName || partner.profile?.firstName || '',
          lastName: partner.lastName || partner.profile?.lastName || '',
          photos: formattedPhotos,
          avatarUrl: partnerPhoto,
          image: partnerPhoto,
          city: partner.profile?.city || null,
          occupation: partner.profile?.occupation || null,
          isVerified,
          online: isOnline,
          isOnline,
          lastActiveAt: (partner as any).lastActiveAt || null,
          compatibility,
          status: partner.status,
          deletedAt: partner.deletedAt,
          deactivatedAt: partner.deactivatedAt,
        },
        lastMessage: lastMessage || null,
        unreadCount,
        updatedAt,
      };
    });

    const visibleConversations = conversations.filter((c: any) => {
      const p = c.participant || c;
      if (p.status === 'DELETED' || Boolean(p.deletedAt) || Boolean(p.deactivatedAt)) {
        return false;
      }
      return true;
    });

    return visibleConversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  private async resolveUserId(id: string): Promise<string> {
    if (!id) return id;
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (user) return user.id;
    const prof = await this.prisma.profile.findFirst({
      where: {
        OR: [{ id }, { user: { profileId: id } }],
      },
      select: { userId: true },
    });
    if (prof?.userId) return prof.userId;
    return id;
  }

  /**
   * Retrieves cursor-paginated message history between two users in chronological order.
   */
  async getChatHistory(
    userId: string,
    rawContactId: string,
    options: ChatHistoryOptions = {},
  ): Promise<PaginatedChatHistory> {
    const contactId = await this.resolveUserId(rawContactId);

    // Block access if contact account is deleted/deactivated
    const contactUser = await this.prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, status: true, deletedAt: true, deactivatedAt: true },
    });
    if (
      !contactUser ||
      contactUser.status === 'DELETED' ||
      Boolean(contactUser.deletedAt) ||
      Boolean(contactUser.deactivatedAt)
    ) {
      throw new BadRequestException('This account no longer exists.');
    }

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

    const rawLimit = options?.limit;
    let limit = DEFAULT_CHAT_HISTORY_LIMIT;
    if (rawLimit !== undefined && rawLimit !== null) {
      const parsed = Number(rawLimit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new BadRequestException('limit must be a positive integer.');
      }
      limit = Math.min(MAX_CHAT_HISTORY_LIMIT, parsed);
    }

    const direction: 'before' | 'after' =
      options?.direction === 'after' ? 'after' : 'before';
    const cursor =
      typeof options?.cursor === 'string' && options.cursor.trim()
        ? options.cursor.trim()
        : undefined;

    const conversationFilter = {
      OR: [
        { senderId: userId, receiverId: contactId },
        { senderId: contactId, receiverId: userId },
      ],
    };

    let where: any = conversationFilter;

    if (cursor) {
      // Scope cursor lookup to this exact conversation to prevent cross-conversation probing
      const cursorMessage = await this.prisma.message.findFirst({
        where: {
          id: cursor,
          ...conversationFilter,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      if (!cursorMessage) {
        throw new BadRequestException('Invalid pagination cursor.');
      }

      const cursorDate =
        cursorMessage.createdAt instanceof Date
          ? cursorMessage.createdAt
          : new Date(cursorMessage.createdAt);
      const op = direction === 'after' ? 'gt' : 'lt';

      where = {
        AND: [
          conversationFilter,
          {
            OR: [
              { createdAt: { [op]: cursorDate } },
              {
                createdAt: cursorDate,
                id: { [op]: cursorMessage.id },
              },
            ],
          },
        ],
      };
    }

    const rows = await this.prisma.message.findMany({
      where,
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        content: true,
        isRead: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy:
        direction === 'after'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const data = direction === 'after' ? pageRows : [...pageRows].reverse();

    let nextCursor: string | null = null;
    let prevCursor: string | null = null;

    if (data.length > 0) {
      if (direction === 'after') {
        nextCursor = hasMore ? data[data.length - 1].id : null;
        prevCursor = cursor ? data[0].id : null;
      } else {
        nextCursor = hasMore ? data[0].id : null;
        prevCursor = cursor ? data[data.length - 1].id : null;
      }
    }

    return {
      data,
      meta: {
        limit,
        count: data.length,
        hasMore,
        nextCursor,
        prevCursor,
      },
    };
  }

  /**
   * Sends a message to a partner, establishes connection if needed, and triggers notification.
   */
  async sendMessage(senderId: string, rawReceiverId: string, content: string) {
    const receiverId = await this.resolveUserId(rawReceiverId);
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send messages to yourself.');
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty.');
    }

    // Verify recipient exists and is not banned or deleted
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, isBanned: true, status: true, deletedAt: true, deactivatedAt: true },
    });
    if (
      !receiver ||
      receiver.isBanned ||
      receiver.status === 'DELETED' ||
      Boolean(receiver.deletedAt) ||
      Boolean(receiver.deactivatedAt)
    ) {
      throw new BadRequestException('This account no longer exists.');
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

    // Server-side Permit Guard
    const hasPermit = await this.subscriptionService.hasActiveChatPermit(senderId);
    if (!hasPermit) {
      throw new ForbiddenException({
        code: 'PERMIT_REQUIRED',
        message: 'An active Chat Permit is required to send messages.',
      });
    }

    // Require accepted connection or existing conversation history
    const existingConnection = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (!existingConnection || existingConnection.status !== 'ACCEPTED') {
      const hasHistory = await this.prisma.message.findFirst({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        },
      });

      if (!hasHistory) {
        throw new ForbiddenException({
          code: 'CONNECTION_REQUIRED',
          message: 'You can only message profiles you have mutually connected with.',
        });
      }
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content: trimmed,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photos: {
              select: {
                url: true,
                isPrimary: true,
              },
            },
          },
        },
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
  async markAsRead(userId: string, rawContactId: string) {
    const contactId = await this.resolveUserId(rawContactId);
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

  async initiateChat(userId: string, rawContactId: string) {
    const contactId = await this.resolveUserId(rawContactId);
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
