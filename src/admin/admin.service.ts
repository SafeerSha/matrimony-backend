import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import type { AdminUserQueryDto } from './dto/user-query.dto';

/** Shared select for admin user list — never expose credential fields */
const USER_LIST_SELECT = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  subscriptionTier: true,
  isBanned: true,
  isPhoneVerified: true,
  isEmailVerified: true,
  firstName: true,
  lastName: true,
  profileId: true,
  lastActiveAt: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      city: true,
      state: true,
      country: true,
      occupation: true,
      education: true,
      dateOfBirth: true,
      maritalStatus: true,
      onboardingStep: true,
    },
  },
  photos: {
    take: 1,
    orderBy: { isPrimary: 'desc' as const },
    select: { id: true, url: true, isPrimary: true, isVerified: true },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

  async getUsers(params: AdminUserQueryDto = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    // Full-text search across identity and name fields
    const q = params.search?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { profileId: { contains: q, mode: 'insensitive' } },
        { profile: { firstName: { contains: q, mode: 'insensitive' } } },
        { profile: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // Location filter — city, state, or country in profile
    const loc = params.location?.trim();
    if (loc) {
      where.profile = {
        OR: [
          { city: { contains: loc, mode: 'insensitive' } },
          { state: { contains: loc, mode: 'insensitive' } },
          { country: { contains: loc, mode: 'insensitive' } },
        ],
      };
    }

    // Plan filter (indexed column)
    if (params.plan && params.plan !== 'ALL') {
      where.subscriptionTier = params.plan;
    }

    // Status / block filter (indexed columns)
    if (params.status && params.status !== 'ALL') {
      switch (params.status) {
        case 'BLOCKED':
          where.isBanned = true;
          break;
        case 'ACTIVE':
          where.isBanned = false;
          where.status = 'ACTIVE';
          break;
        case 'SUSPENDED':
          where.status = 'SUSPENDED';
          break;
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: USER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStats() {
    const [totalUsers, totalMatches, unverifiedPhotos] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.connection.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.photo.count({ where: { isVerified: false } }),
    ]);

    return { totalUsers, totalMatches, unverifiedPhotos };
  }

  async banUser(userId: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { isBanned: true },
        select: { id: true, email: true, isBanned: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('User not found');
      throw err;
    }
  }

  async unbanUser(userId: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { isBanned: false },
        select: { id: true, email: true, isBanned: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('User not found');
      throw err;
    }
  }

  async updateSubscriptionTier(userId: string, tier: 'BASIC' | 'PAID') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, subscriptionTier: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Idempotent: If unchanged, return immediately without recording duplicate event
    if (user.subscriptionTier === tier) {
      return user;
    }

    const previousTier = user.subscriptionTier;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { subscriptionTier: tier },
        select: { id: true, email: true, subscriptionTier: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          userId,
          fromTier: previousTier,
          toTier: tier,
          source: 'ADMIN',
        },
      });

      return updated;
    });
  }

  async verifyPhoto(photoId: string, status: 'approved' | 'rejected') {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');

    if (status === 'approved') {
      return this.prisma.photo.update({
        where: { id: photoId },
        data: { isVerified: true },
      });
    }

    // Rejected: delete from DB then storage (order matters for consistency)
    await this.prisma.photo.delete({ where: { id: photoId } });
    await this.storageService.deleteFile({
      url: photo.url,
      objectKey: photo.objectKey,
      storageProvider: photo.storageProvider,
    });

    return { success: true, message: 'Photo rejected and deleted' };
  }
}
