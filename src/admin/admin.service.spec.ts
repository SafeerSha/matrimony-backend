import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';

jest.mock('fs');

describe('AdminService', () => {
  let service: AdminService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    connection: {
      count: jest.fn(),
    },
    photo: {
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.connection.count.mockResolvedValue(5);
      mockPrisma.photo.count.mockResolvedValue(2);

      const result = await service.getStats();
      expect(result).toEqual({ totalUsers: 10, totalMatches: 5, unverifiedPhotos: 2 });
    });
  });

  describe('banUser', () => {
    it('should ban a user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1' });
      mockPrisma.user.update.mockResolvedValue({ id: '1', isBanned: true });

      const result = await service.banUser('1');
      expect(result.isBanned).toBe(true);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.banUser('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPhoto', () => {
    it('should approve photo', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1' });
      mockPrisma.photo.update.mockResolvedValue({ id: 'p1', isVerified: true });

      const result = await service.verifyPhoto('p1', 'approved');
      expect(result).toEqual({ id: 'p1', isVerified: true });
    });

    it('should reject and delete photo', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1', url: '/uploads/test.jpg' });
      mockPrisma.photo.delete.mockResolvedValue({ id: 'p1' });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = await service.verifyPhoto('p1', 'rejected');
      expect((result as any).success).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });
});
