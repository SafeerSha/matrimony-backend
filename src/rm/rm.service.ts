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
import type {
  RmCategoryFilter,
  RmMarriageSubCategory,
  RmUserQueryDto,
} from './dto/rm-user-query.dto';
import type { RmFeedbackQueryDto } from './dto/rm-feedback-query.dto';
import type { UpdateRmFeedbackDto } from './dto/update-rm-feedback.dto';
import { sanitizeText } from '../common/utils/sanitize.util';
import type {
  CreateShortlistDto,
  CreateInteractionDto,
  CreateFollowUpDto,
  UpdateFollowUpDto,
  RmCandidateSearchQueryDto,
  RmFollowUpQueryDto,
} from './dto/rm-workflow.dto';

/** Strict select for RM user directory — never expose auth secrets or permanentAddress */
const RM_USER_LIST_SELECT = {
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

const KERALA_CITIES = [
  'Kochi',
  'Thrissur',
  'Calicut',
  'Kottayam',
  'Trivandrum',
  'Palakkad',
  'Kozhikode',
  'Ernakulam',
  'Kannur',
  'Alappuzha',
  'Kollam',
  'Malappuram',
  'Kasaragod',
  'Wayanad',
  'Pathanamthitta',
  'Idukki',
];

const TELUGU_CITIES = [
  'Hyderabad',
  'Visakhapatnam',
  'Vizag',
  'Vijayawada',
  'Guntur',
  'Warangal',
  'Tirupati',
  'Kurnool',
  'Nellore',
  'Rajahmundry',
];

const KERALA_SUBCATEGORY_WHERE: Prisma.UserWhereInput = {
  profile: {
    is: {
      OR: [
        { community: { contains: 'Kerala', mode: 'insensitive' } },
        {
          AND: [
            { OR: [{ community: null }, { community: '' }] },
            {
              OR: [
                { state: { contains: 'Kerala', mode: 'insensitive' } },
                { motherTongue: { contains: 'Malayalam', mode: 'insensitive' } },
                { city: { in: KERALA_CITIES, mode: 'insensitive' } },
              ],
            },
          ],
        },
      ],
    },
  },
};

const TELUGU_SUBCATEGORY_WHERE: Prisma.UserWhereInput = {
  profile: {
    is: {
      OR: [
        { community: { contains: 'Telugu', mode: 'insensitive' } },
        {
          AND: [
            { OR: [{ community: null }, { community: '' }] },
            {
              OR: [
                { state: { contains: 'Andhra', mode: 'insensitive' } },
                { state: { contains: 'Telangana', mode: 'insensitive' } },
                { motherTongue: { contains: 'Telugu', mode: 'insensitive' } },
                { city: { in: TELUGU_CITIES, mode: 'insensitive' } },
              ],
            },
          ],
        },
      ],
    },
  },
};

const BHARAT_SUBCATEGORY_WHERE: Prisma.UserWhereInput = {
  OR: [
    { profile: { is: { community: { contains: 'Bharat', mode: 'insensitive' } } } },
    {
      AND: [
        { NOT: KERALA_SUBCATEGORY_WHERE },
        { NOT: TELUGU_SUBCATEGORY_WHERE },
      ],
    },
  ],
};

@Injectable()
export class RmService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    @Optional()
    private readonly chatGateway?: ChatGateway,
  ) {}

  private buildMarriageSubCategoryWhere(
    subCategories?: RmMarriageSubCategory[],
  ): Prisma.UserWhereInput | null {
    if (!subCategories || subCategories.length === 0) return null;
    const unique = Array.from(new Set(subCategories));
    const conditions: Prisma.UserWhereInput[] = [];
    if (unique.includes('Kerala')) conditions.push(KERALA_SUBCATEGORY_WHERE);
    if (unique.includes('Telugu')) conditions.push(TELUGU_SUBCATEGORY_WHERE);
    if (unique.includes('Bharat')) conditions.push(BHARAT_SUBCATEGORY_WHERE);
    if (conditions.length === 0) return null;
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }

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

    if (params.category === 'Marriage') {
      const subCategoryWhere = this.buildMarriageSubCategoryWhere(params.subCategories);
      if (subCategoryWhere) {
        andConditions.push(subCategoryWhere);
      }
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
    const marriageWhere: Prisma.UserWhereInput = {
      AND: [memberWhere, this.buildCategoryWhere('Marriage')!],
    };
    const [
      total,
      friendship,
      liveIn,
      marriage,
      keralaCount,
      teluguCount,
      bharatCount,
      active,
      paid,
      unverified,
    ] = await Promise.all([
      this.prisma.user.count({ where: memberWhere }),
      this.prisma.user.count({ where: { AND: [memberWhere, FRIENDSHIP_CATEGORY_WHERE] } }),
      this.prisma.user.count({ where: { AND: [memberWhere, LIVE_IN_CATEGORY_WHERE] } }),
      this.prisma.user.count({ where: marriageWhere }),
      this.prisma.user.count({ where: { AND: [marriageWhere, KERALA_SUBCATEGORY_WHERE] } }),
      this.prisma.user.count({ where: { AND: [marriageWhere, TELUGU_SUBCATEGORY_WHERE] } }),
      this.prisma.user.count({ where: { AND: [marriageWhere, BHARAT_SUBCATEGORY_WHERE] } }),
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
      marriageSubCategories: {
        Kerala: keralaCount,
        Telugu: teluguCount,
        Bharat: bharatCount,
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
          where: { type: 'bug', status: { in: ['SUBMITTED', 'IN_REVIEW'] } },
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

  // ==========================================
  // RM Client Workflow & Dashboard
  // ==========================================

  private async checkClientAccess(clientId: string, rmId: string, isAdmin = false) {
    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        role: true,
        assignedRmId: true,
        clientStage: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        profileId: true,
      },
    });
    if (!client || client.role !== 'USER') {
      throw new NotFoundException('Client record not found');
    }
    if (!isAdmin && client.assignedRmId !== rmId) {
      throw new BadRequestException('This client is not assigned to your RM portfolio.');
    }
    return client;
  }

  async getRmDashboard(rmId: string, isAdmin = false) {
    const clientWhere: Prisma.UserWhereInput = {
      role: 'USER',
      ...(isAdmin ? {} : { assignedRmId: rmId }),
    };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const followUpWhereBase: Prisma.RmFollowUpWhereInput = {
      ...(isAdmin ? {} : { rmId }),
    };

    const [
      totalAssignedClients,
      activeClientsCount,
      pendingFollowUpsToday,
      overdueFollowUpsCount,
      totalShortlistsCount,
      totalInteractionsCount,
      recentInteractions,
      upcomingFollowUps,
      stageGrouped,
    ] = await Promise.all([
      this.prisma.user.count({ where: clientWhere }),
      this.prisma.user.count({ where: { ...clientWhere, status: 'ACTIVE' } }),
      this.prisma.rmFollowUp.count({
        where: {
          ...followUpWhereBase,
          status: 'PENDING',
          scheduledAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
      this.prisma.rmFollowUp.count({
        where: {
          ...followUpWhereBase,
          status: 'PENDING',
          scheduledAt: { lt: startOfToday },
        },
      }),
      this.prisma.rmShortlist.count({
        where: isAdmin ? {} : { rmId },
      }),
      this.prisma.rmInteraction.count({
        where: isAdmin ? {} : { rmId },
      }),
      this.prisma.rmInteraction.findMany({
        where: isAdmin ? {} : { rmId },
        take: 5,
        orderBy: { interactionAt: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileId: true,
              email: true,
              clientStage: true,
            },
          },
        },
      }),
      this.prisma.rmFollowUp.findMany({
        where: {
          ...followUpWhereBase,
          status: 'PENDING',
          scheduledAt: { gte: startOfToday },
        },
        take: 5,
        orderBy: { scheduledAt: 'asc' },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileId: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.user.groupBy({
        by: ['clientStage'],
        where: clientWhere,
        _count: { id: true },
      }),
    ]);

    const stageBreakdown: Record<string, number> = {
      NEW_LEAD: 0,
      ONBOARDED: 0,
      EXPLORING: 0,
      SHORTLISTS_SENT: 0,
      MEETING_ARRANGED: 0,
      PROPOSAL_SENT: 0,
      MATCHED: 0,
      INACTIVE: 0,
    };
    stageGrouped.forEach((item: any) => {
      if (item.clientStage) {
        stageBreakdown[item.clientStage] = item._count.id;
      }
    });

    return {
      totalAssignedClients,
      activeClientsCount,
      pendingFollowUpsToday,
      overdueFollowUpsCount,
      totalShortlistsCount,
      totalInteractionsCount,
      stageBreakdown,
      recentInteractions,
      upcomingFollowUps,
    };
  }

  async getMyClients(
    rmId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      stage?: string;
      tier?: string;
    } = {},
    isAdmin = false,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: 'USER',
      ...(isAdmin ? {} : { assignedRmId: rmId }),
    };

    if (query.stage && query.stage !== 'ALL') {
      where.clientStage = query.stage;
    }

    if (query.tier && query.tier !== 'ALL') {
      where.subscriptionTier = query.tier;
    }

    const q = query.search?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { profileId: { contains: q, mode: 'insensitive' } },
        { profile: { city: { contains: q, mode: 'insensitive' } } },
        { profile: { state: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ rmAssignedAt: 'desc' }, { lastActiveAt: 'desc' }],
        select: {
          ...RM_USER_LIST_SELECT,
          assignedRmId: true,
          rmAssignedAt: true,
          clientStage: true,
          profileRejectionReason: true,
          _count: {
            select: {
              clientShortlistsReceived: true,
              clientInteractionsReceived: true,
              clientFollowUpsReceived: {
                where: { status: 'PENDING' },
              },
            },
          },
          clientInteractionsReceived: {
            take: 1,
            orderBy: { interactionAt: 'desc' },
            select: {
              id: true,
              channel: true,
              status: true,
              summary: true,
              interactionAt: true,
            },
          },
          clientFollowUpsReceived: {
            take: 1,
            where: { status: 'PENDING' },
            orderBy: { scheduledAt: 'asc' },
            select: {
              id: true,
              title: true,
              scheduledAt: true,
              priority: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const mappedClients = clients.map((c) => {
      const isSocketOnline = this.chatGateway ? this.chatGateway.isUserOnline(c.id) : false;
      const isRecentlyActive = c.lastActiveAt
        ? Date.now() - new Date(c.lastActiveAt).getTime() < 3 * 60 * 1000
        : false;
      return {
        ...c,
        isOnline: isSocketOnline || isRecentlyActive,
        shortlistCount: c._count.clientShortlistsReceived,
        interactionCount: c._count.clientInteractionsReceived,
        pendingFollowUpsCount: c._count.clientFollowUpsReceived,
        lastInteraction: c.clientInteractionsReceived?.[0] || null,
        nextFollowUp: c.clientFollowUpsReceived?.[0] || null,
      };
    });

    return {
      data: mappedClients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateClientStage(clientId: string, stage: string, rmId: string, isAdmin = false) {
    await this.checkClientAccess(clientId, rmId, isAdmin);

    const updated = await this.prisma.user.update({
      where: { id: clientId },
      data: { clientStage: stage },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileId: true,
        clientStage: true,
      },
    });

    // Auto-log status change interaction
    await this.prisma.rmInteraction.create({
      data: {
        rmId,
        clientId,
        channel: 'NOTE',
        status: 'CONNECTED',
        clientStage: stage,
        summary: `Client progression stage changed to ${stage}`,
      },
    });

    return {
      success: true,
      message: `Client stage updated to ${stage}.`,
      client: updated,
    };
  }

  // ==========================================
  // Shortlists on behalf of clients
  // ==========================================

  async getShortlistsForClient(clientId: string, rmId: string, isAdmin = false) {
    await this.checkClientAccess(clientId, rmId, isAdmin);

    const shortlists = await this.prisma.rmShortlist.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: {
        rm: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        candidate: {
          select: {
            ...RM_USER_DETAIL_SELECT,
            photos: {
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
              select: {
                id: true,
                url: true,
                isPrimary: true,
                isVerified: true,
              },
            },
          },
        },
      },
    });

    return shortlists;
  }

  async createShortlist(clientId: string, dto: CreateShortlistDto, rmId: string, isAdmin = false) {
    await this.checkClientAccess(clientId, rmId, isAdmin);

    if (clientId === dto.candidateId) {
      throw new BadRequestException('Cannot shortlist a member for themselves.');
    }

    const candidate = await this.prisma.user.findUnique({
      where: { id: dto.candidateId },
      select: { id: true, role: true, status: true, firstName: true, lastName: true },
    });
    if (!candidate || candidate.role !== 'USER') {
      throw new NotFoundException('Candidate profile not found.');
    }

    const cleanNotes = dto.notes ? sanitizeText(dto.notes.trim(), 1000) : null;

    const shortlist = await this.prisma.rmShortlist.upsert({
      where: {
        clientId_candidateId: {
          clientId,
          candidateId: dto.candidateId,
        },
      },
      create: {
        rmId,
        clientId,
        candidateId: dto.candidateId,
        notes: cleanNotes,
        status: 'SUGGESTED',
      },
      update: {
        rmId,
        notes: cleanNotes,
        status: 'SUGGESTED',
        updatedAt: new Date(),
      },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
            photos: {
              take: 1,
              orderBy: { isPrimary: 'desc' },
              select: { id: true, url: true, isPrimary: true },
            },
          },
        },
      },
    });

    // Auto-log interaction note
    await this.prisma.rmInteraction.create({
      data: {
        rmId,
        clientId,
        channel: 'NOTE',
        status: 'CONNECTED',
        summary: `Shortlisted candidate profile ${candidate.firstName || ''} (${candidate.id.slice(0, 8)}) for client.`,
      },
    });

    return {
      success: true,
      message: 'Profile shortlisted successfully for client.',
      shortlist,
    };
  }

  async deleteShortlist(clientId: string, candidateId: string, rmId: string, isAdmin = false) {
    await this.checkClientAccess(clientId, rmId, isAdmin);

    await this.prisma.rmShortlist.deleteMany({
      where: {
        clientId,
        candidateId,
      },
    });

    return {
      success: true,
      message: 'Profile removed from client shortlist.',
    };
  }

  async searchCandidateProfiles(
    clientId: string,
    query: RmCandidateSearchQueryDto,
    rmId: string,
    isAdmin = false,
  ) {
    const client = await this.checkClientAccess(clientId, rmId, isAdmin);
    const clientUser = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: {
        profile: {
          select: {
            gender: true,
            community: true,
            religion: true,
            city: true,
            state: true,
          },
        },
        preference: true,
      },
    });

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const andConditions: Prisma.UserWhereInput[] = [
      { role: 'USER' },
      { status: 'ACTIVE' },
      { id: { not: clientId } },
    ];

    // Target opposite gender by default if client gender is known
    const targetGender = query.gender
      ? query.gender
      : clientUser?.profile?.gender === 'Male'
        ? 'Female'
        : clientUser?.profile?.gender === 'Female'
          ? 'Male'
          : undefined;

    if (targetGender && targetGender !== 'ALL') {
      andConditions.push({
        profile: { gender: { equals: targetGender, mode: 'insensitive' } },
      });
    }

    if (query.community) {
      andConditions.push({
        profile: { community: { contains: query.community, mode: 'insensitive' } },
      });
    }

    if (query.religion) {
      andConditions.push({
        profile: { religion: { contains: query.religion, mode: 'insensitive' } },
      });
    }

    if (query.city) {
      andConditions.push({
        profile: { city: { contains: query.city, mode: 'insensitive' } },
      });
    }

    if (query.state) {
      andConditions.push({
        profile: { state: { contains: query.state, mode: 'insensitive' } },
      });
    }

    if (query.education) {
      andConditions.push({
        profile: { education: { contains: query.education, mode: 'insensitive' } },
      });
    }

    if (query.occupation) {
      andConditions.push({
        profile: { occupation: { contains: query.occupation, mode: 'insensitive' } },
      });
    }

    const q = query.search?.trim();
    if (q) {
      andConditions.push({
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { profileId: { contains: q, mode: 'insensitive' } },
          { profile: { city: { contains: q, mode: 'insensitive' } } },
          { profile: { occupation: { contains: q, mode: 'insensitive' } } },
          { profile: { religion: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = {
      AND: andConditions,
    };

    const [candidates, total, existingShortlists] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          ...RM_USER_LIST_SELECT,
          profile: {
            select: {
              ...RM_USER_LIST_SELECT.profile.select,
              bio: true,
              religion: true,
              caste: true,
              annualIncome: true,
              workingPlace: true,
              height: true,
            },
          },
          photos: {
            take: 3,
            orderBy: { isPrimary: 'desc' },
            select: { id: true, url: true, isPrimary: true, isVerified: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
      this.prisma.rmShortlist.findMany({
        where: { clientId },
        select: { candidateId: true, notes: true, status: true },
      }),
    ]);

    const shortlistedMap = new Map(existingShortlists.map((s: { candidateId: string; notes: string | null; status: string }) => [s.candidateId, s]));

    const mapped = candidates.map((cand: any) => {
      const match = shortlistedMap.get(cand.id);
      return {
        ...cand,
        isShortlisted: !!match,
        shortlistNotes: match?.notes || null,
        shortlistStatus: match?.status || null,
      };
    });

    return {
      data: mapped,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================
  // Interaction Tracking
  // ==========================================

  async getInteractions(clientId: string, rmId: string, isAdmin = false) {
    await this.checkClientAccess(clientId, rmId, isAdmin);

    return this.prisma.rmInteraction.findMany({
      where: { clientId },
      orderBy: { interactionAt: 'desc' },
      include: {
        rm: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });
  }

  async createInteraction(
    clientId: string,
    dto: CreateInteractionDto,
    rmId: string,
    isAdmin = false,
  ) {
    const client = await this.checkClientAccess(clientId, rmId, isAdmin);

    const cleanSummary = sanitizeText(dto.summary.trim(), 300);
    if (!cleanSummary) {
      throw new BadRequestException('Interaction summary is required');
    }
    const cleanDetails = dto.details ? sanitizeText(dto.details.trim(), 2000) : null;
    const stage = dto.clientStage || client.clientStage;

    const interaction = await this.prisma.rmInteraction.create({
      data: {
        rmId,
        clientId,
        channel: dto.channel,
        status: dto.status || 'CONNECTED',
        clientStage: stage,
        summary: cleanSummary,
        details: cleanDetails,
        interactionAt: dto.interactionAt ? new Date(dto.interactionAt) : new Date(),
      },
      include: {
        rm: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (dto.clientStage && dto.clientStage !== client.clientStage) {
      await this.prisma.user.update({
        where: { id: clientId },
        data: { clientStage: dto.clientStage },
      });
    }

    return {
      success: true,
      message: 'Interaction recorded successfully.',
      interaction,
    };
  }

  // ==========================================
  // Follow-Up Scheduling
  // ==========================================

  async getFollowUps(rmId: string, query: RmFollowUpQueryDto, isAdmin = false) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const where: Prisma.RmFollowUpWhereInput = {
      ...(isAdmin ? {} : { rmId }),
    };

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.filter === 'today') {
      where.status = 'PENDING';
      where.scheduledAt = { gte: startOfToday, lte: endOfToday };
    } else if (query.filter === 'upcoming') {
      where.status = 'PENDING';
      where.scheduledAt = { gte: startOfToday };
    } else if (query.filter === 'overdue') {
      where.status = 'PENDING';
      where.scheduledAt = { lt: startOfToday };
    } else if (query.filter === 'completed') {
      where.status = 'COMPLETED';
    }

    const followUps = await this.prisma.rmFollowUp.findMany({
      where,
      orderBy: query.filter === 'completed' ? { completedAt: 'desc' } : { scheduledAt: 'asc' },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            profileId: true,
            clientStage: true,
            photos: {
              take: 1,
              orderBy: { isPrimary: 'desc' },
              select: { id: true, url: true },
            },
          },
        },
        rm: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return followUps;
  }

  async createFollowUp(
    clientId: string,
    dto: CreateFollowUpDto,
    rmId: string,
    isAdmin = false,
  ) {
    await this.checkClientAccess(clientId, rmId, isAdmin);

    const cleanTitle = sanitizeText(dto.title.trim(), 200);
    if (!cleanTitle) {
      throw new BadRequestException('Follow-up title is required');
    }
    const cleanDesc = dto.description ? sanitizeText(dto.description.trim(), 1000) : null;

    const followUp = await this.prisma.rmFollowUp.create({
      data: {
        rmId,
        clientId,
        title: cleanTitle,
        description: cleanDesc,
        scheduledAt: new Date(dto.scheduledAt),
        priority: dto.priority || 'MEDIUM',
        status: 'PENDING',
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Follow-up scheduled successfully.',
      followUp,
    };
  }

  async updateFollowUp(
    followUpId: string,
    dto: UpdateFollowUpDto,
    rmId: string,
    isAdmin = false,
  ) {
    const existing = await this.prisma.rmFollowUp.findUnique({
      where: { id: followUpId },
    });
    if (!existing) {
      throw new NotFoundException('Follow-up record not found');
    }
    if (!isAdmin && existing.rmId !== rmId) {
      throw new BadRequestException('You can only update your own scheduled follow-ups');
    }

    const isMarkingCompleted = dto.status === 'COMPLETED';

    const updated = await this.prisma.rmFollowUp.update({
      where: { id: followUpId },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.scheduledAt ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.completionNotes !== undefined
          ? { completionNotes: sanitizeText(dto.completionNotes.trim(), 1000) }
          : {}),
        ...(isMarkingCompleted ? { completedAt: new Date() } : {}),
      },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileId: true,
          },
        },
      },
    });

    return {
      success: true,
      message: isMarkingCompleted
        ? 'Follow-up marked as completed.'
        : 'Follow-up updated successfully.',
      followUp: updated,
    };
  }
}

