import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RevenueService } from './revenue.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RevenueService', () => {
  let service: RevenueService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      paymentTransaction: {
        aggregate: jest.fn() as any,
        count: jest.fn() as any,
        findMany: jest.fn() as any,
      },
      subscription: {
        findMany: jest.fn() as any,
        count: jest.fn() as any,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevenueService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RevenueService>(RevenueService);
  });

  describe('resolveRange', () => {
    it('should default to 30d preset with UTC timezone', () => {
      const res = service.resolveRange({});
      expect(res.preset).toBe('30d');
      expect(res.timezone).toBe('UTC');
      expect(res.start).toBeInstanceOf(Date);
      expect(res.end).toBeInstanceOf(Date);
      expect(res.prevStart).toBeInstanceOf(Date);
      expect(res.prevEnd).toBeInstanceOf(Date);
    });

    it('should resolve today preset', () => {
      const res = service.resolveRange({ preset: 'today' });
      expect(res.preset).toBe('today');
      expect(res.start.getUTCHours()).toBe(0);
    });

    it('should resolve 7d, 90d, ytd and all presets', () => {
      expect(service.resolveRange({ preset: '7d' }).preset).toBe('7d');
      expect(service.resolveRange({ preset: '90d' }).preset).toBe('90d');
      expect(service.resolveRange({ preset: 'ytd' }).preset).toBe('ytd');
      const allRes = service.resolveRange({ preset: 'all' });
      expect(allRes.preset).toBe('all');
      expect(allRes.prevStart).toBeNull();
    });

    it('should throw BadRequestException for unknown preset', () => {
      expect(() => service.resolveRange({ preset: 'invalid' as any })).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if custom range is missing from or to', () => {
      expect(() => service.resolveRange({ preset: 'custom' })).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if from > to', () => {
      expect(() =>
        service.resolveRange({
          preset: 'custom',
          from: '2026-10-10T00:00:00Z',
          to: '2026-10-01T00:00:00Z',
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if range exceeds 366 days', () => {
      expect(() =>
        service.resolveRange({
          preset: 'custom',
          from: '2024-01-01T00:00:00Z',
          to: '2025-06-01T00:00:00Z',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('calculateDelta', () => {
    it('should calculate positive and negative delta percentages', () => {
      expect(service.calculateDelta(150, 100)).toBe(50.0);
      expect(service.calculateDelta(75, 100)).toBe(-25.0);
    });

    it('should return 100% when previous is 0 and current > 0', () => {
      expect(service.calculateDelta(100, 0)).toBe(100.0);
    });

    it('should return null when previous is null or 0 with current 0', () => {
      expect(service.calculateDelta(0, null)).toBeNull();
      expect(service.calculateDelta(0, 0)).toBeNull();
    });
  });

  describe('getOverview', () => {
    it('should calculate gross revenue, MRR, ARPPU, active subscriptions, and success rate', async () => {
      // Mock paymentTransaction.aggregate (current & previous)
      prisma.paymentTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 10000 } })
        .mockResolvedValueOnce({ _sum: { amount: 8000 } });

      // Mock paymentTransaction.count for successful count
      prisma.paymentTransaction.count.mockResolvedValueOnce(10); // currentSuccessCount

      // Mock distinct paying users
      prisma.paymentTransaction.findMany
        .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }]) // current 2 users
        .mockResolvedValueOnce([{ userId: 'u1' }]); // previous 1 user

      // Mock subscription queries: findMany, count active, count new, count prev new
      prisma.subscription.findMany.mockResolvedValueOnce([
        {
          amountPaid: 1200,
          tier: 'PLUS',
          startDate: new Date('2026-10-01'),
          expiresAt: new Date('2026-11-01'), // 31 days
        },
      ]);
      prisma.subscription.count
        .mockResolvedValueOnce(5) // activePaidCount
        .mockResolvedValueOnce(3) // newPaidInPeriod
        .mockResolvedValueOnce(2); // prevNewPaidInPeriod

      // Mock transaction status attempt counts: success, failed, pending, dropped
      prisma.paymentTransaction.count
        .mockResolvedValueOnce(10) // success
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(1) // pending
        .mockResolvedValueOnce(1); // dropped

      const res = await service.getOverview({ preset: '30d' });

      expect(res.grossRevenue.current).toBe(10000);
      expect(res.grossRevenue.previous).toBe(8000);
      expect(res.grossRevenue.deltaPct).toBe(25.0);
      expect(res.arppu.current).toBe(5000); // 10000 / 2 users
      expect(res.paidSubscribers.activePaidCount).toBe(5);
      expect(res.paidSubscribers.newPaidInPeriod).toBe(3);
      expect(res.successRate.ratePct).toBeCloseTo(76.9, 1); // 10 / (10 + 2 + 1) * 100
      expect(res.transactions.successfulCount).toBe(10);
    });
  });

  describe('getTimeSeries', () => {
    it('should zero-fill empty date buckets and sum transaction amounts', async () => {
      const day1 = new Date();
      day1.setUTCDate(day1.getUTCDate() - 2);

      prisma.paymentTransaction.findMany.mockResolvedValueOnce([
        {
          amount: 500,
          createdAt: day1,
        },
      ]);

      const res = await service.getTimeSeries({ preset: '7d' });
      expect(res.summary.totalRevenue).toBe(500);
      expect(res.summary.totalTransactions).toBe(1);
      expect(res.points.length).toBeGreaterThan(2);
    });
  });

  describe('getRevenueByPlan', () => {
    it('should aggregate and calculate percentage share per plan', async () => {
      prisma.paymentTransaction.findMany.mockResolvedValueOnce([
        { planCode: 'BASIC_1M', planName: 'Basic Plan', amount: 300 },
        { planCode: 'BASIC_1M', planName: 'Basic Plan', amount: 300 },
        { planCode: 'ELITE_3M', planName: 'Elite Plan', amount: 1400 },
      ]);

      const res = await service.getRevenueByPlan({ preset: '30d' });
      expect(res.totalRevenue).toBe(2000);
      expect(res.totalCount).toBe(3);
      expect(res.plans[0].planCode).toBe('ELITE_3M');
      expect(res.plans[0].percentage).toBe(70.0);
      expect(res.plans[1].planCode).toBe('BASIC_1M');
      expect(res.plans[1].percentage).toBe(30.0);
    });
  });

  describe('getTransactions and exportCsv', () => {
    it('should return paginated transactions with user details', async () => {
      const mockTx = {
        id: 'tx_1',
        orderId: 'ORDER_123',
        cfOrderId: 'cf_1',
        cfPaymentId: 'pay_1',
        planCode: 'PLUS_3M',
        planName: 'Plus Plan',
        amount: 999,
        currency: 'INR',
        status: 'SUCCESS',
        paymentMethod: 'UPI',
        paymentMessage: 'Success',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        updatedAt: new Date('2026-11-01T10:01:00Z'),
        userId: 'u1',
        user: {
          id: 'u1',
          email: 'user@example.com',
          phone: '+919876543210',
          firstName: 'John',
          lastName: 'Doe',
          profileId: 'IMC-A0001',
          subscriptionTier: 'PLUS',
          photos: [{ url: 'https://img.test/pic.jpg' }],
          profile: { firstName: 'John', lastName: 'Doe' },
        },
      };

      prisma.paymentTransaction.count.mockResolvedValueOnce(1);
      prisma.paymentTransaction.findMany.mockResolvedValueOnce([mockTx]);

      const res = await service.getTransactions({ page: 1, limit: 10 });
      expect(res.pagination.total).toBe(1);
      expect(res.items[0].orderId).toBe('ORDER_123');
      expect(res.items[0].user.customerName).toBe('John Doe');
      expect(res.items[0].user.avatarUrl).toBe('https://img.test/pic.jpg');
    });

    it('should export safe CSV with formula injection sanitization', async () => {
      const mockTx = {
        id: 'tx_2',
        orderId: '=cmd|/c calc!A0', // formula injection attempt
        cfOrderId: 'cf_2',
        cfPaymentId: 'pay_2',
        planCode: 'PLUS_3M',
        planName: 'Plus Plan',
        amount: 999,
        status: 'SUCCESS',
        paymentMethod: 'UPI',
        paymentMessage: 'Done',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        user: {
          id: 'u2',
          email: 'test@example.com',
          phone: '+919876543211',
          firstName: 'Malicious',
          lastName: 'User',
          profileId: 'IMC-A0002',
          profile: { firstName: 'Malicious', lastName: 'User' },
        },
      };

      prisma.paymentTransaction.findMany.mockResolvedValueOnce([mockTx]);

      const csv = await service.exportCsv({});
      expect(csv).toContain('Transaction ID,Order ID,Gateway Payment ID');
      // Verify formula injection sanitization (prefixing with ')
      expect(csv).toContain("'=cmd|/c calc!A0");
      expect(csv).toContain("'+919876543211");
    });
  });
});
