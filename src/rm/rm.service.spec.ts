import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';

jest.unstable_mockModule('../chat/chat.gateway', () => ({
  ChatGateway: class MockChatGateway {
    isUserOnline = jest.fn(() => false);
  },
}));

const { ChatGateway } = await import('../chat/chat.gateway');
const { RmService } = await import('./rm.service');

describe('RmService', () => {
  let service: any;

  const mockPrisma: any = {
    user: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
      findFirst: jest.fn<any>(),
    },
    connection: {
      count: jest.fn<any>(),
    },
    feedback: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
      aggregate: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
    },
  };

  const mockChatGateway: any = {
    isUserOnline: jest.fn<any>(() => false),
  };

  beforeEach(async () => {
    mockChatGateway.isUserOnline.mockReturnValue(false);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RmService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChatGateway, useValue: mockChatGateway },
      ],
    }).compile();

    service = module.get<RmService>(RmService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getUsers', () => {
    it('should filter by category, search, and plan without selecting credential fields', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          firstName: 'Ananya',
          lastName: 'Nair',
          lastActiveAt: new Date(),
          profile: { category: 'Friendship' },
        },
      ]);
      mockPrisma.user.count.mockResolvedValue(1);
      mockChatGateway.isUserOnline.mockReturnValue(true);

      const res = await service.getUsers({
        category: 'Friendship',
        search: 'Ananya',
        plan: 'PAID',
        page: 1,
        limit: 20,
      });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].isOnline).toBe(true);
      expect(res.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });

      const findManyArg = mockPrisma.user.findMany.mock.calls[0][0];
      expect(findManyArg.select).not.toHaveProperty('passwordHash');
      expect(findManyArg.select).not.toHaveProperty('hashedRefreshToken');
      expect(findManyArg.where.AND).toContainEqual({ role: 'USER' });
    });

    it('should scope getUserStats strictly to USER role', async () => {
      mockPrisma.user.count.mockResolvedValue(5);

      await service.getUserStats();
      for (const call of mockPrisma.user.count.mock.calls) {
        const where = call[0]?.where;
        expect(
          where?.role === 'USER' ||
            (Array.isArray(where?.AND) && where.AND.some((c: any) => c.role === 'USER')),
        ).toBe(true);
      }
    });
  });

  describe('getUserDetail', () => {
    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getUserDetail('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should return profile metadata and activity stats excluding permanentAddress', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        profileId: 'IMC-100001',
        lastActiveAt: new Date(Date.now() - 10 * 60 * 1000),
        profile: { category: 'Marriage', city: 'Kochi' },
      });
      mockPrisma.connection.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);
      mockPrisma.feedback.count.mockResolvedValue(3);

      const res = await service.getUserDetail('IMC-100001');
      expect(res.activityStats).toEqual({
        sentInterests: 4,
        receivedInterests: 2,
        mutualMatches: 1,
        feedbackCount: 3,
      });
      const detailQuery = mockPrisma.user.findFirst.mock.calls[0][0];
      expect(detailQuery.where.role).toBe('USER');
      const detailSelect = detailQuery.select;
      expect(detailSelect.profile.select).not.toHaveProperty('permanentAddress');
      expect(detailSelect).not.toHaveProperty('passwordHash');
    });
  });

  describe('feedback', () => {
    it('should return paginated feedback list and stats', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([{ id: 'fb1', type: 'bug', rating: 2 }]);
      mockPrisma.feedback.count.mockResolvedValue(1);

      const list = await service.getFeedback({ type: 'bug', page: 1, limit: 10 });
      expect(list.data).toHaveLength(1);
      expect(list.meta.total).toBe(1);

      mockPrisma.feedback.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      mockPrisma.feedback.aggregate.mockResolvedValue({ _avg: { rating: 4.25 } });

      const stats = await service.getFeedbackStats();
      expect(stats).toEqual({
        total: 10,
        openCount: 4,
        byType: { bug: 3, feature: 5, general: 2 },
        averageRating: 4.3,
      });
    });

    it('should throw BadRequestException if no update fields are provided', async () => {
      await expect(service.updateFeedback('fb1', {}, 'rm1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when updating nonexistent feedback', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(
        service.updateFeedback('missing', { status: 'RESOLVED' }, 'rm1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update status, priority, trimmed notes, and reviewer metadata', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ id: 'fb1' });
      mockPrisma.feedback.update.mockResolvedValue({
        id: 'fb1',
        status: 'RESOLVED',
        priority: 'HIGH',
        rmNotes: 'Addressed',
        reviewedById: 'rm1',
      });

      const updated = await service.updateFeedback(
        'fb1',
        { status: 'RESOLVED', priority: 'HIGH', rmNotes: '  Addressed  ' },
        'rm1',
      );

      expect(updated.status).toBe('RESOLVED');
      const updateData = mockPrisma.feedback.update.mock.calls[0][0].data;
      expect(updateData.rmNotes).toBe('Addressed');
      expect(updateData.reviewedById).toBe('rm1');
      expect(updateData.reviewedAt).toBeInstanceOf(Date);
    });
  });
});
