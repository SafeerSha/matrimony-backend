import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

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
      throw new BadRequestException('Connection already exists');
    }

    return this.prisma.connection.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING',
      },
    });
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

    return this.prisma.connection.update({
      where: { id: connection.id },
      data: { status: 'ACCEPTED' },
    });
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
          include: { receiver: { select: { id: true, firstName: true, lastName: true, profile: true } } },
        });
      case 'received':
        return this.prisma.connection.findMany({
          where: { receiverId: userId, status: 'PENDING' },
          include: { sender: { select: { id: true, firstName: true, lastName: true, profile: true } } },
        });
      case 'matches':
        return this.prisma.connection.findMany({
          where: {
            status: 'ACCEPTED',
            OR: [
              { senderId: userId },
              { receiverId: userId },
            ],
          },
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, profile: true } },
            receiver: { select: { id: true, firstName: true, lastName: true, profile: true } },
          },
        });
      default:
        throw new BadRequestException('Invalid connection type requested');
    }
  }
}
