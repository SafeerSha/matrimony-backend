import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
  Optional,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { SubscriptionService } from '../subscription/subscription.service';
import { ChatGateway } from '../chat/chat.gateway';
import { UsersService } from '../users/users.service';
import { normalizePhoneNumber } from '../common/utils/phone.util';
import { sanitizeText } from '../common/utils/sanitize.util';
import type { AdminUserQueryDto, AssignPlanBodyDto, CreateAdminUserDto } from './dto/user-query.dto';

/** Shared select for admin user list — never expose credential fields */
const USER_LIST_SELECT = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  deactivatedAt: true,
  deletedAt: true,
  deletionReason: true,
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
  subscription: {
    select: {
      id: true,
      tier: true,
      status: true,
      startDate: true,
      expiresAt: true,
      canChat: true,
      contactCredits: true,
      dailyInterestsLimit: true,
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly subscriptionService: SubscriptionService,
    @Inject(forwardRef(() => ChatGateway))
    @Optional()
    private readonly chatGateway?: ChatGateway,
    @Optional()
    private readonly usersService?: UsersService,
  ) {}

  async createUser(dto: CreateAdminUserDto) {
    const email = dto.email.trim().toLowerCase();
    const firstName = sanitizeText(dto.firstName, 100);
    const lastName = sanitizeText(dto.lastName, 100) || null;

    if (!firstName) {
      throw new BadRequestException('First name is required');
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingByEmail) {
      throw new ConflictException('A user with this email address already exists.');
    }

    let normalizedPhone: string | null = null;
    if (dto.phone && dto.phone.trim().length > 0) {
      normalizedPhone = normalizePhoneNumber(dto.phone.trim());
      if (!normalizedPhone) {
        throw new BadRequestException('Please provide a valid phone number.');
      }
      const existingByPhone = await this.prisma.user.findUnique({
        where: { phone: normalizedPhone },
        select: { id: true },
      });
      if (existingByPhone) {
        throw new ConflictException('A user with this phone number already exists.');
      }
    }

    const passwordHash = await argon2.hash(dto.password);
    const profileId = this.usersService
      ? await this.usersService.generateUniqueProfileId()
      : `IMC-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const isRm = dto.role === 'RM';
    const now = new Date();

    const createdUser = await this.prisma.user.create({
      data: {
        email,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        passwordHash,
        isPasswordEnabled: true,
        passwordChangedAt: now,
        isEmailVerified: true,
        firstName,
        lastName,
        profileId,
        role: isRm ? 'RM' : 'USER',
        // Normal users start in DRAFT so login routes them into the onboarding flow;
        // RM users start ACTIVE so they enter /rm directly without onboarding.
        status: isRm ? 'ACTIVE' : 'DRAFT',
        ...(!isRm
          ? {
              profile: {
                create: {
                  firstName,
                  lastName,
                  onboardingStep: 1,
                },
              },
            }
          : {}),
      },
      select: USER_LIST_SELECT,
    });

    return {
      ...createdUser,
      isOnline: false,
    };
  }

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

    // Role filter (USER vs RM)
    if (params.role && params.role !== 'ALL') {
      where.role = params.role;
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
        case 'DEACTIVATED':
          where.status = 'DEACTIVATED';
          break;
        case 'DELETED':
          where.status = 'DELETED';
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

    const mappedUsers = users.map((u) => {
      const isSocketOnline = this.chatGateway ? this.chatGateway.isUserOnline(u.id) : false;
      const isRecentlyActive = u.lastActiveAt
        ? Date.now() - new Date(u.lastActiveAt).getTime() < 3 * 60 * 1000
        : false;
      return {
        ...u,
        isOnline: isSocketOnline || isRecentlyActive,
      };
    });

    return {
      data: mappedUsers,
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

  async updateUserStatus(
    userId: string,
    newStatus: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'DEACTIVATED',
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updateData: Prisma.UserUpdateInput = {};

    if (newStatus === 'BLOCKED') {
      updateData.isBanned = true;
    } else if (newStatus === 'ACTIVE') {
      updateData.isBanned = false;
      updateData.status = 'ACTIVE';
      updateData.deactivatedAt = null;
      updateData.deletedAt = null;
      updateData.deletionReason = null;
    } else if (newStatus === 'SUSPENDED') {
      updateData.isBanned = false;
      updateData.status = 'SUSPENDED';
    } else if (newStatus === 'DEACTIVATED') {
      updateData.isBanned = false;
      updateData.status = 'DEACTIVATED';
      updateData.deactivatedAt = new Date();
      updateData.deletionReason = 'Deactivated by administrator';
    }

    return await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        status: true,
        isBanned: true,
        deactivatedAt: true,
        deletedAt: true,
      },
    });
  }

  async reactivateUser(userId: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'ACTIVE',
          deactivatedAt: null,
          deletionReason: null,
        },
        select: { id: true, email: true, status: true, deactivatedAt: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('User not found');
      throw err;
    }
  }

  async restoreUser(userId: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          deletionReason: null,
        },
        select: { id: true, email: true, status: true, deletedAt: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') throw new NotFoundException('User not found');
      throw err;
    }
  }

  async purgeUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        photos: {
          select: { id: true, url: true, objectKey: true, storageProvider: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Clean up physical photos from storage
    for (const photo of user.photos) {
      try {
        await this.storageService.deleteFile({
          url: photo.url,
          objectKey: photo.objectKey,
          storageProvider: photo.storageProvider,
        });
      } catch {
        // Storage asset cleanup errors are non-blocking
      }
    }

    // Cascade delete user in database
    await this.prisma.user.delete({ where: { id: userId } });

    return {
      success: true,
      message: `User ${userId} and all related records have been permanently purged.`,
    };
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

  async updateSubscriptionTier(userId: string, tier: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, subscriptionTier: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const normalizedTier = tier.toUpperCase();
    if (normalizedTier === 'BASIC' || normalizedTier === 'FREE') {
      await this.subscriptionService.cancelChatPermit(userId);
    } else {
      await this.subscriptionService.activatePermit(userId, normalizedTier, undefined, undefined, true);
    }

    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_LIST_SELECT,
    });
    return updated;
  }

  async assignUserPlan(
    userId: string,
    data: AssignPlanBodyDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, subscriptionTier: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (data.action === 'revoke' || data.planCode?.toUpperCase() === 'BASIC' || data.planCode?.toUpperCase() === 'FREE') {
      const result = await this.subscriptionService.cancelChatPermit(userId);
      const updatedUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: USER_LIST_SELECT,
      });
      return {
        success: true,
        message: 'Subscription plan revoked / reset to Basic',
        user: updatedUser,
        subscription: result.subscription,
      };
    }

    const planIdentifier = data.planId || data.planCode || 'BASIC';
    const result = await this.subscriptionService.activatePermit(
      userId,
      planIdentifier,
      undefined,
      data.customDurationDays,
      true, // isAdminGrant
    );

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_LIST_SELECT,
    });

    return {
      success: true,
      message: result.message,
      user: updatedUser,
      subscription: result.subscription,
    };
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
