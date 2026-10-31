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

  it('should return subscription plans', () => {
    const plans = service.getPlans();
    expect(plans).toHaveLength(4);
    expect(plans[0].id).toBe('BASIC');
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
