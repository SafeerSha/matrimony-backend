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
import type { AdminUserQueryDto, AssignPlanBodyDto, CreateAdminUserDto, AdminResetPasswordDto, AdminUpdateUserDto } from './dto/user-query.dto';
import type { UpdateCoolingPeriodSettingDto } from './dto/platform-setting.dto';
import type { PhotoModerationQueryDto, PendingProfileQueryDto } from './dto/moderation.dto';

/** Shared select for admin user list — never expose credential fields */
const USER_LIST_SELECT = {
  id: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  deactivatedAt: true,
  deletedAt: true,
  deletedBy: true,
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

    const andConditions: Prisma.UserWhereInput[] = [];

    // Full-text search across identity and name fields
    const q = params.search?.trim();
    if (q) {
      andConditions.push({
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { profileId: { contains: q, mode: 'insensitive' } },
          { profile: { firstName: { contains: q, mode: 'insensitive' } } },
          { profile: { lastName: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    // Location filter — city, state, or country in profile
    const loc = params.location?.trim();
    if (loc) {
      andConditions.push({
        profile: {
          OR: [
            { city: { contains: loc, mode: 'insensitive' } },
            { state: { contains: loc, mode: 'insensitive' } },
            { country: { contains: loc, mode: 'insensitive' } },
          ],
        },
      });
    }

    // Plan filter (indexed column)
    if (params.plan && params.plan !== 'ALL') {
      if (params.plan === 'PAID') {
        andConditions.push({
          OR: [
            { subscriptionTier: { in: ['PAID', 'STANDARD', 'PLUS', 'ELITE', 'PREMIUM'] } },
            { subscription: { status: 'ACTIVE', canChat: true } },
          ],
        });
      } else if (params.plan === 'BASIC') {
        andConditions.push({
          subscriptionTier: 'BASIC',
          OR: [
            { subscription: null },
            { subscription: { status: { not: 'ACTIVE' } } },
            { subscription: { canChat: false } },
          ],
        });
      } else {
        andConditions.push({ subscriptionTier: params.plan });
      }
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
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
        role: true,
        photos: {
          select: { id: true, url: true, objectKey: true, storageProvider: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'ADMIN') {
      throw new BadRequestException('Cannot delete an administrator account.');
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

    // Delete photo records
    await this.prisma.photo.deleteMany({ where: { userId } });

    // Soft delete & permanently block: keep user record so email & phone are blocked from login and re-registration
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedBy: 'ADMIN',
        deletionReason: 'Account terminated by administrator',
        isBanned: true,
        hashedRefreshToken: null,
      },
    });

    // Invalidate device sessions
    await this.prisma.userDevice.deleteMany({ where: { userId } });

    return {
      success: true,
      message: `User ${userId} has been terminated by administrator. Login and registration are permanently blocked.`,
    };
  }

  async resetUserPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const passwordHash = await argon2.hash(newPassword);
    const now = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        isPasswordEnabled: true,
        passwordChangedAt: now,
        hashedRefreshToken: null, // Revoke all existing active sessions
      },
    });

    return {
      success: true,
      message: 'User password has been reset successfully.',
    };
  }

  async updateUser(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        profile: { select: { id: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let cleanEmail: string | undefined = undefined;
    if (dto.email !== undefined) {
      cleanEmail = dto.email.trim().toLowerCase();
      if (!cleanEmail) {
        throw new BadRequestException('Email cannot be empty');
      }
      if (cleanEmail !== user.email?.toLowerCase()) {
        const existing = await this.prisma.user.findFirst({
          where: { email: cleanEmail, NOT: { id: userId } },
        });
        if (existing) {
          throw new ConflictException('An account with this email already exists.');
        }
      }
    }

    let cleanPhone: string | null | undefined = undefined;
    if (dto.phone !== undefined) {
      const trimmedPhone = dto.phone.trim();
      if (trimmedPhone) {
        const normalized = normalizePhoneNumber(trimmedPhone);
        if (!normalized) {
          throw new BadRequestException('Please provide a valid phone number.');
        }
        if (normalized !== user.phone) {
          const existingPhone = await this.prisma.user.findFirst({
            where: { phone: normalized, NOT: { id: userId } },
          });
          if (existingPhone) {
            throw new ConflictException('An account with this phone number already exists.');
          }
        }
        cleanPhone = normalized;
      } else {
        cleanPhone = null;
      }
    }

    const cleanFirst = dto.firstName !== undefined ? sanitizeText(dto.firstName.trim()) : undefined;
    const cleanLast = dto.lastName !== undefined ? (dto.lastName.trim() ? sanitizeText(dto.lastName.trim()) : null) : undefined;

    if (dto.firstName !== undefined && !cleanFirst) {
      throw new BadRequestException('First name cannot be empty');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(cleanEmail !== undefined ? { email: cleanEmail } : {}),
        ...(dto.phone !== undefined ? { phone: cleanPhone } : {}),
        ...(cleanFirst !== undefined ? { firstName: cleanFirst } : {}),
        ...(cleanLast !== undefined ? { lastName: cleanLast } : {}),
        ...(user.profile
          ? {
              profile: {
                update: {
                  ...(cleanFirst !== undefined ? { firstName: cleanFirst } : {}),
                  ...(cleanLast !== undefined ? { lastName: cleanLast } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        isBanned: true,
        profileId: true,
      },
    });

    return {
      success: true,
      message: 'User details updated successfully.',
      user: updatedUser,
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

    const isRevokeAction =
      data.action === 'revoke' ||
      (data.action !== 'apply' &&
        (data.planCode?.toUpperCase() === 'FREE' ||
          data.planCode?.toUpperCase() === 'REVOKE' ||
          data.planId?.toUpperCase() === 'FREE' ||
          data.planId?.toUpperCase() === 'REVOKE'));

    if (isRevokeAction) {
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

  async getCoolingPeriodSetting() {
    const [enabledSetting, daysSetting] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { key: 'COOLING_OFF_PERIOD_ENABLED' } }),
      this.prisma.platformSetting.findUnique({ where: { key: 'COOLING_OFF_PERIOD_DAYS' } }),
    ]);

    return {
      enabled: enabledSetting ? enabledSetting.value === 'true' : true,
      days: daysSetting ? parseInt(daysSetting.value, 10) || 30 : 30,
      updatedAt: enabledSetting?.updatedAt || daysSetting?.updatedAt || new Date(),
      updatedBy: enabledSetting?.updatedBy || daysSetting?.updatedBy || null,
    };
  }

  async updateCoolingPeriodSetting(dto: UpdateCoolingPeriodSettingDto, adminId?: string) {
    const updates: any[] = [
      this.prisma.platformSetting.upsert({
        where: { key: 'COOLING_OFF_PERIOD_ENABLED' },
        create: {
          key: 'COOLING_OFF_PERIOD_ENABLED',
          value: String(dto.enabled),
          description: 'Whether deleted user accounts must undergo a cooling-off period before re-registering',
          updatedBy: adminId,
        },
        update: {
          value: String(dto.enabled),
          updatedBy: adminId,
        },
      }),
    ];

    if (dto.days !== undefined) {
      updates.push(
        this.prisma.platformSetting.upsert({
          where: { key: 'COOLING_OFF_PERIOD_DAYS' },
          create: {
            key: 'COOLING_OFF_PERIOD_DAYS',
            value: String(dto.days),
            description: 'Duration in days for user deletion cooling-off period',
            updatedBy: adminId,
          },
          update: {
            value: String(dto.days),
            updatedBy: adminId,
          },
        }),
      );
    }

    await this.prisma.$transaction(updates);

    const result = await this.getCoolingPeriodSetting();
    return {
      success: true,
      message: dto.enabled
        ? `Cooling-off period restriction has been ENABLED (${result.days} days required before rejoining).`
        : 'Cooling-off period restriction has been DISABLED. Users can now rejoin and recreate profiles immediately.',
      ...result,
    };
  }

  // ==========================================
  // Image Moderation Module
  // ==========================================

  async getPhotosForModeration(query: PhotoModerationQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 24));
    const skip = (page - 1) * limit;

    const where: Prisma.PhotoWhereInput = {};

    if (query.status === 'unverified') {
      where.isVerified = false;
    } else if (query.status === 'verified') {
      where.isVerified = true;
    }

    const q = query.search?.trim();
    if (q) {
      where.user = {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { profileId: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [photos, total, unverifiedCount] = await Promise.all([
      this.prisma.photo.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileId: true,
              status: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.photo.count({ where }),
      this.prisma.photo.count({ where: { isVerified: false } }),
    ]);

    return {
      data: photos,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unverifiedCount,
      },
    };
  }

  async batchVerifyPhotos(photoIds: string[], status: 'approved' | 'rejected') {
    if (!photoIds || photoIds.length === 0) {
      throw new BadRequestException('photoIds cannot be empty');
    }

    if (status === 'approved') {
      const res = await this.prisma.photo.updateMany({
        where: { id: { in: photoIds } },
        data: { isVerified: true },
      });
      return {
        success: true,
        message: `${res.count} photo(s) approved and verified successfully.`,
        count: res.count,
      };
    }

    // Rejected: delete from db and storage
    const photos = await this.prisma.photo.findMany({
      where: { id: { in: photoIds } },
    });

    for (const photo of photos) {
      try {
        await this.storageService.deleteFile({
          url: photo.url,
          objectKey: photo.objectKey,
          storageProvider: photo.storageProvider,
        });
      } catch {
        // storage cleanup failure is non-blocking
      }
    }

    const deleteRes = await this.prisma.photo.deleteMany({
      where: { id: { in: photoIds } },
    });

    return {
      success: true,
      message: `${deleteRes.count} photo(s) rejected and removed.`,
      count: deleteRes.count,
    };
  }

  // ==========================================
  // Profile Approval & Rejection Module
  // ==========================================

  async getPendingProfiles(query: PendingProfileQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: 'USER',
    };

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    const q = query.search?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { profileId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total, pendingCount, rejectedCount] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          ...USER_LIST_SELECT,
          profileRejectionReason: true,
          photos: {
            orderBy: { isPrimary: 'desc' },
            select: { id: true, url: true, isPrimary: true, isVerified: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { role: 'USER', status: 'PENDING_VERIFICATION' } }),
      this.prisma.user.count({ where: { role: 'USER', status: 'REJECTED' } }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        pendingCount,
        rejectedCount,
      },
    };
  }

  async approveProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        profileRejectionReason: null,
      },
      select: USER_LIST_SELECT,
    });

    return {
      success: true,
      message: 'Profile approved successfully. Account is now active.',
      user: updated,
    };
  }

  async rejectProfile(userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const cleanReason = sanitizeText(reason.trim(), 500);
    if (!cleanReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'REJECTED',
        profileRejectionReason: cleanReason,
      },
      select: USER_LIST_SELECT,
    });

    return {
      success: true,
      message: 'Profile rejected. Feedback provided to member.',
      user: updated,
    };
  }

  // ==========================================
  // Relationship Manager (RM) Management
  // ==========================================

  async getRelationshipManagers() {
    const rms = await this.prisma.user.findMany({
      where: { role: 'RM' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        profileId: true,
        status: true,
        isBanned: true,
        lastActiveAt: true,
        createdAt: true,
        _count: {
          select: {
            assignedClients: true,
            rmInteractionsAuthored: true,
            rmFollowUpsAuthored: true,
            rmShortlistsAuthored: true,
          },
        },
      },
    });

    return rms.map((rm) => {
      const isOnline = rm.lastActiveAt
        ? Date.now() - new Date(rm.lastActiveAt).getTime() < 3 * 60 * 1000
        : false;
      return {
        ...rm,
        isOnline,
        assignedClientsCount: rm._count.assignedClients,
        interactionsCount: rm._count.rmInteractionsAuthored,
        followUpsCount: rm._count.rmFollowUpsAuthored,
        shortlistsCount: rm._count.rmShortlistsAuthored,
      };
    });
  }

  async getRmClients(rmId: string) {
    const rm = await this.prisma.user.findUnique({
      where: { id: rmId },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!rm || rm.role !== 'RM') {
      throw new NotFoundException('Relationship Manager not found');
    }

    const clients = await this.prisma.user.findMany({
      where: { assignedRmId: rmId },
      orderBy: { rmAssignedAt: 'desc' },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        profileId: true,
        status: true,
        clientStage: true,
        subscriptionTier: true,
        rmAssignedAt: true,
        lastActiveAt: true,
        profile: {
          select: {
            id: true,
            city: true,
            state: true,
            occupation: true,
            education: true,
            dateOfBirth: true,
            category: true,
            maritalStatus: true,
          },
        },
        photos: {
          take: 1,
          orderBy: { isPrimary: 'desc' },
          select: { id: true, url: true, isPrimary: true, isVerified: true },
        },
        _count: {
          select: {
            clientInteractionsReceived: true,
            clientFollowUpsReceived: true,
            clientShortlistsReceived: true,
          },
        },
      },
    });

    return {
      rm,
      clients,
    };
  }

  async assignClientsToRm(rmId: string, clientUserIds: string[], adminId?: string) {
    const rm = await this.prisma.user.findUnique({
      where: { id: rmId },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!rm || rm.role !== 'RM') {
      throw new NotFoundException('Relationship Manager not found');
    }

    if (!clientUserIds || clientUserIds.length === 0) {
      throw new BadRequestException('clientUserIds cannot be empty');
    }

    const updateRes = await this.prisma.user.updateMany({
      where: {
        id: { in: clientUserIds },
        role: 'USER',
      },
      data: {
        assignedRmId: rmId,
        rmAssignedAt: new Date(),
        rmAssignedBy: adminId || 'ADMIN',
      },
    });

    return {
      success: true,
      message: `Successfully assigned ${updateRes.count} client(s) to ${rm.firstName} ${rm.lastName || ''}.`.trim(),
      assignedCount: updateRes.count,
    };
  }

  async unassignClientsFromRm(clientUserIds: string[]) {
    if (!clientUserIds || clientUserIds.length === 0) {
      throw new BadRequestException('clientUserIds cannot be empty');
    }

    const updateRes = await this.prisma.user.updateMany({
      where: {
        id: { in: clientUserIds },
        role: 'USER',
      },
      data: {
        assignedRmId: null,
        rmAssignedAt: null,
        rmAssignedBy: null,
      },
    });

    return {
      success: true,
      message: `Successfully unassigned ${updateRes.count} client(s).`,
      unassignedCount: updateRes.count,
    };
  }
}
