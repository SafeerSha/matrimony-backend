import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from '../chat/chat.gateway';
import { SubscriptionService } from '../subscription/subscription.service';
import { calculateCompatibility } from '../common/utils/compatibility.util';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly subscriptionService: SubscriptionService,
  ) {}

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

  async sendInterest(senderId: string, receiverId: string) {
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
          notificationId: notif.id,
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
      notificationId: notif.id,
      partner: partnerForSender,
    });

    return {
      ...updated,
      isMutualMatch: true,
      partner: updated.senderId === receiverId ? updated.receiver : updated.sender,
    };
  }

  async rejectInterest(receiverId: string, senderId: string) {
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

  async shortlistProfile(userId: string, targetId: string) {
    if (userId === targetId) {
      throw new BadRequestException('Cannot shortlist yourself');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

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

      // If already connected/accepted or interest pending, keep that primary connection status!
      if (existing.status === 'ACCEPTED' || existing.status === 'PENDING') {
        return existing;
      }
      return this.prisma.connection.update({
        where: { id: existing.id },
        data: { status: 'SHORTLISTED' },
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

  async removeShortlist(userId: string, targetId: string) {
    if (userId === targetId) {
      throw new BadRequestException('Cannot remove yourself');
    }

    const existing = await this.prisma.connection.findFirst({
      where: {
        senderId: userId,
        receiverId: targetId,
        status: 'SHORTLISTED',
      },
    });

    if (!existing) {
      throw new NotFoundException('Shortlisted profile not found');
    }

    await this.prisma.connection.delete({
      where: { id: existing.id },
    });

    return {
      success: true,
      message: 'Profile removed from shortlist',
      id: existing.id,
      targetId,
    };
  }

  async getConnections(
    userId: string,
    type: 'sent' | 'received' | 'matches' | 'shortlisted' | 'shortlisted_by_me' | 'shortlisted_you' | 'declined',
  ) {
    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      profileId: true,
      photos: { select: { url: true, isPrimary: true, isVerified: true } },
      profile: true,
    };

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true },
    });

    let connections: any[] = [];

    switch (type) {
      case 'sent': {
        const sent = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'PENDING' },
          include: { receiver: { select: userSelect } },
          orderBy: { createdAt: 'desc' },
        });
        connections = sent.map((c: any) => ({
          ...c,
          partner: c.receiver,
        }));
        break;
      }

      case 'received': {
        const received = await this.prisma.connection.findMany({
          where: { receiverId: userId, status: 'PENDING' },
          include: { sender: { select: userSelect } },
          orderBy: { createdAt: 'desc' },
        });
        connections = received.map((c: any) => ({
          ...c,
          partner: c.sender,
        }));
        break;
      }

      case 'declined': {
        const declined = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'REJECTED' },
          include: { receiver: { select: userSelect } },
          orderBy: { updatedAt: 'desc' },
        });
        connections = declined.map((c: any) => ({
          ...c,
          partner: c.receiver,
        }));
        break;
      }

      case 'shortlisted':
      case 'shortlisted_by_me': {
        const shortlists = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'SHORTLISTED' },
          include: { receiver: { select: userSelect } },
          orderBy: { updatedAt: 'desc' },
        });
        connections = shortlists.map((s: any) => ({
          ...s,
          partner: s.receiver,
        }));
        break;
      }

      case 'shortlisted_you': {
        const shortlists = await this.prisma.connection.findMany({
          where: { receiverId: userId, status: 'SHORTLISTED' },
          include: { sender: { select: userSelect } },
          orderBy: { updatedAt: 'desc' },
        });
        connections = shortlists.map((s: any) => ({
          ...s,
          partner: s.sender,
        }));
        break;
      }

      case 'matches': {
        const matches = await this.prisma.connection.findMany({
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
        });

        connections = matches.map((m: any) => {
          const isSender = m.senderId === userId;
          const partner = isSender ? m.receiver : m.sender;
          return {
            ...m,
            partner,
            isMutualMatch: true,
          };
        });
        break;
      }

      default:
        throw new BadRequestException('Invalid connection type requested');
    }

    return connections.map((conn) => {
      const partner =
        conn.partner ||
        (type === 'matches'
          ? conn.senderId === userId
            ? conn.receiver
            : conn.sender
          : conn.receiver || conn.sender);

      if (partner) {
        const score = calculateCompatibility(currentUser, partner);
        if (partner.profile) {
          partner.profile.compatibility = score;
          delete partner.profile.permanentAddress;
        }
        partner.compatibility = score;
        (conn as any).compatibility = score;
      }
      return conn;
    });
  }
}
