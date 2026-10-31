import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { NotFoundException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: PrismaService;
  let storageService: StorageService;

  const mockPrisma = {
    user: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
      delete: jest.fn<any>(),
    },
    subscriptionEvent: {
      create: jest.fn<any>(),
    },
    connection: {
      count: jest.fn<any>(),
    },
    photo: {
      count: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      update: jest.fn<any>(),
      delete: jest.fn<any>(),
    },
    $transaction: jest.fn<any>(),
  };

  const mockStorageService = {
    uploadFile: jest.fn<any>(),
    deleteFile: jest.fn<any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_SERVICE, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);
    storageService = module.get<StorageService>(STORAGE_SERVICE);
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
      expect(result).toEqual({
        totalUsers: 10,
        totalMatches: 5,
        unverifiedPhotos: 2,
      });
    });
  });

  describe('banUser', () => {
    it('should ban a user successfully', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: '1', email: 'test@test.com', isBanned: true });

      const result = await service.banUser('1');
      expect(result.isBanned).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isBanned: true },
        select: { id: true, email: true, isBanned: true },
      });
    });

    it('should throw NotFoundException if user not found (P2025)', async () => {
      mockPrisma.user.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.banUser('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unbanUser', () => {
    it('should unban a user successfully', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: '1', email: 'test@test.com', isBanned: false });

      const result = await service.unbanUser('1');
      expect(result.isBanned).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isBanned: false },
        select: { id: true, email: true, isBanned: true },
      });
    });

    it('should throw NotFoundException if user not found (P2025)', async () => {
      mockPrisma.user.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.unbanUser('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSubscriptionTier', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateSubscriptionTier('non-existent', 'PAID')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should be idempotent and skip transaction if tier is unchanged', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        subscriptionTier: 'PAID',
      });

      const result = await service.updateSubscriptionTier('1', 'PAID');
      expect(result.subscriptionTier).toBe('PAID');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should update tier and record SubscriptionEvent inside $transaction when tier changes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        subscriptionTier: 'BASIC',
      });

      const txUserUpdate = jest.fn<any>().mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        subscriptionTier: 'PAID',
      });
      const txEventCreate = jest.fn<any>().mockResolvedValue({ id: 'evt-1' });

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          user: { update: txUserUpdate },
          subscriptionEvent: { create: txEventCreate },
        });
      });

      const result = await service.updateSubscriptionTier('1', 'PAID');
      expect(result.subscriptionTier).toBe('PAID');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { subscriptionTier: 'PAID' },
        select: { id: true, email: true, subscriptionTier: true },
      });
      expect(txEventCreate).toHaveBeenCalledWith({
        data: {
          userId: '1',
          fromTier: 'BASIC',
          toTier: 'PAID',
          source: 'ADMIN',
        },
      });
    });
  });

  describe('verifyPhoto', () => {
    it('should approve photo', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1' });
      mockPrisma.photo.update.mockResolvedValue({ id: 'p1', isVerified: true });

      const result = await service.verifyPhoto('p1', 'approved');
      expect(result).toEqual({ id: 'p1', isVerified: true });
    });

    it('should reject and delete photo via storage service', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'p1',
        url: 'https://media.test.com/uploads/users/u1/test.jpg',
        objectKey: 'uploads/users/u1/test.jpg',
        storageProvider: 'r2',
      });
      mockPrisma.photo.delete.mockResolvedValue({ id: 'p1' });

      const result = await service.verifyPhoto('p1', 'rejected');
      expect((result as any).success).toBe(true);
      expect(mockPrisma.photo.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith({
        url: 'https://media.test.com/uploads/users/u1/test.jpg',
        objectKey: 'uploads/users/u1/test.jpg',
        storageProvider: 'r2',
      });
    });
  });
  describe('updateUserStatus', () => {
    it('should update user status to SUSPENDED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        status: 'SUSPENDED',
        isBanned: false,
      });

      const res = await service.updateUserStatus('u1', 'SUSPENDED');
      expect(res.status).toBe('SUSPENDED');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isBanned: false, status: 'SUSPENDED' },
        select: expect.any(Object),
      });
    });

    it('should update user status to BLOCKED', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        status: 'ACTIVE',
        isBanned: true,
      });

      const res = await service.updateUserStatus('u1', 'BLOCKED');
      expect(res.isBanned).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isBanned: true },
        select: expect.any(Object),
      });
    });

    it('should reactivate a deactivated user', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        status: 'ACTIVE',
        deactivatedAt: null,
      });

      const res = await service.reactivateUser('u1');
      expect(res.status).toBe('ACTIVE');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: 'ACTIVE', deactivatedAt: null, deletionReason: null },
        select: expect.any(Object),
      });
    });

    it('should restore a deleted user', async () => {
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        status: 'ACTIVE',
        deletedAt: null,
      });

      const res = await service.restoreUser('u1');
      expect(res.status).toBe('ACTIVE');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: 'ACTIVE', deletedAt: null, deletionReason: null },
        select: expect.any(Object),
      });
    });

    it('should purge user data and delete photos', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        photos: [{ id: 'ph1', url: 'https://test.com/ph1.jpg', objectKey: 'ph1', storageProvider: 'local' }],
      });
      mockPrisma.user.delete.mockResolvedValue({ id: 'u1' });

      const res = await service.purgeUser('u1');
      expect(res.success).toBe(true);
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith({
        url: 'https://test.com/ph1.jpg',
        objectKey: 'ph1',
        storageProvider: 'local',
      });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
