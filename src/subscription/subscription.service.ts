import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
    name: '1 Month Permit',
    badge: 'Basic',
    price: 500,
    formattedPrice: '₹500',
    period: 'per month',
    durationDays: 30,
    description: 'Ideal for trying out the platform and exploring matches.',
    features: [
      'Active Premium for 30 days',
      'Send & accept chat requests',
      'Unlimited messaging with matches',
      'Standard profile visibility',
    ],
    contactCredits: 10,
    dailyInterestsLimit: 25,
  },
  {
    id: 'STANDARD',
    name: '3 Months Permit',
    badge: 'Standard',
    price: 1250,
    formattedPrice: '₹1,250',
    period: 'for 90 days',
    durationDays: 90,
    description: 'Our most popular plan. Best value for active matchmaking.',
    features: [
      'Active Premium for 90 days',
      'Send & accept chat requests',
      'Unlimited messaging with matches',
      'Priority profile visibility',
    ],
    contactCredits: 30,
    dailyInterestsLimit: 50,
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
    description: 'Serious about finding a match with extended connection time.',
    features: [
      'Active Premium for 180 days',
      'Send & accept chat requests',
      'Unlimited messaging with matches',
      'Priority profile visibility',
    ],
    contactCredits: 75,
    dailyInterestsLimit: 100,
  },
  {
    id: 'ELITE',
    name: '1 Year Permit',
    badge: 'Elite',
    price: 5000,
    formattedPrice: '₹5,000',
    period: 'for 365 days',
    durationDays: 365,
    description: 'Complete peace of mind with 365 days of full unlimited access.',
    features: [
      'Active Premium for 365 days',
      'Send & accept chat requests',
      'Unlimited messaging with matches',
      'Highest priority profile visibility',
    ],
    contactCredits: 200,
    dailyInterestsLimit: 200,
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
          update: {},
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

    const activeTier = isSubscribed
      ? (sub?.tier || user?.subscriptionTier || 'BASIC')
      : 'FREE';

    const daysRemaining = sub?.expiresAt && !isExpired
      ? Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    // Daily interest quota check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyLimit = isSubscribed ? (sub?.dailyInterestsLimit || 50) : 10;
    const quotaRecord = await this.prisma.userDailyQuota.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    const interestsSentToday = quotaRecord?.interestsSent || 0;
    const dailyInterestsRemaining = Math.max(0, dailyLimit - interestsSentToday);

    return {
      userId,
      tier: activeTier,
      status: isSubscribed ? 'ACTIVE' : (isExpired ? 'EXPIRED' : 'INACTIVE'),
      isSubscribed,
      canChat: isSubscribed,
      expiresAt: sub?.expiresAt || null,
      daysRemaining,
      contactCredits: sub?.contactCredits || 0,
      dailyInterestsLimit: dailyLimit,
      dailyInterestsSentToday: interestsSentToday,
      dailyInterestsRemaining,
    };
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
  async activatePermit(userId: string, tierName: string, paymentDetails?: { paymentId?: string; amount?: number }) {
    const isFreeTrial = process.env.ENABLE_FREE_TRIAL !== 'false';
    if (!isFreeTrial && (!paymentDetails?.paymentId || paymentDetails.paymentId.startsWith('DEMO-'))) {
      throw new BadRequestException('Payment is required to activate subscription. Free trial mode is disabled.');
    }

    const normalizedTier = (tierName || 'BASIC').toUpperCase();
    let dbPlan = await this.prisma.plan.findFirst({
      where: {
        OR: [{ code: normalizedTier }, { id: tierName }],
      },
    });

    const plan = dbPlan || SUBSCRIPTION_PLANS.find((p) => p.id === normalizedTier) || SUBSCRIPTION_PLANS[0];

    const now = new Date();
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // If existing permit is still active, extend it by the plan's duration
    const baseDate = existing?.expiresAt && new Date(existing.expiresAt) > now
      ? new Date(existing.expiresAt)
      : now;

    const expiresAt = new Date(baseDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const subscription = await this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier: plan.id,
        status: 'ACTIVE',
        canChat: true,
        expiresAt,
        contactCredits: plan.contactCredits,
        dailyInterestsLimit: plan.dailyInterestsLimit,
        paymentId: paymentDetails?.paymentId || `DEMO-${Date.now()}`,
        amountPaid: paymentDetails?.amount || plan.price,
      },
      update: {
        tier: plan.id,
        status: 'ACTIVE',
        canChat: true,
        expiresAt,
        contactCredits: { increment: plan.contactCredits },
        dailyInterestsLimit: plan.dailyInterestsLimit,
        paymentId: paymentDetails?.paymentId || existing?.paymentId,
        amountPaid: paymentDetails?.amount || plan.price,
      },
    });

    // Record subscription event for audit trail
    try {
      await this.prisma.subscriptionEvent.create({
        data: {
          id: `sub-evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          userId,
          fromTier: existing?.tier || 'FREE',
          toTier: plan.id,
          source: paymentDetails?.paymentId ? 'GATEWAY' : 'MANUAL_ACTIVATION',
        },
      });

      // Keep User.subscriptionTier in sync
      await this.prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: plan.id },
      });
    } catch (e: any) {
      this.logger.warn(`Could not log subscription audit event: ${e?.message}`);
    }

    return {
      success: true,
      message: `Chat permit activated successfully for ${plan.name}`,
      subscription,
    };
  }

  /**
   * Tracks and enforces daily connection request limits.
   */
  async checkAndIncrementInterestQuota(userId: string): Promise<{ allowed: boolean; remaining: number }> {
    const hasPermit = await this.hasActiveChatPermit(userId);
    const limit = hasPermit ? 100 : 10;

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
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - quota.interestsSent),
    };
  }
}

