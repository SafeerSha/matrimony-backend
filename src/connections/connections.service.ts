import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from '../chat/chat.gateway';
import { SubscriptionService } from '../subscription/subscription.service';
import { calculateCompatibility } from '../common/utils/compatibility.util';
import { ConnectionQueryDto, DEFAULT_CONNECTION_LIMIT, MAX_CONNECTION_LIMIT } from './dto/connection-query.dto';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly subscriptionService: SubscriptionService,
  ) {}

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

  private formatPartnerPayload(user: any) {
    if (!user) return null;
    const photos = user.photos || user.profile?.photos || [];
    const primary = photos.find((p: any) => p.isPrimary)?.url || photos[0]?.url || null;
    return {
      id: user.id,
      profileId: user.profileId,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Match',
      age: user.profile?.dateOfBirth
        ? Math.floor((new Date().getTime() - new Date(user.profile.dateOfBirth).getTime()) / 31557600000)
        : 26,
      city: user.profile?.city || '',
      state: user.profile?.country || user.profile?.state || '',
      profession: user.profile?.occupation || user.profile?.profession || 'Professional',
      education: user.profile?.education || 'Graduate',
      image: primary || '',
      compatibility: 94,
      verified: true,
      about: user.profile?.bio || '',
    };
  }

  async sendInterest(senderId: string, rawReceiverId: string) {
    const receiverId = await this.resolveUserId(rawReceiverId);
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot connect with yourself');
    }

    // Enforce daily interest quota for anti-spam
    const quota = await this.subscriptionService.checkAndIncrementInterestQuota(senderId);
    if (!quota.allowed) {
      throw new BadRequestException('Daily interest limit reached. Please upgrade to a Chat Permit for unlimited connection requests.');
    }

    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      // If the target user already sent an interest to the caller and it is PENDING:
      // Sending interest back forms a mutual match! Automatically accept it.
      if (existing.senderId === receiverId && existing.receiverId === senderId && existing.status === 'PENDING') {
        const accepted = await this.prisma.connection.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED' },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileId: true,
                profile: true,
                photos: { select: { url: true, isPrimary: true, isVerified: true } },
              },
            },
            receiver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profileId: true,
                profile: true,
                photos: { select: { url: true, isPrimary: true, isVerified: true } },
              },
            },
          },
        });

        // 1. Create notification for receiver (the original sender who just got accepted)
        const notif = await this.notificationsService.createNotification(
          receiverId,
          'MATCH_ACCEPTED',
          'Your interest was accepted! You have a mutual match.',
          senderId,
        );

        const partnerForReceiver = this.formatPartnerPayload(accepted.sender);
        const partnerForSender = this.formatPartnerPayload(accepted.receiver);

        // 2. Realtime WebSocket Push if receiver is currently online
        this.chatGateway.emitToUser(receiverId, 'match_celebration', {
          notificationId: notif?.id,
          partner: partnerForReceiver,
        });

        return {
          ...accepted,
          isMutualMatch: true,
          partner: accepted.senderId === senderId ? accepted.receiver : accepted.sender,
        };
      }

      if (existing.status === 'ACCEPTED') {
        return {
          ...existing,
          isMutualMatch: true,
        };
      }

      if (existing.status === 'PENDING') {
        throw new BadRequestException('Interest already sent and pending');
      }

      if (existing.status === 'REJECTED') {
        throw new BadRequestException('This interest request was declined');
      }

      // If existing connection was SHORTLISTED by caller, persist in favoriteIds before updating status
      if (existing.status === 'SHORTLISTED' && existing.senderId === senderId) {
        await this.addFavoriteId(senderId, receiverId);
      }
      // If existing connection was SHORTLISTED, promote it to PENDING interest!
      const updated = await this.prisma.connection.update({
        where: { id: existing.id },
        data: {
          senderId,
          receiverId,
          status: 'PENDING',
        },
        include: {
          receiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileId: true,
              profile: true,
              photos: { select: { url: true, isPrimary: true, isVerified: true } },
            },
          },
        },
      });

      await this.notificationsService.createNotification(
        receiverId,
        'NEW_INTEREST',
        'Someone sent you an interest!',
        senderId,
      );

      return {
        ...updated,
        isMutualMatch: false,
      };
    }

    const connection = await this.prisma.connection.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING',
      },
      include: {
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
            profile: true,
            photos: { select: { url: true, isPrimary: true, isVerified: true } },
          },
        },
      },
    });

    await this.notificationsService.createNotification(
      receiverId,
      'NEW_INTEREST',
      'Someone sent you an interest!',
      senderId,
    );

    return {
      ...connection,
      isMutualMatch: false,
    };
  }

  async acceptInterest(receiverId: string, senderId: string) {
    const connection = await this.prisma.connection.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId,
        },
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection request not found');
    }

    const updated = await this.prisma.connection.update({
      where: { id: connection.id },
      data: { status: 'ACCEPTED' },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
            profile: true,
            photos: { select: { url: true, isPrimary: true, isVerified: true } },
          },
        },
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
            profile: true,
            photos: { select: { url: true, isPrimary: true, isVerified: true } },
          },
        },
      },
    });

    // 1. Create notification for the interest sender (the user who sent the interest)
    const notif = await this.notificationsService.createNotification(
      senderId,
      'MATCH_ACCEPTED',
      'Your interest was accepted! You have a mutual match.',
      receiverId,
    );

    const partnerForSender = this.formatPartnerPayload(updated.receiver);

    // 2. Realtime WebSocket Push to sender if they are currently online
    this.chatGateway.emitToUser(senderId, 'match_celebration', {
      notificationId: notif?.id,
      partner: partnerForSender,
    });

    return {
      ...updated,
      isMutualMatch: true,
      partner: updated.senderId === receiverId ? updated.receiver : updated.sender,
    };
  }

  async rejectInterest(receiverId: string, rawSenderId: string) {
    const senderId = await this.resolveUserId(rawSenderId);
    const connection = await this.prisma.connection.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId,
        },
      },
    });

    if (!connection) {
      throw new NotFoundException('Connection request not found');
    }

    return this.prisma.connection.update({
      where: { id: connection.id },
      data: { status: 'REJECTED' },
    });
  }

  async cancelInterest(senderId: string, rawReceiverId: string) {
    const receiverId = await this.resolveUserId(rawReceiverId);
    const connection = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (!connection) {
      throw new NotFoundException('Interest request or connection not found');
    }

    // Delete the connection so the user is free to interact again later
    await this.prisma.connection.delete({
      where: { id: connection.id },
    });

    // Clean up corresponding notification for both parties
    try {
      await this.prisma.notification.deleteMany({
        where: {
          OR: [
            { userId: receiverId, referenceId: senderId },
            { userId: senderId, referenceId: receiverId },
          ],
          type: { in: ['NEW_INTEREST', 'MATCH_ACCEPTED'] },
        },
      });
    } catch {
      // Ignore notification cleanup errors
    }

    return {
      success: true,
      message: 'Interest request successfully cancelled',
      targetId: receiverId,
    };
  }

  private async addFavoriteId(userId: string, targetId: string) {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (profile?.preferences as any) || {};
      const favorites: string[] = Array.isArray(prefs.favoriteIds) ? prefs.favoriteIds : [];
      if (!favorites.includes(targetId)) {
        await this.prisma.profile.update({
          where: { userId },
          data: {
            preferences: {
              ...prefs,
              favoriteIds: [...favorites, targetId],
            },
          },
        });
      }
    } catch (err) {
      // Fallback silently if preferences update fails
    }
  }

  private async removeFavoriteId(userId: string, targetId: string) {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (profile?.preferences as any) || {};
      const favorites: string[] = Array.isArray(prefs.favoriteIds) ? prefs.favoriteIds : [];
      if (favorites.includes(targetId)) {
        await this.prisma.profile.update({
          where: { userId },
          data: {
            preferences: {
              ...prefs,
              favoriteIds: favorites.filter((id) => id !== targetId),
            },
          },
        });
      }
    } catch (err) {
      // Fallback silently
    }
  }

  private async getFavoriteIds(userId: string): Promise<string[]> {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (profile?.preferences as any) || {};
      return Array.isArray(prefs.favoriteIds) ? prefs.favoriteIds : [];
    } catch {
      return [];
    }
  }
  async shortlistProfile(userId: string, rawTargetId: string) {
    const targetId = await this.resolveUserId(rawTargetId);
    if (userId === targetId) {
      throw new BadRequestException('Cannot shortlist yourself');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: {
        profile: true,
        photos: { select: { url: true, isPrimary: true, isVerified: true } },
      },
    });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Always persist targetId in user's favoriteIds list
    await this.addFavoriteId(userId, targetId);

    const existing = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetId },
          { senderId: targetId, receiverId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'REJECTED') {
        throw new BadRequestException('Cannot favorite a declined profile');
      }

      // If already connected/accepted or interest pending, preserve that primary connection status
      // while ensuring the profile is favorited
      if (existing.status === 'ACCEPTED' || existing.status === 'PENDING') {
        return {
          ...existing,
          isShortlisted: true,
          partner: targetUser,
        };
      }
      return this.prisma.connection.update({
        where: { id: existing.id },
        data: { status: 'SHORTLISTED', senderId: userId, receiverId: targetId },
        include: {
          receiver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileId: true,
              profile: true,
              photos: { select: { url: true, isPrimary: true, isVerified: true } },
            },
          },
        },
      });
    }

    return this.prisma.connection.create({
      data: {
        senderId: userId,
        receiverId: targetId,
        status: 'SHORTLISTED',
      },
      include: {
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
            profile: true,
            photos: { select: { url: true, isPrimary: true, isVerified: true } },
          },
        },
      },
    });
  }

  async removeShortlist(userId: string, rawTargetId: string) {
    const targetId = await this.resolveUserId(rawTargetId);
    if (userId === targetId) {
      throw new BadRequestException('Cannot remove yourself');
    }

    // Always remove from favoriteIds
    await this.removeFavoriteId(userId, targetId);

    // Only delete the connection record if its status was SHORTLISTED
    const existing = await this.prisma.connection.findFirst({
      where: {
        senderId: userId,
        receiverId: targetId,
        status: 'SHORTLISTED',
      },
    });

    if (existing) {
      await this.prisma.connection.delete({
        where: { id: existing.id },
      });
    }

    return {
      success: true,
      message: 'Profile removed from shortlist',
      targetId,
    };
  }

  private async safeCount(fn: () => Promise<number>): Promise<number> {
    try {
      return (await fn()) ?? 0;
    } catch {
      return 0;
    }
  }

  async getConnections(
    userId: string,
    type: 'sent' | 'received' | 'matches' | 'shortlisted' | 'shortlisted_by_me' | 'shortlisted_you' | 'declined',
    query: ConnectionQueryDto = {},
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_CONNECTION_LIMIT;
    const skip = (page - 1) * limit;

    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      profileId: true,
      lastActiveAt: true,
      status: true,
      isBanned: true,
      deletedAt: true,
      deactivatedAt: true,
      photos: { select: { url: true, isPrimary: true, isVerified: true } },
      profile: true,
    };

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true },
    });

    let connections: any[] = [];
    let total = 0;

    switch (type) {
      case 'sent': {
        const [sent, count] = await Promise.all([
          this.prisma.connection.findMany({
            where: { senderId: userId, status: 'PENDING' },
            include: { receiver: { select: userSelect } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          this.safeCount(() =>
            this.prisma.connection.count({
              where: { senderId: userId, status: 'PENDING' },
            }),
          ),
        ]);
        connections = sent.map((c: any) => ({
          ...c,
          partner: c.receiver,
        }));
        total = count;
        break;
      }

      case 'received': {
        const [received, count] = await Promise.all([
          this.prisma.connection.findMany({
            where: { receiverId: userId, status: 'PENDING' },
            include: { sender: { select: userSelect } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          this.safeCount(() =>
            this.prisma.connection.count({
              where: { receiverId: userId, status: 'PENDING' },
            }),
          ),
        ]);
        connections = received.map((c: any) => ({
          ...c,
          partner: c.sender,
        }));
        total = count;
        break;
      }

      case 'declined': {
        const [declined, count] = await Promise.all([
          this.prisma.connection.findMany({
            where: { senderId: userId, status: 'REJECTED' },
            include: { receiver: { select: userSelect } },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
          }),
          this.safeCount(() =>
            this.prisma.connection.count({
              where: { senderId: userId, status: 'REJECTED' },
            }),
          ),
        ]);
        connections = declined.map((c: any) => ({
          ...c,
          partner: c.receiver,
        }));
        total = count;
        break;
      }

      case 'shortlisted':
      case 'shortlisted_by_me': {
        const shortlists = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'SHORTLISTED' },
          include: { receiver: { select: userSelect } },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        });
        const listFromConnections = shortlists.map((s: any) => ({
          ...s,
          partner: s.receiver,
          isShortlisted: true,
        }));
        const existingPartnerIds = new Set(
          listFromConnections.map((c: any) => c.partner?.id).filter(Boolean),
        );

        const favoriteIds = await this.getFavoriteIds(userId);
        const remainingFavoriteIds = favoriteIds.filter(
          (id) => !existingPartnerIds.has(id),
        );

        if (remainingFavoriteIds.length > 0) {
          const favoriteUsers = await this.prisma.user.findMany({
            where: {
              id: { in: remainingFavoriteIds },
              status: 'ACTIVE',
              isBanned: false,
              deletedAt: null,
              deactivatedAt: null,
            },
            select: userSelect,
            take: limit,
          });

          const favoriteConnections = await this.prisma.connection.findMany({
            where: {
              OR: [
                { senderId: userId, receiverId: { in: remainingFavoriteIds } },
                { senderId: { in: remainingFavoriteIds }, receiverId: userId },
              ],
            },
          });

          const connMap = new Map<string, any>();
          favoriteConnections.forEach((conn) => {
            const otherId =
              conn.senderId === userId ? conn.receiverId : conn.senderId;
            connMap.set(otherId, conn);
          });

          const listFromFavorites = favoriteUsers.map((u) => {
            const conn = connMap.get(u.id);
            return {
              id: conn?.id || `fav-${u.id}`,
              senderId: userId,
              receiverId: u.id,
              status: conn?.status || 'SHORTLISTED',
              createdAt: conn?.createdAt || new Date(),
              updatedAt: conn?.updatedAt || new Date(),
              partner: u,
              isInterestSent:
                conn?.senderId === userId &&
                (conn?.status === 'PENDING' || conn?.status === 'ACCEPTED'),
              isMatched: conn?.status === 'ACCEPTED',
              isShortlisted: true,
            };
          });

          connections = [...listFromConnections, ...listFromFavorites];
        } else {
          connections = listFromConnections;
        }

        // Total count for shortlisted = SHORTLISTED connections + favorite IDs not already in connections
        const [connCount, favCount] = await Promise.all([
          this.safeCount(() =>
            this.prisma.connection.count({
              where: { senderId: userId, status: 'SHORTLISTED' },
            }),
          ),
          this.safeCount(() =>
            this.prisma.user.count({
              where: {
                id: { in: favoriteIds },
                status: 'ACTIVE',
                isBanned: false,
                deletedAt: null,
                deactivatedAt: null,
              },
            }),
          ),
        ]);
        total = connCount + Math.max(0, favCount - existingPartnerIds.size);
        break;
      }

      case 'shortlisted_you': {
        const [shortlists, count] = await Promise.all([
          this.prisma.connection.findMany({
            where: { receiverId: userId, status: 'SHORTLISTED' },
            include: { sender: { select: userSelect } },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
          }),
          this.safeCount(() =>
            this.prisma.connection.count({
              where: { receiverId: userId, status: 'SHORTLISTED' },
            }),
          ),
        ]);
        connections = shortlists.map((s: any) => ({
          ...s,
          partner: s.sender,
        }));
        total = count;
        break;
      }

      case 'matches': {
        const [matches, count] = await Promise.all([
          this.prisma.connection.findMany({
            where: {
              status: 'ACCEPTED',
              OR: [
                { senderId: userId },
                { receiverId: userId },
              ],
            },
            include: {
              sender: { select: userSelect },
              receiver: { select: userSelect },
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
          }),
          this.safeCount(() =>
            this.prisma.connection.count({
              where: {
                status: 'ACCEPTED',
                OR: [
                  { senderId: userId },
                  { receiverId: userId },
                ],
              },
            }),
          ),
        ]);
        connections = matches.map((m: any) => {
          const isSender = m.senderId === userId;
          const partner = isSender ? m.receiver : m.sender;
          return {
            ...m,
            partner,
            isMutualMatch: true,
          };
        });
        total = count;
        break;
      }

      default:
        throw new BadRequestException('Invalid connection type requested');
    }

    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    const processed = connections
      .map((conn) => {
        const partner =
          conn.partner ||
          (type === 'matches'
            ? conn.senderId === userId
              ? conn.receiver
              : conn.sender
            : conn.receiver || conn.sender);

        return { conn, partner };
      })
      .filter(({ partner }) => {
        if (!partner) return true;
        if (
          partner.isBanned === true ||
          Boolean(partner.deletedAt) ||
          Boolean(partner.deactivatedAt) ||
          (partner.status && partner.status !== 'ACTIVE')
        ) {
          return false;
        }
        return true;
      })
      .map(({ conn, partner }) => {
        if (partner) {
          const score = calculateCompatibility(currentUser, partner);
          if (partner.profile) {
            partner.profile.compatibility = score;
            delete partner.profile.permanentAddress;
          }
          partner.compatibility = score;
          (conn as any).compatibility = score;

          const parsedLastActive = partner.lastActiveAt
            ? new Date(partner.lastActiveAt)
            : null;
          const lastActive =
            parsedLastActive && !isNaN(parsedLastActive.getTime())
              ? parsedLastActive
              : null;
          const isOnline = lastActive
            ? Date.now() - lastActive.getTime() <= FIVE_MINUTES_MS
            : false;
          const lastActiveIso = lastActive
            ? lastActive.toISOString()
            : null;

          partner.isOnline = isOnline;
          partner.online = isOnline;
          partner.lastActiveAt = lastActiveIso;
          (conn as any).isOnline = isOnline;
          (conn as any).lastActiveAt = lastActiveIso;

          delete partner.isBanned;
          delete partner.deletedAt;
          delete partner.deactivatedAt;
          delete partner.status;
        }
        return conn;
      });

    return {
      data: processed,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
