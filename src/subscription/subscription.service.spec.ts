import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService, SUBSCRIPTION_PLANS } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: PrismaService;

  const mockPrisma: any = {
    subscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userDailyQuota: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    subscriptionEvent: {
      create: jest.fn(),
    },
    plan: {
      findMany: jest.fn<any>(),
    },
    contactUnlock: {
      count: jest.fn<any>(),
      findMany: jest.fn<any>(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return subscription plans', async () => {
    mockPrisma.plan.findMany.mockResolvedValue([
      {
        id: 'db-1',
        code: 'BASIC',
        name: '1 Month Chat Permit',
        badge: 'Basic',
        price: 500,
        formattedPrice: '₹500',
        period: 'per month',
        durationDays: 30,
        description: 'Basic plan',
        features: [],
        contactCredits: 20,
        dailyInterestsLimit: 20,
        popular: false,
      },
      {
        id: 'db-2',
        code: 'STANDARD',
        name: '3 Months Chat Permit',
        badge: 'Standard',
        price: 1250,
        formattedPrice: '₹1,250',
        period: 'for 90 days',
        durationDays: 90,
        description: 'Standard plan',
        features: [],
        contactCredits: 60,
        dailyInterestsLimit: 40,
        popular: true,
      },
      {
        id: 'db-3',
        code: 'PLUS',
        name: '6 Months Permit',
        badge: 'Plus',
        price: 2500,
        formattedPrice: '₹2,500',
        period: 'for 180 days',
        durationDays: 180,
        description: 'Plus plan',
        features: [],
        contactCredits: 120,
        dailyInterestsLimit: 9999,
        popular: false,
      },
      {
        id: 'db-4',
        code: 'ELITE',
        name: 'One year Chat permit',
        badge: 'Elite',
        price: 5000,
        formattedPrice: '₹5,000',
        period: 'for one year',
        durationDays: 365,
        description: 'Elite plan',
        features: [],
        contactCredits: 9999,
        dailyInterestsLimit: 9999,
        popular: false,
      },
    ]);
    const plans = await service.getPlans();
    expect(plans).toHaveLength(4);
    expect(plans[0].id).toBe('BASIC');
  });

  it('should paginate unlocked contacts with defaults and meta', async () => {
    mockPrisma.contactUnlock.findMany.mockResolvedValue([
      {
        id: 'unlock-1',
        unlockedAt: new Date('2026-02-01T10:00:00Z'),
        targetUser: {
          id: 'u-target',
          firstName: 'Meera',
          lastName: 'Nair',
          profileId: 'IMC-123456',
          phone: '9876543210',
          isPhoneVerified: true,
          profile: { city: 'Kochi', state: 'Kerala', occupation: 'Doctor', education: 'MBBS' },
          photos: [{ url: 'https://img.test/meera.webp' }],
        },
      },
    ]);
    mockPrisma.contactUnlock.count.mockResolvedValue(1);

    const res = await service.getUnlockedContacts('user-1', { page: 1, limit: 20 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].phone).toBe('9876543210');
    expect(res.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  describe('hasActiveChatPermit', () => {
    it('should return false for user without subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'BASIC', role: 'USER' });

      const result = await service.hasActiveChatPermit('user-1');
      expect(result).toBe(false);
    });

    it('should return true for admin role', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'BASIC', role: 'ADMIN' });

      const result = await service.hasActiveChatPermit('admin-1');
      expect(result).toBe(true);
    });

    it('should return true for active subscription with future expiry', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        canChat: true,
        expiresAt: new Date(Date.now() + 86400000), // 1 day in future
      });
      mockPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'PLUS', role: 'USER' });

      const result = await service.hasActiveChatPermit('user-plus');
      expect(result).toBe(true);
    });

    it('should return false for expired subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        canChat: true,
        expiresAt: new Date(Date.now() - 86400000), // 1 day in past
      });
      mockPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'BASIC', role: 'USER' });

      const result = await service.hasActiveChatPermit('user-expired');
      expect(result).toBe(false);
    });
  });

  describe('checkAndIncrementInterestQuota', () => {
    it('should allow within quota for free user', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'BASIC', role: 'USER' });
      mockPrisma.userDailyQuota.upsert.mockResolvedValue({
        interestsSent: 3,
      });

      const result = await service.checkAndIncrementInterestQuota('user-free');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 10 - 3
    });

    it('should reject when quota exceeded for free user', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ subscriptionTier: 'BASIC', role: 'USER' });
      mockPrisma.userDailyQuota.upsert.mockResolvedValue({
        interestsSent: 11,
      });

      const result = await service.checkAndIncrementInterestQuota('user-free');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});
