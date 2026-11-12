import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import type { RmCategoryFilter, RmUserQueryDto } from './dto/rm-user-query.dto';
import type { RmFeedbackQueryDto } from './dto/rm-feedback-query.dto';
import type { UpdateRmFeedbackDto } from './dto/update-rm-feedback.dto';

/** Strict select for RM user directory — never expose auth secrets or permanentAddress */
const RM_USER_LIST_SELECT = {
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
      category: true,
      community: true,
      lookingIn: true,
      profileFor: true,
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

/** Strict select for RM full profile view — excludes passwordHash, tokens, and permanentAddress */
const RM_USER_DETAIL_SELECT = {
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
      profileFor: true,
      category: true,
      community: true,
      lookingIn: true,
      onboardingStep: true,
      dateOfBirth: true,
      bio: true,
      religion: true,
      caste: true,
      education: true,
      occupation: true,
      employmentStatus: true,
      annualIncome: true,
      workingPlace: true,
      height: true,
      maritalStatus: true,
      city: true,
      state: true,
      country: true,
      motherTongue: true,
      family: true,
      lifestyle: true,
      interests: true,
      lookingFor: true,
      preferences: true,
      fatherName: true,
      nationality: true,
      fatherAlive: true,
      motherAlive: true,
      brothersCount: true,
      brothersMarried: true,
      sistersCount: true,
      sistersMarried: true,
      familyDetails: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  preference: {
    select: {
      id: true,
      minAge: true,
      maxAge: true,
      minHeight: true,
      maxHeight: true,
      religions: true,
      maritalStatuses: true,
      education: true,
      occupations: true,
      employmentStatuses: true,
      location: true,
      diet: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  photos: {
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'desc' as const }],
    select: {
      id: true,
      url: true,
      isPrimary: true,
      isVerified: true,
      createdAt: true,
    },
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
      priorityRanking: true,
    },
  },
} satisfies Prisma.UserSelect;

const RM_FEEDBACK_USER_SELECT = {
  id: true,
  profileId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  photos: {
    take: 1,
    orderBy: { isPrimary: 'desc' as const },
    select: { url: true },
  },
} satisfies Prisma.UserSelect;

const FRIENDSHIP_CATEGORY_WHERE: Prisma.UserWhereInput = {
  profile: {
    is: {
      OR: [
        { category: { contains: 'friend', mode: 'insensitive' } },
        { profileFor: { contains: 'friend', mode: 'insensitive' } },
      ],
    },
  },
};

const LIVE_IN_CATEGORY_WHERE: Prisma.UserWhereInput = {
  profile: {
    is: {
      OR: [
        { category: { contains: 'live', mode: 'insensitive' } },
        { category: { contains: 'living', mode: 'insensitive' } },
        { profileFor: { contains: 'live', mode: 'insensitive' } },
        { profileFor: { contains: 'living', mode: 'insensitive' } },
      ],
    },
  },
};

@Injectable()
export class RmService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    @Optional()
    private readonly chatGateway?: ChatGateway,
  ) {}

  private buildCategoryWhere(category?: RmCategoryFilter): Prisma.UserWhereInput | null {
    if (!category || category === 'ALL') return null;
    if (category === 'Friendship') return FRIENDSHIP_CATEGORY_WHERE;
    if (category === 'Live-In') return LIVE_IN_CATEGORY_WHERE;
    if (category === 'Marriage') {
      return {
        NOT: {
          OR: [FRIENDSHIP_CATEGORY_WHERE, LIVE_IN_CATEGORY_WHERE],
        },
      };
    }
    return null;
  }

  private computeIsOnline(userId: string, lastActiveAt?: Date | string | null): boolean {
    const isSocketOnline = this.chatGateway ? this.chatGateway.isUserOnline(userId) : false;
    const isRecentlyActive = lastActiveAt
      ? Date.now() - new Date(lastActiveAt).getTime() < 3 * 60 * 1000
      : false;
    return isSocketOnline || isRecentlyActive;
  }

  async getUsers(params: RmUserQueryDto = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    // Exclude management/staff roles (RM, ADMIN) from the member directory
    const andConditions: Prisma.UserWhereInput[] = [{ role: 'USER' }];

    const q = params.search?.trim();
    if (q) {
      andConditions.push({
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { profileId: { contains: q, mode: 'insensitive' } },
          { profile: { is: { firstName: { contains: q, mode: 'insensitive' } } } },
          { profile: { is: { lastName: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    const loc = params.location?.trim();
    if (loc) {
      andConditions.push({
        profile: {
          is: {
            OR: [
              { city: { contains: loc, mode: 'insensitive' } },
              { state: { contains: loc, mode: 'insensitive' } },
              { country: { contains: loc, mode: 'insensitive' } },
            ],
          },
        },
      });
    }

    const categoryWhere = this.buildCategoryWhere(params.category);
    if (categoryWhere) {
      andConditions.push(categoryWhere);
    }

    if (params.plan && params.plan !== 'ALL') {
      andConditions.push({ subscriptionTier: params.plan });
    }

    if (params.status && params.status !== 'ALL') {
      switch (params.status) {
        case 'BLOCKED':
          andConditions.push({ isBanned: true });
          break;
        case 'ACTIVE':
          andConditions.push({ isBanned: false, status: 'ACTIVE' });
          break;
        case 'SUSPENDED':
          andConditions.push({ status: 'SUSPENDED' });
          break;
        case 'DEACTIVATED':
          andConditions.push({ status: 'DEACTIVATED' });
          break;
        case 'DELETED':
          andConditions.push({ status: 'DELETED' });
          break;
      }
    }

    if (params.verified === 'VERIFIED') {
      andConditions.push({
        OR: [{ isPhoneVerified: true }, { isEmailVerified: true }],
      });
    } else if (params.verified === 'UNVERIFIED') {
      andConditions.push({
        isPhoneVerified: false,
        isEmailVerified: false,
      });
    }

    if (params.gender && params.gender !== 'ALL') {
      andConditions.push({
        profile: {
          is: {
            gender: { equals: params.gender, mode: 'insensitive' },
          },
        },
      });
    }

    const where: Prisma.UserWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: RM_USER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const mappedUsers = users.map((u) => ({
      ...u,
      isOnline: this.computeIsOnline(u.id, u.lastActiveAt),
    }));

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

  async getUserStats() {
    const memberWhere: Prisma.UserWhereInput = { role: 'USER' };
    const [total, friendship, liveIn, marriage, active, paid, unverified] = await Promise.all([
      this.prisma.user.count({ where: memberWhere }),
      this.prisma.user.count({ where: { AND: [memberWhere, FRIENDSHIP_CATEGORY_WHERE] } }),
      this.prisma.user.count({ where: { AND: [memberWhere, LIVE_IN_CATEGORY_WHERE] } }),
      this.prisma.user.count({ where: { AND: [memberWhere, this.buildCategoryWhere('Marriage')!] } }),
      this.prisma.user.count({ where: { role: 'USER', isBanned: false, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'USER', subscriptionTier: 'PAID' } }),
      this.prisma.user.count({
        where: { role: 'USER', isPhoneVerified: false, isEmailVerified: false },
      }),
    ]);

    return {
      total,
      categories: {
        Marriage: marriage,
        Friendship: friendship,
        'Live-In': liveIn,
      },
      active,
      paid,
      unverified,
    };
  }

  async getUserDetail(rawId: string) {
    const cleanId = rawId.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        role: 'USER',
        OR: [
          { id: cleanId },
          { profileId: { equals: cleanId, mode: 'insensitive' } },
        ],
      },
      select: RM_USER_DETAIL_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [sentInterests, receivedInterests, mutualMatches, feedbackCount] = await Promise.all([
      this.prisma.connection.count({ where: { senderId: user.id, status: 'PENDING' } }),
      this.prisma.connection.count({ where: { receiverId: user.id, status: 'PENDING' } }),
      this.prisma.connection.count({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: user.id }, { receiverId: user.id }],
        },
      }),
      this.prisma.feedback.count({ where: { userId: user.id } }),
    ]);

    return {
      ...user,
      isOnline: this.computeIsOnline(user.id, user.lastActiveAt),
      activityStats: {
        sentInterests,
        receivedInterests,
        mutualMatches,
        feedbackCount,
      },
    };
  }

  async getFeedback(params: RmFeedbackQueryDto = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.FeedbackWhereInput = {};

    if (params.type && params.type !== 'ALL') {
      where.type = params.type;
    }

    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    if (params.priority && params.priority !== 'ALL') {
      where.priority = params.priority;
    }

    if (params.rating) {
      where.rating = params.rating;
    }

    const q = params.search?.trim();
    if (q) {
      where.OR = [
        { message: { contains: q, mode: 'insensitive' } },
        { rmNotes: { contains: q, mode: 'insensitive' } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { profileId: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          rating: true,
          type: true,
          message: true,
          status: true,
          priority: true,
          rmNotes: true,
          reviewedById: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: RM_FEEDBACK_USER_SELECT,
          },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFeedbackStats() {
    const [total, openCount, bugCount, featureCount, generalCount, ratingAgg] =
      await Promise.all([
        this.prisma.feedback.count(),
        this.prisma.feedback.count({
          where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
        }),
        this.prisma.feedback.count({ where: { type: 'bug' } }),
        this.prisma.feedback.count({ where: { type: 'feature' } }),
        this.prisma.feedback.count({ where: { type: 'general' } }),
        this.prisma.feedback.aggregate({
          _avg: { rating: true },
        }),
      ]);

    const avgRating = ratingAgg?._avg?.rating ?? 0;

    return {
      total,
      openCount,
      byType: {
        bug: bugCount,
        feature: featureCount,
        general: generalCount,
      },
      averageRating: Math.round(avgRating * 10) / 10,
    };
  }

  async updateFeedback(feedbackId: string, dto: UpdateRmFeedbackDto, reviewerId: string) {
    if (dto.status === undefined && dto.priority === undefined && dto.rmNotes === undefined) {
      throw new BadRequestException('At least one field (status, priority, or rmNotes) must be provided');
    }

    const existing = await this.prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Feedback record not found');
    }

    return this.prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.rmNotes !== undefined ? { rmNotes: dto.rmNotes.trim() } : {}),
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        userId: true,
        rating: true,
        type: true,
        message: true,
        status: true,
        priority: true,
        rmNotes: true,
        reviewedById: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: RM_FEEDBACK_USER_SELECT,
        },
      },
    });
  }
}

