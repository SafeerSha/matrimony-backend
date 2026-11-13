import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsersService } from '../users/users.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

jest.unstable_mockModule('../chat/chat.gateway', () => ({
  ChatGateway: class MockChatGateway {
    isUserOnline = jest.fn(() => false);
  },
}));

const { AdminService } = await import('./admin.service');

describe('AdminService', () => {
  let service: any;
  let prisma: PrismaService;
  let storageService: StorageService;

  const mockPrisma = {
    user: {
      findMany: jest.fn<any>(),
      count: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      create: jest.fn<any>(),
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

  const mockSubscriptionService = {
    activatePermit: jest.fn<any>(),
    cancelChatPermit: jest.fn<any>(),
  };

  const mockStorageService = {
    uploadFile: jest.fn<any>(),
    deleteFile: jest.fn<any>(),
  };

  const mockUsersService = {
    generateUniqueProfileId: jest.fn<any>().mockResolvedValue('IMC-A00123'),
  };

  beforeEach(async () => {
    mockUsersService.generateUniqueProfileId.mockResolvedValue('IMC-A00123');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_SERVICE, useValue: mockStorageService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get(AdminService);
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

    it('should activate permit via subscriptionService when tier is PAID', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: '1',
          email: 'test@test.com',
          subscriptionTier: 'BASIC',
        } as any)
        .mockResolvedValueOnce({
          id: '1',
          email: 'test@test.com',
          subscriptionTier: 'PAID',
        } as any);

      mockSubscriptionService.activatePermit.mockResolvedValue({ success: true } as any);

      const result = await service.updateSubscriptionTier('1', 'PAID');
      expect(result?.subscriptionTier).toBe('PAID');
      expect(mockSubscriptionService.activatePermit).toHaveBeenCalledWith('1', 'PAID', undefined, undefined, true);
    });

    it('should cancel permit via subscriptionService when tier is BASIC', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: '1',
          email: 'test@test.com',
          subscriptionTier: 'PAID',
        } as any)
        .mockResolvedValueOnce({
          id: '1',
          email: 'test@test.com',
          subscriptionTier: 'BASIC',
        } as any);

      mockSubscriptionService.cancelChatPermit.mockResolvedValue({ success: true } as any);

      const result = await service.updateSubscriptionTier('1', 'BASIC');
      expect(result?.subscriptionTier).toBe('BASIC');
      expect(mockSubscriptionService.cancelChatPermit).toHaveBeenCalledWith('1');
    });
  });

  describe('assignUserPlan', () => {
    it('should activate selected plan for user', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'u1@test.com',
          subscriptionTier: 'BASIC',
        } as any)
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'u1@test.com',
          subscriptionTier: 'PLUS',
        } as any);

      mockSubscriptionService.activatePermit.mockResolvedValue({
        success: true,
        message: 'Plan activated',
        subscription: { id: 's1', tier: 'PLUS' },
      } as any);

      const result = await service.assignUserPlan('u1', { planCode: 'PLUS', customDurationDays: 60 });
      expect(result.success).toBe(true);
      expect(mockSubscriptionService.activatePermit).toHaveBeenCalledWith('u1', 'PLUS', undefined, 60, true);
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
        role: 'USER',
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

    it('should disallow purging an ADMIN account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin1',
        email: 'admin@test.com',
        role: 'ADMIN',
        photos: [],
      });

      await expect(service.purgeUser('admin1')).rejects.toThrow('Cannot delete an administrator account.');
    });
  });

  describe('createUser', () => {
    it('should create a normal USER in DRAFT status with onboardingStep 1', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-new',
        email: 'member@test.com',
        role: 'USER',
        status: 'DRAFT',
        profileId: 'IMC-A00123',
        firstName: 'Asha',
        lastName: 'Menon',
        profile: { onboardingStep: 1 },
      });

      const res = await service.createUser({
        firstName: 'Asha',
        lastName: 'Menon',
        email: 'Member@Test.com',
        password: 'Password123!',
        role: 'USER',
      });

      expect(res.role).toBe('USER');
      expect(res.status).toBe('DRAFT');
      const createArg = mockPrisma.user.create.mock.calls[0][0];
      expect(createArg.data.email).toBe('member@test.com');
      expect(createArg.data.status).toBe('DRAFT');
      expect(createArg.data.isPasswordEnabled).toBe(true);
      expect(createArg.data.passwordHash).toBeDefined();
      expect(createArg.data.passwordHash).not.toBe('Password123!');
      expect(createArg.data.profile).toEqual({
        create: { firstName: 'Asha', lastName: 'Menon', onboardingStep: 1 },
      });
      expect(createArg.select).not.toHaveProperty('passwordHash');
    });

    it('should create an RM user directly in ACTIVE status without onboarding profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'rm-new',
        email: 'rm@test.com',
        role: 'RM',
        status: 'ACTIVE',
        profileId: 'IMC-A00123',
        firstName: 'Rahul',
        lastName: 'Nair',
      });

      const res = await service.createUser({
        firstName: 'Rahul',
        lastName: 'Nair',
        email: 'rm@test.com',
        password: 'RmPassword123!',
        role: 'RM',
      });

      expect(res.role).toBe('RM');
      expect(res.status).toBe('ACTIVE');
      const createArg = mockPrisma.user.create.mock.calls[0][0];
      expect(createArg.data.status).toBe('ACTIVE');
      expect(createArg.data.profile).toBeUndefined();
    });

    it('should throw ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-1' });

      await expect(
        service.createUser({
          firstName: 'Dup',
          email: 'dup@test.com',
          password: 'Password123!',
          role: 'USER',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getUsers', () => {
    it('should filter by role USER or RM when role query is provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.getUsers({ role: 'RM', page: 1, limit: 15 });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'RM' }),
        }),
      );

      mockPrisma.user.findMany.mockClear();
      await service.getUsers({ role: 'USER', page: 1, limit: 15 });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'USER' }),
        }),
      );

      mockPrisma.user.findMany.mockClear();
      await service.getUsers({ role: 'ALL', page: 1, limit: 15 });
      const allCallWhere = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(allCallWhere).not.toHaveProperty('role');
    });
  });

  describe('resetUserPassword', () => {
    it('should reset password, enable password and revoke existing refresh tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'rm-1', role: 'RM', email: 'rm@test.com' });
      mockPrisma.user.update.mockResolvedValue({ id: 'rm-1' });

      const res = await service.resetUserPassword('rm-1', 'NewPassword123!');
      expect(res.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'rm-1' },
        data: expect.objectContaining({
          isPasswordEnabled: true,
          hashedRefreshToken: null,
          passwordHash: expect.any(String),
        }),
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetUserPassword('non-existent', 'Password123!')).rejects.toThrow('User not found');
    });

    it('should throw BadRequestException if password is too short', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'rm-1', role: 'RM', email: 'rm@test.com' });
      await expect(service.resetUserPassword('rm-1', 'short')).rejects.toThrow('Password must be at least 8 characters long');
    });
  });

  describe('updateUser', () => {
    it('should update RM user firstName, lastName, email, phone', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'rm-1',
        email: 'old@test.com',
        phone: '+919999999999',
        firstName: 'OldFirst',
        lastName: 'OldLast',
        role: 'RM',
        profile: null,
      });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({
        id: 'rm-1',
        email: 'new@test.com',
        phone: '+918888888888',
        firstName: 'NewFirst',
        lastName: 'NewLast',
        role: 'RM',
        status: 'ACTIVE',
        isBanned: false,
        profileId: 'IMC-RM01',
      });

      const res = await service.updateUser('rm-1', {
        firstName: 'NewFirst',
        lastName: 'NewLast',
        email: 'new@test.com',
        phone: '9888888888',
      });

      expect(res.success).toBe(true);
      expect(res.user.firstName).toBe('NewFirst');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rm-1' },
          data: expect.objectContaining({
            email: 'new@test.com',
            firstName: 'NewFirst',
            lastName: 'NewLast',
          }),
        }),
      );
    });

    it('should throw ConflictException if updated email belongs to someone else', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'rm-1',
        email: 'rm@test.com',
        phone: '+919999999999',
        firstName: 'First',
        lastName: 'Last',
        role: 'RM',
        profile: null,
      });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other-user', email: 'taken@test.com' });

      await expect(
        service.updateUser('rm-1', { email: 'taken@test.com' }),
      ).rejects.toThrow('An account with this email already exists.');
    });
  });
});
