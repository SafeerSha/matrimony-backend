import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface PlanConfig {
  id: string;
  name: string;
  badge?: string;
  price: number;
  formattedPrice: string;
  period: string;
  durationDays: number;
  description: string;
  features: string[];
  contactCredits: number;
  dailyInterestsLimit: number;
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: PlanConfig[] = [
  {
    id: 'BASIC',
    name: '1 Month Chat Permit',
    badge: 'Basic',
    price: 500,
    formattedPrice: '₹500',
    period: 'per month',
    durationDays: 30,
    description: 'Active Premium for 30 days with verified contacts and daily interest quota.',
    features: [
      'Active Premium for 30 days',
      'Send "Interests" only 20 per day',
      'Unlimited messaging with matches',
      'Standard Profile Visibility',
      'Verified Contact Numbers - 20',
    ],
    contactCredits: 20,
    dailyInterestsLimit: 20,
  },
  {
    id: 'STANDARD',
    name: '3 Months Chat Permit',
    badge: 'Standard',
    price: 1250,
    formattedPrice: '₹1,250',
    period: 'for 90 days',
    durationDays: 90,
    description: 'Our most popular plan. Active matchmaking with verified connections.',
    features: [
      'Active Premium for 90 days',
      'Send "Interests" only 40/ day',
      'Unlimited messaging with matches',
      'Priority profile visibility',
      'Can View/Get Verified Contact Numbers',
    ],
    contactCredits: 60,
    dailyInterestsLimit: 40,
    popular: true,
  },
  {
    id: 'PLUS',
    name: '6 Months Permit',
    badge: 'Plus',
    price: 2500,
    formattedPrice: '₹2,500',
    period: 'for 180 days',
    durationDays: 180,
    description: 'Serious about finding a match with extended priority connection time.',
    features: [
      'Active Premium for 180 days',
      'Send "Interests" - Unlimited',
      'Unlimited messaging with matches',
      'High profile visibility',
      'Can View/Get 120 verified Contact Numbers',
    ],
    contactCredits: 120,
    dailyInterestsLimit: 9999,
  },
  {
    id: 'ELITE',
    name: 'One year Chat permit',
    badge: 'Elite',
    price: 5000,
    formattedPrice: '₹5,000',
    period: 'for one year',
    durationDays: 365,
    description: 'Complete peace of mind with one year of full unlimited access.',
    features: [
      'Active premium for one year',
      'Send interests unlimited',
      'Unlimited chat with matches',
      'High profile visibility.',
      'Can get unlimited contact numbers.',
    ],
    contactCredits: 9999,
    dailyInterestsLimit: 9999,
  },
];

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPlans(): Promise<PlanConfig[]> {
    try {
      const dbPlans = await this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
      });

      if (dbPlans && dbPlans.length > 0) {
        return dbPlans.map((p) => ({
          id: p.code,
          name: p.name,
          badge: p.badge || undefined,
          price: p.price,
          formattedPrice: p.formattedPrice || `₹${p.price.toLocaleString('en-IN')}`,
          period: p.period,
          durationDays: p.durationDays,
          description: p.description || '',
          features: p.features || [],
          contactCredits: p.contactCredits,
          dailyInterestsLimit: p.dailyInterestsLimit,
          popular: p.popular,
        }));
      }

      // If database has no plans yet, seed the default plans
      await this.seedDefaultPlans();
      const seeded = await this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
      });
      return seeded.map((p) => ({
        id: p.code,
        code: p.code,
        dbId: p.id,
        name: p.name,
        badge: p.badge || undefined,
        price: p.price,
        formattedPrice: p.formattedPrice || `₹${p.price.toLocaleString('en-IN')}`,
        period: p.period,
        durationDays: p.durationDays,
        description: p.description || '',
        features: p.features || [],
        contactCredits: p.contactCredits,
        dailyInterestsLimit: p.dailyInterestsLimit,
        popular: p.popular,
      }));
    } catch (err: any) {
      this.logger.error(`Error loading plans from database: ${err?.message}`);
      return SUBSCRIPTION_PLANS;
    }
  }

  async seedDefaultPlans() {
    try {
      for (let i = 0; i < SUBSCRIPTION_PLANS.length; i++) {
        const p = SUBSCRIPTION_PLANS[i];
        await this.prisma.plan.upsert({
          where: { code: p.id },
          create: {
            code: p.id,
            name: p.name,
            badge: p.badge || null,
            price: p.price,
            formattedPrice: p.formattedPrice,
            period: p.period,
            durationDays: p.durationDays,
            description: p.description,
            features: p.features,
            contactCredits: p.contactCredits,
            dailyInterestsLimit: p.dailyInterestsLimit,
            popular: Boolean(p.popular),
            isActive: true,
            displayOrder: i + 1,
          },
          update: {
            name: p.name,
            badge: p.badge || null,
            price: p.price,
            formattedPrice: p.formattedPrice,
            period: p.period,
            durationDays: p.durationDays,
            description: p.description,
            features: p.features,
            contactCredits: p.contactCredits,
            dailyInterestsLimit: p.dailyInterestsLimit,
            popular: Boolean(p.popular),
            isActive: true,
            displayOrder: i + 1,
          },
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to seed default plans: ${err?.message}`);
    }
  }

  async getAllPlansAdmin() {
    try {
      const count = await this.prisma.plan.count();
      if (count === 0) {
        await this.seedDefaultPlans();
      }
      return this.prisma.plan.findMany({
        orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
      });
    } catch (err: any) {
      this.logger.error(`Error in getAllPlansAdmin: ${err?.message}`);
      return [];
    }
  }

  async createPlan(dto: {
    code?: string;
    name: string;
    price: number;
    period: string;
    durationDays: number;
    badge?: string;
    description?: string;
    features?: string[];
    contactCredits?: number;
    dailyInterestsLimit?: number;
    popular?: boolean;
    isActive?: boolean;
    displayOrder?: number;
  }) {
    if (!dto.name) {
      throw new BadRequestException('Plan name is required.');
    }
    const code = (dto.code || dto.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()).trim().toUpperCase();

    const existing = await this.prisma.plan.findUnique({
      where: { code },
    });
    if (existing) {
      throw new BadRequestException(`A plan with code "${code}" already exists.`);
    }

    const price = Number(dto.price) >= 0 ? Number(dto.price) : 0;
    const formattedPrice = `₹${price.toLocaleString('en-IN')}`;

    const willBeActive = dto.isActive !== undefined ? Boolean(dto.isActive) : true;
    if (dto.popular && !willBeActive) {
      throw new BadRequestException('Cannot set an inactive/hidden plan as Most Popular. Please activate the plan first.');
    }

    // Enforce at most one popular plan
    if (dto.popular && willBeActive) {
      await this.prisma.plan.updateMany({
        data: { popular: false },
      });
    }

    return this.prisma.plan.create({
      data: {
        code,
        name: dto.name.trim(),
        badge: dto.badge ? dto.badge.trim() : null,
        price,
        formattedPrice,
        period: dto.period ? dto.period.trim() : 'per month',
        durationDays: Number(dto.durationDays) || 30,
        description: dto.description ? dto.description.trim() : null,
        features: Array.isArray(dto.features) ? dto.features.filter(Boolean) : [],
        contactCredits: dto.contactCredits !== undefined ? Number(dto.contactCredits) : 10,
        dailyInterestsLimit: dto.dailyInterestsLimit !== undefined ? Number(dto.dailyInterestsLimit) : 25,
        popular: Boolean(dto.popular),
        isActive: dto.isActive !== undefined ? Boolean(dto.isActive) : true,
        displayOrder: dto.displayOrder !== undefined ? Number(dto.displayOrder) : 0,
      },
    });
  }

  async updatePlan(id: string, dto: {
    name?: string;
    code?: string;
    badge?: string;
    price?: number;
    period?: string;
    durationDays?: number;
    description?: string;
    features?: string[];
    contactCredits?: number;
    dailyInterestsLimit?: number;
    popular?: boolean;
    isActive?: boolean;
    displayOrder?: number;
  }) {
    const existing = await this.prisma.plan.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new BadRequestException('Plan not found.');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (code !== existing.code) {
        const conflict = await this.prisma.plan.findUnique({ where: { code } });
        if (conflict) throw new BadRequestException(`Code "${code}" is already in use.`);
        data.code = code;
      }
    }
    if (dto.badge !== undefined) data.badge = dto.badge ? dto.badge.trim() : null;
    if (dto.price !== undefined) {
      const price = Number(dto.price) >= 0 ? Number(dto.price) : 0;
      data.price = price;
      data.formattedPrice = `₹${price.toLocaleString('en-IN')}`;
    }
    if (dto.period !== undefined) data.period = dto.period.trim();
    if (dto.durationDays !== undefined) data.durationDays = Number(dto.durationDays);
    if (dto.description !== undefined) data.description = dto.description ? dto.description.trim() : null;
    if (dto.features !== undefined) data.features = Array.isArray(dto.features) ? dto.features.filter(Boolean) : [];
    if (dto.contactCredits !== undefined) data.contactCredits = Number(dto.contactCredits);
    if (dto.dailyInterestsLimit !== undefined) data.dailyInterestsLimit = Number(dto.dailyInterestsLimit);
    const targetActive = dto.isActive !== undefined ? Boolean(dto.isActive) : existing.isActive;

    if (dto.popular === true && !targetActive) {
      throw new BadRequestException('Cannot set an inactive/hidden plan as Most Popular. Please activate the plan first.');
    }

    if (dto.isActive !== undefined) {
      data.isActive = Boolean(dto.isActive);
      // If deactivating, also reset popular to false
      if (!data.isActive) {
        data.popular = false;
      }
    }

    if (dto.popular !== undefined && targetActive) {
      data.popular = Boolean(dto.popular);
      if (data.popular) {
        // Enforce at most one popular plan
        await this.prisma.plan.updateMany({
          where: { id: { not: existing.id } },
          data: { popular: false },
        });
      }
    }
    if (dto.displayOrder !== undefined) data.displayOrder = Number(dto.displayOrder);

    return this.prisma.plan.update({
      where: { id: existing.id },
      data,
    });
  }

  async deletePlan(id: string) {
    const existing = await this.prisma.plan.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new BadRequestException('Plan not found.');
    }
    return this.prisma.plan.delete({
      where: { id: existing.id },
    });
  }

  async togglePlanActive(id: string) {
    const existing = await this.prisma.plan.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new BadRequestException('Plan not found.');
    }

    const newActiveState = !existing.isActive;
    const data: any = { isActive: newActiveState };
    // If deactivating, ensure popular is unset
    if (!newActiveState && existing.popular) {
      data.popular = false;
    }

    return this.prisma.plan.update({
      where: { id: existing.id },
      data,
    });
  }

  async togglePlanPopular(id: string) {
    const existing = await this.prisma.plan.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!existing) {
      throw new BadRequestException('Plan not found.');
    }

    const willBePopular = !existing.popular;

    // Disallow making an inactive plan popular
    if (willBePopular && !existing.isActive) {
      throw new BadRequestException('Cannot set an inactive/hidden plan as Most Popular. Please activate the plan first.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (willBePopular) {
        // Enforce single popular plan: reset all other plans
        await tx.plan.updateMany({
          where: { id: { not: existing.id } },
          data: { popular: false },
        });
      }

      return tx.plan.update({
        where: { id: existing.id },
        data: { popular: willBePopular },
      });
    });
  }

  async getUserSubscription(userId: string) {
    try {
      const [sub, user] = await Promise.all([
        this.prisma.subscription.findUnique({
          where: { userId },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, subscriptionTier: true },
        }),
      ]);

      const now = new Date();
      const isExpired = sub?.expiresAt ? new Date(sub.expiresAt) <= now : false;

      // Check if user has an active chat permit
      // Supports both new Subscription table and legacy User.subscriptionTier
      const isSubscribed = Boolean(
        (sub && sub.status === 'ACTIVE' && sub.canChat && !isExpired) ||
        (user?.subscriptionTier && ['PLUS', 'ELITE', 'PREMIUM'].includes(user.subscriptionTier.toUpperCase()))
      );

      const rawTier = isSubscribed
        ? (sub?.tier || user?.subscriptionTier || 'BASIC')
        : 'FREE';

      let activeTier = rawTier;
      let tierName = rawTier;

      if (isSubscribed && rawTier !== 'FREE') {
        const matchedPlan = await this.prisma.plan.findFirst({
          where: {
            OR: [
              { id: rawTier },
              { code: rawTier.toUpperCase() },
            ],
          },
        });

        if (matchedPlan) {
          activeTier = matchedPlan.code;
          tierName = matchedPlan.name;
        }
      }

      const daysRemaining = sub?.expiresAt && !isExpired
        ? Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      // Daily interest quota check
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailyLimit = isSubscribed ? (sub?.dailyInterestsLimit || 50) : 10;
      let quotaRecord: any = null;
      try {
        quotaRecord = await this.prisma.userDailyQuota.findUnique({
          where: {
            userId_date: {
              userId,
              date: today,
            },
          },
        });
      } catch (quotaErr: any) {
        this.logger.warn(`Could not read daily quota for ${userId}: ${quotaErr?.message}`);
      }

      const interestsSentToday = quotaRecord?.interestsSent || 0;
      const dailyInterestsRemaining = Math.max(0, dailyLimit - interestsSentToday);

      let unlockedContactsCount = 0;
      try {
        unlockedContactsCount = await this.prisma.contactUnlock.count({
          where: { userId },
        });
      } catch (unlockErr: any) {
        this.logger.warn(`Could not count unlocked contacts for ${userId}: ${unlockErr?.message}`);
      }

      const isUnlimitedInterests = dailyLimit >= 9000;
      const isUnlimitedContacts = (sub?.contactCredits || 0) >= 9000;

      return {
        userId,
        tier: activeTier,
        tierName,
        status: isSubscribed ? 'ACTIVE' : (isExpired ? 'EXPIRED' : 'INACTIVE'),
        isSubscribed,
        canChat: isSubscribed,
        expiresAt: sub?.expiresAt || null,
        daysRemaining,
        contactCredits: sub?.contactCredits || 0,
        unlockedContactsCount,
        dailyInterestsLimit: dailyLimit,
        dailyInterestsSentToday: interestsSentToday,
        dailyInterestsRemaining,
        usage: {
          messaging: {
            allowed: isSubscribed,
            unlimited: isSubscribed,
          },
          interests: {
            dailyLimit,
            sentToday: interestsSentToday,
            remainingToday: dailyInterestsRemaining,
            isUnlimited: isUnlimitedInterests,
          },
          contacts: {
            creditsRemaining: sub?.contactCredits || 0,
            unlockedCount: unlockedContactsCount,
            isUnlimited: isUnlimitedContacts,
          },
          visibility: {
            level:
              activeTier === 'ELITE'
                ? 'Highest VIP Visibility'
                : activeTier === 'PLUS'
                ? 'High Visibility'
                : activeTier === 'STANDARD'
                ? 'Priority Visibility'
                : 'Standard Profile Visibility',
            boost:
              activeTier === 'ELITE'
                ? 30
                : activeTier === 'PLUS'
                ? 20
                : activeTier === 'STANDARD'
                ? 10
                : 0,
          },
        },
      };
    } catch (err: any) {
      this.logger.error(`Error calculating user subscription for ${userId}: ${err?.message}`, err?.stack);
      return {
        userId,
        tier: 'FREE',
        tierName: 'FREE',
        status: 'INACTIVE',
        isSubscribed: false,
        canChat: false,
        expiresAt: null,
        daysRemaining: 0,
        contactCredits: 0,
        unlockedContactsCount: 0,
        dailyInterestsLimit: 10,
        dailyInterestsSentToday: 0,
        dailyInterestsRemaining: 10,
        usage: {
          messaging: { allowed: false, unlimited: false },
          interests: { dailyLimit: 10, sentToday: 0, remainingToday: 10, isUnlimited: false },
          contacts: { creditsRemaining: 0, unlockedCount: 0, isUnlimited: false },
          visibility: { level: 'Standard Profile Visibility', boost: 0 },
        },
      };
    }
  }

  /**
   * Fast server-side boolean check used by guards & WebSockets.
   */
  async hasActiveChatPermit(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const [sub, user] = await Promise.all([
        this.prisma.subscription.findUnique({
          where: { userId },
          select: { status: true, canChat: true, expiresAt: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptionTier: true, role: true },
        }),
      ]);

      // Admin or RM always bypasses permit requirements
      if (user?.role === 'ADMIN' || user?.role === 'RM') {
        return true;
      }

      if (sub && sub.status === 'ACTIVE' && sub.canChat) {
        if (!sub.expiresAt || new Date(sub.expiresAt) > new Date()) {
          return true;
        }
      }

      if (user?.subscriptionTier && ['PLUS', 'ELITE', 'PREMIUM'].includes(user.subscriptionTier.toUpperCase())) {
        return true;
      }

      return false;
    } catch (err: any) {
      this.logger.error(`Error checking permit for user ${userId}: ${err?.message}`);
      return false;
    }
  }

  /**
   * Activates or extends a member's chat permit.
   */
  async activatePermit(
    userId: string,
    tierName: string,
    paymentDetails?: { paymentId?: string; amount?: number },
    customDurationDays?: number,
    isAdminGrant?: boolean,
  ) {
    const isFreeTrial = process.env.ENABLE_FREE_TRIAL !== 'false';
    if (!isAdminGrant && !isFreeTrial && (!paymentDetails?.paymentId || paymentDetails.paymentId.startsWith('DEMO-'))) {
      throw new BadRequestException('Payment is required to activate subscription. Free trial mode is disabled.');
    }

    const normalizedTier = (tierName || 'BASIC').toUpperCase();
    let dbPlan = await this.prisma.plan.findFirst({
      where: {
        OR: [{ code: normalizedTier }, { id: tierName }],
      },
    });

    const plan = dbPlan || SUBSCRIPTION_PLANS.find((p) => p.id === normalizedTier) || SUBSCRIPTION_PLANS[0];

    const planCode = (plan as any).code || plan.id;

    this.logger.log(
      `[SubscriptionService] activatePermit requested: user=${userId}, plan=${normalizedTier}, source=${isAdminGrant ? 'ADMIN' : paymentDetails?.paymentId ? 'GATEWAY' : 'MANUAL_ACTIVATION'}, paymentId=${paymentDetails?.paymentId || 'NONE'}, amount=₹${paymentDetails?.amount || plan.price}`,
    );

    // Execute atomic transaction to prevent concurrent dual-activation race condition
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { userId },
      });

      // Strict Idempotency & Concurrency Guard:
      // If this exact gateway paymentId was already applied by a concurrent webhook or redirect, skip.
      if (
        paymentDetails?.paymentId &&
        existing?.paymentId === paymentDetails.paymentId &&
        existing?.status === 'ACTIVE'
      ) {
        this.logger.log(
          `[SubscriptionService] Idempotency trigger: Payment ${paymentDetails.paymentId} was already activated for user ${userId}. Idempotent exit.`,
        );
        return {
          success: true,
          message: `Chat permit already active for ${plan.name}`,
          subscription: existing,
        };
      }

      const now = new Date();
      // If existing permit is still active, extend it by the plan's duration
      const baseDate = existing?.expiresAt && new Date(existing.expiresAt) > now
        ? new Date(existing.expiresAt)
        : now;

      const durationDays = customDurationDays && customDurationDays > 0 ? customDurationDays : plan.durationDays;
      const expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const subscription = await tx.subscription.upsert({
        where: { userId },
        create: {
          userId,
          tier: planCode,
          status: 'ACTIVE',
          canChat: true,
          expiresAt,
          contactCredits: plan.contactCredits,
          dailyInterestsLimit: plan.dailyInterestsLimit,
          paymentId: paymentDetails?.paymentId || (isAdminGrant ? `ADMIN-GRANT-${Date.now()}` : `DEMO-${Date.now()}`),
          amountPaid: paymentDetails?.amount || (isAdminGrant ? 0 : plan.price),
        },
        update: {
          tier: planCode,
          status: 'ACTIVE',
          canChat: true,
          expiresAt,
          contactCredits: { increment: plan.contactCredits },
          dailyInterestsLimit: plan.dailyInterestsLimit,
          paymentId: paymentDetails?.paymentId || existing?.paymentId || (isAdminGrant ? `ADMIN-GRANT-${Date.now()}` : undefined),
          amountPaid: paymentDetails?.amount || plan.price,
        },
      });

      this.logger.log(
        `[SubscriptionService] Chat permit committed in DB: user=${userId}, tier=${planCode}, creditsAdded=+${plan.contactCredits}, expiresAt=${expiresAt.toISOString()}`,
      );

      // Record subscription event for audit trail
      try {
        await tx.subscriptionEvent.create({
          data: {
            id: `sub-evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            userId,
            fromTier: existing?.tier || 'FREE',
            toTier: planCode,
            source: isAdminGrant ? 'ADMIN' : paymentDetails?.paymentId ? 'GATEWAY' : 'MANUAL_ACTIVATION',
          },
        });

        // Keep User.subscriptionTier in sync
        await tx.user.update({
          where: { id: userId },
          data: { subscriptionTier: planCode },
        });
      } catch (e: any) {
        this.logger.warn(`Could not log subscription audit event: ${e?.message}`);
      }

      return {
        success: true,
        message: `Chat permit activated successfully for ${plan.name}`,
        subscription,
      };
    });
  }

  /**
   * Manually cancels or revokes a chat permit and resets user tier to BASIC.
   */
  async cancelChatPermit(userId: string) {
    this.logger.log(`[SubscriptionService] cancelChatPermit initiated for user ${userId}`);
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    let subscription = null;
    if (existing) {
      subscription = await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: 'CANCELLED',
          canChat: false,
          tier: 'FREE',
          expiresAt: new Date(),
        },
      });
      this.logger.log(`[SubscriptionService] Subscription status set to CANCELLED for user ${userId}`);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: 'BASIC' },
    });

    try {
      await this.prisma.subscriptionEvent.create({
        data: {
          id: `sub-evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          userId,
          fromTier: existing?.tier || 'PAID',
          toTier: 'BASIC',
          source: 'ADMIN',
        },
      });
    } catch (e: any) {
      this.logger.warn(`Could not log subscription cancel event: ${e?.message}`);
    }

    return {
      success: true,
      message: 'Subscription downgraded to Basic/Free successfully',
      subscription,
    };
  }

  /**
   * Tracks and enforces daily connection request limits.
   */
  async checkAndIncrementInterestQuota(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } });
    const hasPermit = Boolean(sub?.status === 'ACTIVE' && sub?.expiresAt && new Date(sub.expiresAt) > new Date());
    const limit = hasPermit ? (sub?.dailyInterestsLimit ?? 100) : 10;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const quota = await this.prisma.userDailyQuota.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      create: {
        userId,
        date: today,
        interestsSent: 1,
      },
      update: {
        interestsSent: { increment: 1 },
      },
    });

    if (quota.interestsSent > limit) {
      this.logger.warn(
        `[SubscriptionService] Interest quota limit reached: user=${userId}, sentToday=${quota.interestsSent}, limit=${limit}`,
      );
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - quota.interestsSent),
    };
  }

  /**
   * Helper to resolve target user by UUID or profileId
   */
  private async resolveTargetUser(identifier: string) {
    const raw = (identifier || '').trim();
    if (!raw) throw new BadRequestException('Target user identifier is required');

    const imcNormalized = raw.toUpperCase().startsWith('IMC-')
      ? raw.toUpperCase()
      : `IMC-${raw.toUpperCase()}`;

    try {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: raw },
            { profileId: raw },
            { profileId: imcNormalized },
            { profileId: { equals: raw, mode: 'insensitive' } },
            { profileId: { equals: imcNormalized, mode: 'insensitive' } },
            { profile: { id: raw } },
          ],
        },
        select: {
          id: true,
          phone: true,
          isPhoneVerified: true,
          firstName: true,
          lastName: true,
          profileId: true,
          profile: {
            select: {
              city: true,
              state: true,
              occupation: true,
            },
          },
          photos: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('Profile or user not found');
      }

      return user;
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`[resolveTargetUser] Error: ${err?.message}`, err?.stack);
      throw new InternalServerErrorException(`Failed to resolve profile: ${err?.message || err}`);
    }
  }

  /**
   * Resilient helper to find an unlock record using either Prisma delegate or Raw SQL
   */
  private async findContactUnlockRecord(userId: string, targetUserId: string): Promise<{ id: string } | null> {
    if ((this.prisma as any).contactUnlock?.findUnique) {
      try {
        const found = await this.prisma.contactUnlock.findUnique({
          where: {
            userId_targetUserId: {
              userId,
              targetUserId,
            },
          },
        });
        if (found) return found;
      } catch (err: any) {
        this.logger.warn(`[findContactUnlockRecord] Delegate query failed, falling back to raw SQL: ${err?.message}`);
      }
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "ContactUnlock"
        WHERE "userId" = ${userId} AND "targetUserId" = ${targetUserId}
        LIMIT 1;
      `;
      return rows && rows.length > 0 ? rows[0] : null;
    } catch (err: any) {
      this.logger.error(`[findContactUnlockRecord] Fallback raw SQL failed: ${err?.message}`);
      return null;
    }
  }

  /**
   * Resilient helper to record an unlock record directly and safely using raw SQL
   * with ON CONFLICT DO NOTHING to guarantee transaction safety in PostgreSQL.
   */
  private async recordContactUnlock(userId: string, targetUserId: string, tx?: any): Promise<void> {
    const client = tx || this.prisma;
    try {
      const id = randomUUID();
      await client.$executeRaw`
        INSERT INTO "ContactUnlock" ("id", "userId", "targetUserId", "unlockedAt")
        VALUES (${id}, ${userId}, ${targetUserId}, NOW())
        ON CONFLICT ("userId", "targetUserId") DO NOTHING;
      `;
    } catch (err: any) {
      this.logger.error(`[recordContactUnlock] Raw SQL insert failed: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  /**
   * Check if viewer has already unlocked target user's contact number
   * and whether viewer has sufficient quota/credits to unlock.
   */
  async getContactStatus(viewerId: string, targetIdentifier: string) {
    try {
      const targetUser = await this.resolveTargetUser(targetIdentifier);
      const isSelf = viewerId === targetUser.id;

      if (isSelf) {
        return {
          isUnlocked: true,
          phone: targetUser.phone,
          isSelf: true,
          canUnlock: true,
          creditsRemaining: 9999,
          isUnlimited: true,
        };
      }

      const existingUnlock = await this.findContactUnlockRecord(viewerId, targetUser.id);

      const sub = await this.prisma.subscription.findUnique({ where: { userId: viewerId } });
      const isSubscribed = Boolean(
        sub && sub.status === 'ACTIVE' && sub.expiresAt && new Date(sub.expiresAt) > new Date(),
      );

      const creditsRemaining = sub?.contactCredits || 0;
      const isUnlimited = creditsRemaining >= 9000;
      const canUnlock = Boolean(isSubscribed && (creditsRemaining > 0 || isUnlimited));

      return {
        isUnlocked: Boolean(existingUnlock),
        phone: existingUnlock ? targetUser.phone : null,
        isSelf: false,
        canUnlock: Boolean(existingUnlock) || canUnlock,
        creditsRemaining,
        isUnlimited,
        isSubscribed,
      };
    } catch (err: any) {
      this.logger.error(`[getContactStatus] Error: ${err?.message}`, err?.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(`Failed to check contact status: ${err?.message || err}`);
    }
  }

  /**
   * Atomically unlock a target user's verified contact number.
   * If already unlocked, returns contact with 0 credit deduction.
   * If new, verifies active permit, checks contactCredits > 0, decrements credit, and records unlock.
   */
  async unlockContact(viewerId: string, targetIdentifier: string) {
    try {
      const targetUser = await this.resolveTargetUser(targetIdentifier);

      if (viewerId === targetUser.id) {
        return {
          success: true,
          phone: targetUser.phone,
          alreadyUnlocked: true,
          creditsRemaining: 9999,
          isUnlimited: true,
        };
      }

      // Check if already unlocked
      const existing = await this.findContactUnlockRecord(viewerId, targetUser.id);

      if (existing) {
        const sub = await this.prisma.subscription.findUnique({ where: { userId: viewerId } });
        return {
          success: true,
          phone: targetUser.phone,
          alreadyUnlocked: true,
          creditsRemaining: sub?.contactCredits || 0,
          isUnlimited: (sub?.contactCredits || 0) >= 9000,
        };
      }

      // Verify permit & credits
      const sub = await this.prisma.subscription.findUnique({ where: { userId: viewerId } });
      const isSubscribed = Boolean(
        sub && sub.status === 'ACTIVE' && sub.expiresAt && new Date(sub.expiresAt) > new Date(),
      );

      if (!sub || !isSubscribed) {
        throw new ForbiddenException({
          code: 'PERMIT_REQUIRED',
          message: 'An active Chat Permit is required to unlock verified contact numbers.',
        });
      }

      const currentSub = sub;
      const isUnlimited = (currentSub.contactCredits || 0) >= 9000;
      if (!isUnlimited && (currentSub.contactCredits || 0) <= 0) {
        this.logger.warn(`[SubscriptionService] unlockContact rejected: viewer ${viewerId} has exhausted credits.`);
        throw new ForbiddenException({
          code: 'CONTACT_CREDITS_EXHAUSTED',
          message: 'You have used all available contact credits. Please upgrade your permit to unlock more contact numbers.',
        });
      }

      this.logger.log(`[SubscriptionService] unlockContact requested: viewerId=${viewerId}, targetUserId=${targetUser.id}`);

      // Atomically create unlock record & decrement credit inside transaction with concurrency guard
      return await this.prisma.$transaction(async (tx) => {
        // Re-verify current credits within the transaction lock to prevent concurrent double-spending
        if (!isUnlimited) {
          const freshSub = await tx.subscription.findUnique({
            where: { id: currentSub.id },
          });

          if (!freshSub || (freshSub.contactCredits || 0) <= 0) {
            this.logger.warn(`[SubscriptionService] Concurrent unlock blocked: viewer ${viewerId} has 0 credits remaining.`);
            throw new ForbiddenException({
              code: 'CONTACT_CREDITS_EXHAUSTED',
              message: 'You have used all available contact credits. Please upgrade your permit to unlock more contact numbers.',
            });
          }
        }

        await this.recordContactUnlock(viewerId, targetUser.id, tx);

        let updatedCredits = currentSub.contactCredits;
        if (!isUnlimited) {
          const updatedSub = await tx.subscription.update({
            where: { id: currentSub.id },
            data: { contactCredits: { decrement: 1 } },
          });
          updatedCredits = updatedSub.contactCredits;
        }

        this.logger.log(
          `[SubscriptionService] Contact unlock SUCCESS: viewerId=${viewerId} unlocked targetUserId=${targetUser.id}. CreditsRemaining=${updatedCredits}`,
        );

        return {
          success: true,
          phone: targetUser.phone,
          alreadyUnlocked: false,
          creditsRemaining: updatedCredits,
          isUnlimited,
        };
      });
    } catch (err: any) {
      this.logger.error(`[unlockContact] Error: ${err?.message}`, err?.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(`Failed to unlock contact: ${err?.message || err}`);
    }
  }

  /**
   * List all verified contacts unlocked by the user.
   */
  async getUnlockedContacts(viewerId: string) {
    try {
      if ((this.prisma as any).contactUnlock?.findMany) {
        try {
          const unlocks = await this.prisma.contactUnlock.findMany({
            where: { userId: viewerId },
            orderBy: { unlockedAt: 'desc' },
            include: {
              targetUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profileId: true,
                  phone: true,
                  isPhoneVerified: true,
                  profile: {
                    select: {
                      city: true,
                      state: true,
                      occupation: true,
                      education: true,
                    },
                  },
                  photos: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { url: true },
                  },
                },
              },
            },
          });

          return unlocks.map((u) => ({
            unlockId: u.id,
            unlockedAt: u.unlockedAt,
            userId: u.targetUser.id,
            profileId: u.targetUser.profileId,
            name: `${u.targetUser.firstName || ''} ${u.targetUser.lastName || ''}`.trim() || 'Member',
            phone: u.targetUser.phone,
            isPhoneVerified: u.targetUser.isPhoneVerified,
            city: u.targetUser.profile?.city,
            state: u.targetUser.profile?.state,
            occupation: u.targetUser.profile?.occupation,
            education: u.targetUser.profile?.education,
            avatarUrl: u.targetUser.photos?.[0]?.url || '',
          }));
        } catch (err: any) {
          this.logger.warn(`[getUnlockedContacts] Delegate query failed, falling back to raw SQL: ${err?.message}`);
        }
      }

      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT 
          cu.id as "unlockId",
          cu."unlockedAt",
          u.id as "userId",
          u."profileId",
          u."firstName",
          u."lastName",
          u.phone,
          u."isPhoneVerified",
          p.city,
          p.state,
          p.occupation,
          p.education,
          ph.url as "avatarUrl"
        FROM "ContactUnlock" cu
        JOIN "User" u ON cu."targetUserId" = u.id
        LEFT JOIN "Profile" p ON p."userId" = u.id
        LEFT JOIN "Photo" ph ON ph."userId" = u.id AND ph."isPrimary" = true
        WHERE cu."userId" = ${viewerId}
        ORDER BY cu."unlockedAt" DESC;
      `;

      return (rows || []).map((r) => ({
        unlockId: r.unlockId,
        unlockedAt: r.unlockedAt,
        userId: r.userId,
        profileId: r.profileId,
        name: `${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Member',
        phone: r.phone,
        isPhoneVerified: Boolean(r.isPhoneVerified),
        city: r.city,
        state: r.state,
        occupation: r.occupation,
        education: r.education,
        avatarUrl: r.avatarUrl || '',
      }));
    } catch (err: any) {
      this.logger.error(`[getUnlockedContacts] Error: ${err?.message}`, err?.stack);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException(`Failed to retrieve unlocked contacts: ${err?.message || err}`);
    }
  }
}

