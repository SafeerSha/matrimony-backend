import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const DEMO_PROFILES: Record<string, any> = {
  meera: {
    id: 'meera',
    email: 'meera.nair@demo.ishtamchat.com',
    firstName: 'Meera',
    lastName: 'Nair',
    profileId: 'MAT-89214',
    dateOfBirth: new Date('1998-08-20'),
    gender: 'Female',
    bio: 'Software engineer who loves family time, music and exploring new places.',
    occupation: 'Software Engineer',
    education: 'B.Tech Computer Science',
    city: 'Thrissur',
    country: 'Kerala',
    photos: ['https://i.pravatar.cc/800?u=meera-nair'],
  },
  ananya: {
    id: 'ananya',
    email: 'ananya.menon@demo.ishtamchat.com',
    firstName: 'Ananya',
    lastName: 'Menon',
    profileId: 'MAT-92841',
    dateOfBirth: new Date('1997-04-12'),
    gender: 'Female',
    bio: 'Creative, grounded and close to family.',
    occupation: 'Product Designer',
    education: 'M.Des, NID',
    city: 'Kochi',
    country: 'Kerala',
    photos: ['https://i.pravatar.cc/800?u=ananya-menon'],
  },
  diya: {
    id: 'diya',
    email: 'diya.krishnan@demo.ishtamchat.com',
    firstName: 'Diya',
    lastName: 'Krishnan',
    profileId: 'MAT-86420',
    dateOfBirth: new Date('1995-10-15'),
    gender: 'Female',
    bio: 'Finance professional with a curious mind.',
    occupation: 'Finance Manager',
    education: 'MBA Finance',
    city: 'Bengaluru',
    country: 'Karnataka',
    photos: ['https://i.pravatar.cc/800?u=diya-krishnan'],
  },
  farah: {
    id: 'farah',
    email: 'farah.rahman@demo.ishtamchat.com',
    firstName: 'Farah',
    lastName: 'Rahman',
    profileId: 'MAT-84193',
    dateOfBirth: new Date('1996-06-25'),
    gender: 'Female',
    bio: 'Architect, weekend explorer.',
    occupation: 'Architect',
    education: 'B.Arch',
    city: 'Calicut',
    country: 'Kerala',
    photos: ['https://i.pravatar.cc/800?u=farah-rahman'],
  },
  sana: {
    id: 'sana',
    email: 'sana.thomas@demo.ishtamchat.com',
    firstName: 'Sana',
    lastName: 'Thomas',
    profileId: 'MAT-81932',
    dateOfBirth: new Date('1994-03-18'),
    gender: 'Female',
    bio: 'People-focused HR professional.',
    occupation: 'HR Business Partner',
    education: 'MBA HR',
    city: 'Kottayam',
    country: 'Kerala',
    photos: ['https://i.pravatar.cc/800?u=sana-thomas'],
  },
  riya: {
    id: 'riya',
    email: 'riya.varma@demo.ishtamchat.com',
    firstName: 'Riya',
    lastName: 'Varma',
    profileId: 'MAT-79245',
    dateOfBirth: new Date('1997-09-08'),
    gender: 'Female',
    bio: 'Marketing lead who loves storytelling.',
    occupation: 'Marketing Lead',
    education: 'MBA Marketing',
    city: 'Chennai',
    country: 'Tamil Nadu',
    photos: ['https://i.pravatar.cc/800?u=riya-varma'],
  },
};

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {}

  async ensureTargetUser(targetId: string) {
    // 1. Check if user already exists by ID
    const existing = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (existing) return existing;

    // 2. Check if user exists by profileId or firstName
    const byProfileOrName = await this.prisma.user.findFirst({
      where: {
        OR: [
          { profileId: targetId },
          { firstName: { equals: targetId, mode: 'insensitive' } },
        ],
      },
    });
    if (byProfileOrName) return byProfileOrName;

    // 3. Auto-provision demo user if targetId matches demo profiles
    const key = targetId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const demo = DEMO_PROFILES[key] || DEMO_PROFILES[targetId.toLowerCase()];
    if (demo) {
      try {
        return await this.prisma.user.upsert({
          where: { id: demo.id },
          update: {},
          create: {
            id: demo.id,
            email: demo.email,
            firstName: demo.firstName,
            lastName: demo.lastName,
            profileId: demo.profileId,
            status: 'ACTIVE',
            profile: {
              create: {
                dateOfBirth: demo.dateOfBirth,
                gender: demo.gender,
                bio: demo.bio,
                occupation: demo.occupation,
                education: demo.education,
                city: demo.city,
                country: demo.country,
                state: demo.country,
                maritalStatus: 'Never married',
                religion: 'Not specified',
                motherTongue: 'Malayalam',
              },
            },
            photos: {
              create: demo.photos.map((url: string, idx: number) => ({
                url,
                isPrimary: idx === 0,
                isVerified: true,
              })),
            },
          },
        });
      } catch (err) {
        console.warn('Could not auto-provision demo user in DB:', err);
      }
    }

    return null;
  }

  async sendInterest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot connect with yourself');
    }

    const receiver = (await this.ensureTargetUser(receiverId)) || (await this.prisma.user.findUnique({ where: { id: receiverId } }));
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

    // Ensure target user exists (auto-provisions demo users like 'meera' if not in DB)
    const targetUser = await this.ensureTargetUser(targetId);
    const resolvedTargetId = targetUser?.id || targetId;

    try {
      return await this.prisma.connection.upsert({
        where: {
          senderId_receiverId: {
            senderId: userId,
            receiverId: resolvedTargetId,
          },
        },
        update: { status: 'SHORTLISTED' },
        create: {
          senderId: userId,
          receiverId: resolvedTargetId,
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
    } catch (err: any) {
      console.error('Error upserting shortlist connection:', err);
      return {
        id: `shortlist-${resolvedTargetId}`,
        senderId: userId,
        receiverId: resolvedTargetId,
        status: 'SHORTLISTED',
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async removeShortlist(userId: string, targetId: string) {
    if (userId === targetId) {
      throw new BadRequestException('Cannot remove yourself');
    }

    const targetUser = await this.ensureTargetUser(targetId);
    const resolvedTargetId = targetUser?.id || targetId;

    const existing = await this.prisma.connection.findFirst({
      where: {
        senderId: userId,
        receiverId: resolvedTargetId,
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
    type: 'sent' | 'received' | 'matches' | 'shortlisted' | 'shortlisted_by_me' | 'shortlisted_you',
  ) {
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
      case 'shortlisted':
      case 'shortlisted_by_me': {
        const shortlists = await this.prisma.connection.findMany({
          where: { senderId: userId, status: 'SHORTLISTED' },
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
          orderBy: { updatedAt: 'desc' },
        });

        return shortlists.map((s: any) => ({
          ...s,
          partner: s.receiver,
        }));
      }
      case 'shortlisted_you': {
        const shortlists = await this.prisma.connection.findMany({
          where: { receiverId: userId, status: 'SHORTLISTED' },
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
          orderBy: { updatedAt: 'desc' },
        });

        return shortlists.map((s: any) => ({
          ...s,
          partner: s.sender,
        }));
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
