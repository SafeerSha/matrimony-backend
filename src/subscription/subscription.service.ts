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
    price: 1300,
    formattedPrice: '₹1,300',
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

  getPlans(): PlanConfig[] {
    return SUBSCRIPTION_PLANS;
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
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === normalizedTier) || SUBSCRIPTION_PLANS[0];

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

