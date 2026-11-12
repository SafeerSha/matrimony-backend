import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportService', () => {
  let service: ReportService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn<any>(),
    },
    profile: {
      findFirst: jest.fn<any>(),
    },
    blockedUser: {
      findUnique: jest.fn<any>(),
      create: jest.fn<any>(),
      delete: jest.fn<any>(),
      findMany: jest.fn<any>(),
    },
    userReport: {
      create: jest.fn<any>(),
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('blockUser / unblockUser / getBlockedUsers', () => {
    it('should forbid blocking oneself (403)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(service.blockUser('u1', 'u1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return ConflictException (409) when double-blocking the same user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u2',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.blockedUser.findUnique.mockResolvedValue({
        id: 'blk-1',
        blockerId: 'u1',
        blockedId: 'u2',
      });

      await expect(service.blockUser('u1', 'u2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create BlockedUser record and sanitize optional reason', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u2',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.blockedUser.findUnique.mockResolvedValue(null);
      mockPrisma.blockedUser.create.mockResolvedValue({
        id: 'blk-1',
        blockerId: 'u1',
        blockedId: 'u2',
        reason: 'Spamming chat',
      });

      const res = await service.blockUser('u1', 'u2', '  Spamming chat  ');
      expect(res.success).toBe(true);
      expect(mockPrisma.blockedUser.create).toHaveBeenCalledWith({
        data: {
          blockerId: 'u1',
          blockedId: 'u2',
          reason: 'Spamming chat',
        },
      });
    });

    it('should unblock an existing block and throw 404 when block does not exist', async () => {
      mockPrisma.blockedUser.findUnique.mockResolvedValueOnce({
        id: 'blk-1',
        blockerId: 'u1',
        blockedId: 'u2',
      });
      mockPrisma.blockedUser.delete.mockResolvedValue({ id: 'blk-1' });

      const res = await service.unblockUser('u1', 'u2');
      expect(res.success).toBe(true);
      expect(mockPrisma.blockedUser.delete).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: 'u1', blockedId: 'u2' } },
      });

      mockPrisma.blockedUser.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.blockedUser.findUnique.mockResolvedValueOnce(null);
      await expect(service.unblockUser('u1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should list sanitized blocked users for blockerId', async () => {
      mockPrisma.blockedUser.findMany.mockResolvedValue([
        {
          id: 'blk-1',
          blockerId: 'u1',
          blockedId: 'u2',
          reason: null,
          createdAt: new Date('2026-11-12T10:00:00Z'),
          blocked: {
            id: 'u2',
            profileId: 'IMC-A00002',
            firstName: 'Demo',
            lastName: 'One',
            status: 'ACTIVE',
            deletedAt: null,
            profile: { city: 'Kochi', state: 'Kerala', country: 'India' },
            photos: [{ url: 'https://cdn.test/u2.jpg', isPrimary: true }],
          },
        },
      ]);

      const list = await service.getBlockedUsers('u1');
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual(
        expect.objectContaining({
          id: 'blk-1',
          blockedId: 'u2',
          profileId: 'IMC-A00002',
          name: 'Demo One',
          location: 'Kochi, Kerala',
          image: 'https://cdn.test/u2.jpg',
        }),
      );
    });
  });

  describe('reports & admin triage', () => {
    it('should create a UserReport with PENDING status and sanitized description', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u2',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.userReport.create.mockResolvedValue({
        id: 'rep-1',
        reporterId: 'u1',
        reportedId: 'u2',
        reason: 'harassment',
        description: 'Abusive messages',
        status: 'PENDING',
      });

      const res = await service.createReport('u1', 'u2', {
        reason: 'harassment',
        description: '  Abusive messages  ',
      });

      expect(res.success).toBe(true);
      expect(res.report.status).toBe('PENDING');
      expect(mockPrisma.userReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'u1',
          reportedId: 'u2',
          reason: 'harassment',
          description: 'Abusive messages',
          status: 'PENDING',
        },
      });
    });

    it('should forbid reporting oneself (403)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        service.createReport('u1', 'u1', { reason: 'spam' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should list reports with status and date filters for ADMIN', async () => {
      mockPrisma.userReport.findMany.mockResolvedValue([{ id: 'rep-1', status: 'PENDING' }]);
      mockPrisma.userReport.count.mockResolvedValue(1);

      const res = await service.getReportsAdmin({
        status: 'PENDING',
        fromDate: '2026-11-01T00:00:00.000Z',
        toDate: '2026-11-12T23:59:59.000Z',
        page: 1,
        limit: 10,
      });

      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
      expect(mockPrisma.userReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            createdAt: {
              gte: new Date('2026-11-01T00:00:00.000Z'),
              lte: new Date('2026-11-12T23:59:59.000Z'),
            },
          },
        }),
      );
    });

    it('should update report status and adminNotes for ADMIN', async () => {
      mockPrisma.userReport.findUnique.mockResolvedValue({ id: 'rep-1' });
      mockPrisma.userReport.update.mockResolvedValue({
        id: 'rep-1',
        status: 'RESOLVED',
        adminNotes: 'Warned user',
        reviewedById: 'admin-1',
      });

      const updated = await service.updateReportAdmin(
        'rep-1',
        { status: 'RESOLVED', adminNotes: '  Warned user  ' },
        'admin-1',
      );

      expect(updated.status).toBe('RESOLVED');
      expect(mockPrisma.userReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rep-1' },
          data: expect.objectContaining({
            status: 'RESOLVED',
            adminNotes: 'Warned user',
            reviewedById: 'admin-1',
          }),
        }),
      );
    });
  });
});

