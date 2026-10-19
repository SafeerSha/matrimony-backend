import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { calculateCompatibility } from '../common/utils/compatibility.util';

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
      // If the target user already sent an interest to the caller and it is PENDING:
      // Sending interest back forms a mutual match! Automatically accept it.
      if (existing.senderId === receiverId && existing.receiverId === senderId && existing.status === 'PENDING') {
        const accepted = await this.prisma.connection.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED' },
        });

        await this.notificationsService.createNotification(
          receiverId,
          'INTEREST_ACCEPTED',
          'Someone accepted your interest! You have a new match.',
          senderId
        );

        return { ...accepted, isMatch: true };
      }

      if (existing.status === 'ACCEPTED') {
        return { ...existing, isMatch: true };
      }

      throw new BadRequestException('Connection already exists');
    }

    const connection = await this.prisma.connection.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING',
      },
    });

    await this.notificationsService.createNotification(
      receiverId,
      'NEW_INTEREST',
      'Someone sent you an interest!',
      senderId
    );

    return connection;
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
    });

    await this.notificationsService.createNotification(
      senderId,
      'MATCH_ACCEPTED',
      'Your interest was accepted!',
      receiverId
    );

    return updated;
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

    const existing = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetId },
          { senderId: targetId, receiverId: userId },
        ],
      },
    });

    if (existing) {
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
    });
  }

  async getConnections(userId: string, type: 'sent' | 'received' | 'matches' | 'shortlisted') {
    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      profileId: true,
      photos: true,
      profile: true,
    };

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true },
    });

    let connections: any[] = [];

    switch (type) {
      case 'sent':
        connections = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'PENDING' },
          include: { receiver: { select: userSelect } },
        });
        break;
      case 'received':
        connections = await this.prisma.connection.findMany({
          where: { receiverId: userId, status: 'PENDING' },
          include: { sender: { select: userSelect } },
        });
        break;
      case 'shortlisted':
        connections = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'SHORTLISTED' },
          include: { receiver: { select: userSelect } },
        });
        break;
      case 'matches':
        connections = await this.prisma.connection.findMany({
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
        });
        break;
      default:
        throw new BadRequestException('Invalid connection type requested');
    }

    return connections.map((conn) => {
      const partner =
        type === 'matches'
          ? conn.senderId === userId
            ? conn.receiver
            : conn.sender
          : conn.receiver || conn.sender;

      if (partner) {
        const score = calculateCompatibility(currentUser, partner);
        if (partner.profile) {
          partner.profile.compatibility = score;
        }
        partner.compatibility = score;
        (conn as any).compatibility = score;
      }
      return conn;
    });
  }
}
