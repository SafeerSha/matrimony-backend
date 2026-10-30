import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    subscriptionEvent: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearCache();
  });

  describe('resolveRange', () => {
    it('should default to 30d preset with UTC timezone', () => {
      const { resolvedRange } = service.resolveRange({});
      expect(resolvedRange.preset).toBe('30d');
      expect(resolvedRange.bucket).toBe('day');
      expect(resolvedRange.timezone).toBe('UTC');

      const fromTime = new Date(resolvedRange.from).getTime();
      const toTime = new Date(resolvedRange.to).getTime();
      const diffDays = Math.round((toTime - fromTime) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);

      // Check comparison period
      const prevFromTime = new Date(resolvedRange.previousPeriod.from).getTime();
      const prevToTime = new Date(resolvedRange.previousPeriod.to).getTime();
      expect(prevToTime).toBe(fromTime);
      const prevDiffDays = Math.round((prevToTime - prevFromTime) / (1000 * 60 * 60 * 24));
      expect(prevDiffDays).toBe(30);
    });

    it('should resolve today preset', () => {
      const { resolvedRange } = service.resolveRange({ preset: 'today' });
      expect(resolvedRange.preset).toBe('today');
      expect(resolvedRange.bucket).toBe('day');
    });

    it('should resolve 7d preset', () => {
      const { resolvedRange } = service.resolveRange({ preset: '7d' });
      expect(resolvedRange.preset).toBe('7d');
      expect(resolvedRange.bucket).toBe('day');
    });

    it('should resolve 90d preset', () => {
      const { resolvedRange } = service.resolveRange({ preset: '90d' });
      expect(resolvedRange.preset).toBe('90d');
      expect(resolvedRange.bucket).toBe('day');
    });

    it('should resolve custom preset with > 90 days as week bucket', () => {
      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-05-01T00:00:00.000Z';
      const { resolvedRange } = service.resolveRange({
        preset: 'custom',
        from,
        to,
      });

      expect(resolvedRange.preset).toBe('custom');
      expect(resolvedRange.bucket).toBe('week');
    });

    it('should throw BadRequestException if custom range is missing from or to', () => {
      expect(() => service.resolveRange({ preset: 'custom' })).toThrow(BadRequestException);
      expect(() => service.resolveRange({ preset: 'custom', from: '2026-01-01' })).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if from date is after to date', () => {
      expect(() =>
        service.resolveRange({
          preset: 'custom',
          from: '2026-05-01',
          to: '2026-01-01',
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if range exceeds 366 days', () => {
      expect(() =>
        service.resolveRange({
          preset: 'custom',
          from: '2025-01-01',
          to: '2026-02-15',
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if to date is in future', () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(() =>
        service.resolveRange({
          preset: 'custom',
          from: '2026-01-01',
          to: future,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('calculateDelta', () => {
    it('should calculate positive percentage delta correctly', () => {
      expect(service.calculateDelta(150, 100)).toBe(50);
      expect(service.calculateDelta(125, 100)).toBe(25);
    });

    it('should calculate negative percentage delta correctly', () => {
      expect(service.calculateDelta(80, 100)).toBe(-20);
    });

    it('should return null when previous period is 0 to avoid division by zero', () => {
      expect(service.calculateDelta(10, 0)).toBeNull();
    });

    it('should return null when values are null', () => {
      expect(service.calculateDelta(null, null)).toBeNull();
      expect(service.calculateDelta(null, 100)).toBeNull();
      expect(service.calculateDelta(100, null)).toBeNull();
    });
  });

  describe('generateDateBuckets', () => {
    it('should generate continuous daily date strings in YYYY-MM-DD format', () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      const end = new Date('2026-01-05T00:00:00.000Z');
      const buckets = service.generateDateBuckets(start, end, 'day');

      expect(buckets).toContain('2026-01-01');
      expect(buckets).toContain('2026-01-02');
      expect(buckets).toContain('2026-01-03');
      expect(buckets).toContain('2026-01-04');
      expect(buckets).toContain('2026-01-05');
      expect(buckets.length).toBe(5);
    });
  });

  describe('getOverview', () => {
    it('should return live metrics and timeseries with cached result', async () => {
      (mockPrisma.user.count as any).mockImplementation(async (args: any) => {
        if (args?.where?.lastActiveAt) {
          const gte = args.where.lastActiveAt.gte;
          return gte.getTime() > Date.now() - 10 * 24 * 60 * 60 * 1000 ? 120 : 100;
        }
        if (args?.where?.createdAt) {
          const gte = args.where.createdAt.gte;
          return gte.getTime() > Date.now() - 10 * 24 * 60 * 60 * 1000 ? 45 : 30;
        }
        if (args?.where?.subscriptionTier === 'PAID') {
          return 25;
        }
        if (args?.where?.role === 'USER') {
          return 100;
        }
        return 0;
      });

      (mockPrisma.subscriptionEvent.findFirst as any).mockResolvedValue(null);
      (mockPrisma.subscriptionEvent.count as any).mockResolvedValue(0);
      (mockPrisma.user.findMany as any).mockResolvedValue([]);

      const result1 = await service.getOverview({ preset: '7d' }, 'ADMIN');

      expect(result1.metrics.activeUsers).toEqual({
        value: 120,
        previous: 100,
        deltaPct: 20,
        availability: 'available',
        source: 'User.lastActiveAt (role=USER, status=ACTIVE, isBanned=false)',
      });

      expect(result1.metrics.newSignups).toEqual({
        value: 45,
        previous: 30,
        deltaPct: 50,
        availability: 'available',
        source: 'User.createdAt (role=USER)',
      });

      expect(result1.metrics.paidMembers).toEqual({
        value: 25,
        previous: null,
        deltaPct: null,
        availability: 'available',
        source: 'User.subscriptionTier = PAID (role=USER, status=ACTIVE, isBanned=false)',
      });

      expect(result1.metrics.premiumConversion).toEqual({
        value: 25,
        previous: null,
        deltaPct: null,
        availability: 'available',
        source: 'Paid Members / Active Eligible Users',
      });

      // Revenue must be explicitly marked as unavailable
      expect(result1.metrics.revenue.availability).toBe('unavailable');
      expect(result1.metrics.revenue.value).toBeNull();

      expect(result1.timeseries.activeUsers.length).toBeGreaterThan(0);
      expect(result1.timeseries.newSignups.length).toBeGreaterThan(0);

      // Verify caching: second call within TTL should return cached object without querying DB again
      (mockPrisma.user.count as any).mockClear();
      const result2 = await service.getOverview({ preset: '7d' }, 'ADMIN');
      expect(result2).toBe(result1);
      expect(mockPrisma.user.count).not.toHaveBeenCalled();
    });

    it('should gracefully degrade if one metric computation fails', async () => {
      (mockPrisma.user.count as any).mockImplementation(async (args: any) => {
        if (args?.where?.lastActiveAt) {
          throw new Error('DB Timeout');
        }
        if (args?.where?.createdAt) {
          const gte = args.where.createdAt.gte;
          return gte.getTime() > Date.now() - 10 * 24 * 60 * 60 * 1000 ? 50 : 40;
        }
        return 0;
      });

      (mockPrisma.subscriptionEvent.findFirst as any).mockResolvedValue(null);
      (mockPrisma.subscriptionEvent.count as any).mockResolvedValue(0);
      (mockPrisma.user.findMany as any).mockResolvedValue([]);

      const result = await service.getOverview({ preset: '7d' }, 'ADMIN');

      expect(result.metrics.activeUsers.availability).toBe('unavailable');
      expect(result.metrics.activeUsers.value).toBeNull();
      expect(result.metrics.newSignups.availability).toBe('available');
      expect(result.metrics.newSignups.value).toBe(50);
    });
  });

  describe('getTimeSeries', () => {
    it('should return timeseries points for active_users', async () => {
      (mockPrisma.user.findMany as any).mockResolvedValue([
        { lastActiveAt: new Date('2026-03-01T10:00:00.000Z') },
        { lastActiveAt: new Date('2026-03-01T12:00:00.000Z') },
      ]);

      const res = await service.getTimeSeries({
        metric: 'active_users',
        preset: 'custom',
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-03T00:00:00.000Z',
      });

      expect(res.metric).toBe('active_users');
      expect(res.points.length).toBe(3);
      expect(res.points.find((p) => p.date === '2026-03-01')?.value).toBe(2);
      expect(res.points.find((p) => p.date === '2026-03-02')?.value).toBe(0); // Zero-filled
    });
  });
});
