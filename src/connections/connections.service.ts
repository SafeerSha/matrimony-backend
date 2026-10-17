import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {}

  async sendInterest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot connect with yourself');
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

        await this.notificationsService.createNotification(
          receiverId,
          'MATCH_ACCEPTED',
          'Your interest was accepted! You have a mutual match.',
          senderId
        );

        return {
          ...accepted,
          isMutualMatch: true,
          partner: accepted.senderId === senderId ? accepted.receiver : accepted.sender,
        };
      }

      throw new BadRequestException('Connection already exists');
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
      senderId
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

    await this.notificationsService.createNotification(
      senderId,
      'MATCH_ACCEPTED',
      'Your interest was accepted! You have a mutual match.',
      receiverId
    );

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

    return this.prisma.connection.upsert({
      where: {
        senderId_receiverId: {
          senderId: userId,
          receiverId: targetId,
        },
      },
      update: { status: 'SHORTLISTED' },
      create: {
        senderId: userId,
        receiverId: targetId,
        status: 'SHORTLISTED',
      },
    });
  }

  async getConnections(userId: string, type: 'sent' | 'received' | 'matches') {
    switch (type) {
      case 'sent':
        return this.prisma.connection.findMany({
          where: { senderId: userId },
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
          orderBy: { createdAt: 'desc' },
        });
      case 'received':
        return this.prisma.connection.findMany({
          where: { receiverId: userId, status: 'PENDING' },
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
          },
          orderBy: { createdAt: 'desc' },
        });
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
          orderBy: { updatedAt: 'desc' },
        });

        return matches.map((m: any) => {
          const isSender = m.senderId === userId;
          const partner = isSender ? m.receiver : m.sender;
          return {
            ...m,
            partner,
            isMutualMatch: true,
          };
        });
      }
      default:
        throw new BadRequestException('Invalid connection type requested');
    }
  }
}
