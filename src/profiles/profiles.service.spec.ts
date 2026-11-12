import * as crypto from 'crypto';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesService, calculateAge, formatPreferencesObject } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: PrismaService;

  const mockPrisma: any = {
    profile: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    preference: {
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    otpVerification: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    connection: {
      findFirst: jest.fn(),
    },
    message: {
      findFirst: jest.fn(),
    },
    contactUnlock: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateAge', () => {
    it('should correctly calculate age from ISO date string', () => {
      const nowYear = new Date().getFullYear();
      const dob = new Date(nowYear - 25, 0, 1).toISOString();
      expect(calculateAge(dob)).toBe(25);
    });

    it('should return null for null or invalid dates', () => {
      expect(calculateAge(null)).toBeNull();
      expect(calculateAge('invalid-date')).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('should return full combined profile with age, sorted photos (primary first), and preferences', async () => {
      const userId = 'user-uuid-1';
      const mockUser = {
        id: userId,
        email: 'user@example.com',
        phone: '+919876543210',
        firstName: 'Ananya',
        lastName: 'Menon',
        status: 'ACTIVE',
        profileId: 'MAT-89214',
        isPhoneVerified: true,
        isEmailVerified: true,
        profile: {
          id: 'prof-1',
          gender: 'female',
          dateOfBirth: new Date('1997-04-12T00:00:00.000Z'),
          city: 'Kochi',
          state: 'Kerala',
          country: 'India',
          education: 'M.Des, NID',
          occupation: 'Product Designer',
          employmentStatus: 'Private Sector',
          height: "5'5\"",
          maritalStatus: 'Never Married',
          religion: 'Hindu',
          motherTongue: 'Malayalam',
          bio: 'Creative and grounded...',
          family: 'Close-knit family based in Kochi.',
          lifestyle: ['Non-smoker', 'Vegetarian', 'Travel'],
          interests: ['Design', 'Reading', 'Coffee'],
          lookingFor: 'Someone kind and emotionally mature.',
          onboardingStep: 5,
        },
        preference: {
          minAge: 26,
          maxAge: 33,
          minHeight: "5'6\"",
          maxHeight: "6'2\"",
          maritalStatuses: 'Never Married',
          religions: 'Hindu, Open to all communities',
          location: 'Kerala, Bengaluru',
          education: 'Graduate Degree, Postgraduate / Masters',
          occupations: 'Software / IT, Healthcare',
          diet: "Doesn't Matter",
        },
        photos: [
          { id: 'photo-2', url: 'https://img2.jpg', isPrimary: false, isVerified: true, createdAt: new Date('2026-01-02') },
          { id: 'photo-1', url: 'https://img1.jpg', isPrimary: true, isVerified: true, createdAt: new Date('2026-01-01') },
        ],
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId);

      expect(result.userId).toBe(userId);
      expect(result.profileId).toBe('MAT-89214');
      expect(result.firstName).toBe('Ananya');
      expect(result.isVerified).toBe(true);
      expect(typeof result.age).toBe('number');
      // Verify photos ordered with primary first
      expect(result.photos[0].id).toBe('photo-1');
      expect(result.photos[0].isPrimary).toBe(true);
      expect(result.photos[1].id).toBe('photo-2');
      expect(result.photos[1].isPrimary).toBe(false);
      // Verify preferences structured object with arrays
      expect(result.preferences.minAge).toBe(26);
      expect(result.preferences.maxAge).toBe(33);
      expect(result.preferences.maritalStatus).toEqual(['Never Married']);
      expect(result.preferences.religions).toEqual(['Hindu', 'Open to all communities']);
      expect(result.preferences.locations).toEqual(['Kerala', 'Bengaluru']);
      expect(result.preferences.diet).toEqual(["Doesn't Matter"]);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update and sanitize comprehensive profile fields across all domains', async () => {
      const userId = '1';
      const dto = {
        bio: '<b>Hello</b> from world',
        family: 'Loving family',
        interests: ['Music', 'Travel'],
        lifestyle: ['Vegetarian', 'Fitness'],
        state: 'Kerala',
        motherTongue: 'Malayalam',
        annualIncome: '15-20 LPA',
        height: "5'7\"",
      };

      mockPrisma.profile.upsert.mockResolvedValue({ id: 'p1', userId });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        profile: { id: 'p1', ...dto, bio: 'Hello from world' },
        photos: [],
      });

      await service.updateProfile(userId, dto);

      expect(prisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: expect.objectContaining({
          bio: 'Hello from world',
          family: 'Loving family',
          interests: ['Music', 'Travel'],
          lifestyle: ['Vegetarian', 'Fitness'],
          state: 'Kerala',
          motherTongue: 'Malayalam',
          annualIncome: '15-20 LPA',
          height: "5'7\"",
        }),
        create: expect.objectContaining({
          bio: 'Hello from world',
          family: 'Loving family',
          interests: ['Music', 'Travel'],
          lifestyle: ['Vegetarian', 'Fitness'],
          user: { connect: { id: userId } },
        }),
      });
    });

    it('should prevent mass assignment by stripping forbidden fields', async () => {
      const userId = '1';
      const dto = {
        role: 'ADMIN',
        status: 'ACTIVE',
        isBanned: false,
        phone: '+919999999999',
        bio: 'Safe text',
      } as any;

      mockPrisma.profile.upsert.mockResolvedValue({ id: 'p1', userId });
      mockPrisma.user.findUnique.mockResolvedValue({ id: userId, phone: '+919999999999', profile: {}, photos: [] });

      await service.updateProfile(userId, dto);

      const updatePayload = (prisma.profile.upsert as any).mock.calls[0][0].update;
      expect(updatePayload.role).toBeUndefined();
      expect(updatePayload.status).toBeUndefined();
      expect(updatePayload.isBanned).toBeUndefined();
      expect(updatePayload.phone).toBeUndefined();
    });

    it('should throw ConflictException if updated email belongs to another user', async () => {
      const userId = '1';
      const dto = { email: 'duplicate@test.com' };
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'original@test.com' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other-user', email: 'duplicate@test.com' });

      await expect(service.updateProfile(userId, dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if updating email without emailOtp', async () => {
      const userId = '1';
      const dto = { email: 'newemail@test.com' };
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'original@test.com' });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.updateProfile(userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should update email and set isEmailVerified when valid emailOtp is provided', async () => {
      const userId = '1';
      const dto = { email: 'newemail@test.com', emailOtp: '123456' };
      const otpSecret = process.env.JWT_ACCESS_SECRET || 'shaadichat-otp-secret-salt';
      const expectedHash = crypto.createHmac('sha256', otpSecret).update('123456').digest('hex');
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', email: 'original@test.com' });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.otpVerification.findFirst.mockResolvedValue({ id: 'otp-1', email: 'newemail@test.com', codeHash: expectedHash, attempts: 0 });
      mockPrisma.otpVerification.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({ id: '1', email: 'newemail@test.com', isEmailVerified: true });
      mockPrisma.profile.upsert.mockResolvedValue({});

      await service.updateProfile(userId, dto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
          data: expect.objectContaining({
            email: 'newemail@test.com',
            isEmailVerified: true,
          }),
        }),
      );
    });
  });

  describe('updatePreferences', () => {
    it('should save structured preferences and JSON in profile', async () => {
      const userId = '1';
      const dto = {
        minAge: 25,
        maxAge: 32,
        minHeight: "5'4\"",
        maxHeight: "6'0\"",
        maritalStatus: ['Never Married'],
        religions: ['Hindu', 'Christian'],
        locations: ['Kerala', 'Dubai'],
        diet: ['Vegetarian'],
      };

      mockPrisma.profile.upsert.mockResolvedValue({});
      mockPrisma.preference.upsert.mockResolvedValue({
        id: 'pref1',
        userId,
        minAge: 25,
        maxAge: 32,
      });

      const result = await service.updatePreferences(userId, dto);

      expect(mockPrisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: expect.objectContaining({
          preferences: expect.objectContaining({
            minAge: 25,
            maxAge: 32,
            maritalStatus: ['Never Married'],
          }),
        }),
        create: expect.objectContaining({
          userId,
          preferences: expect.objectContaining({
            minAge: 25,
            maxAge: 32,
          }),
        }),
      });

      expect(mockPrisma.preference.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: expect.objectContaining({
          minAge: 25,
          maxAge: 32,
          minHeight: "5'4\"",
          maxHeight: "6'0\"",
          maritalStatuses: 'Never Married',
          religions: 'Hindu, Christian',
        }),
        create: expect.objectContaining({
          minAge: 25,
          maxAge: 32,
          user: { connect: { id: userId } },
        }),
      });

      expect(result.preferences).toBeDefined();
      expect(result.preferences.religions).toEqual(['Hindu', 'Christian']);
    });
  });

  describe('getPublicProfile', () => {
    it('should query only active, non-deleted, non-deactivated, non-banned, USER role, non-blocked profiles', async () => {
      const viewerId = '11111111-1111-1111-1111-111111111111';
      const targetId = '22222222-2222-2222-2222-222222222222';
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-2',
        userId: targetId,
        dateOfBirth: new Date('1998-05-01T00:00:00.000Z'),
        user: {
          id: targetId,
          firstName: 'Demo',
          lastName: 'User',
          profileId: 'IMC-A00002',
          status: 'ACTIVE',
          phone: '+919876543210',
          photos: [],
        },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: viewerId,
        profileId: 'IMC-A00001',
        profile: { id: 'prof-1' },
      });
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      mockPrisma.message.findFirst.mockResolvedValue(null);
      mockPrisma.profile.findUnique.mockResolvedValue({ preferences: {} });
      mockPrisma.contactUnlock.findUnique.mockResolvedValue(null);

      const res = await service.getPublicProfile('IMC-A00002', viewerId, { excludeSelf: true });

      expect(res.profileId).toBe('IMC-A00002');
      expect(mockPrisma.profile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              isBanned: false,
              status: 'ACTIVE',
              deletedAt: null,
              deactivatedAt: null,
              role: 'USER',
              NOT: expect.arrayContaining([
                { receivedConnections: { some: { senderId: viewerId, status: 'BLOCKED' } } },
                { sentConnections: { some: { receiverId: viewerId, status: 'BLOCKED' } } },
              ]),
            }),
          }),
        }),
      );
    });

    it('should reject searching for own Member ID when excludeSelf is true', async () => {
      const viewerId = '11111111-1111-1111-1111-111111111111';
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-1',
        userId: viewerId,
        user: {
          id: viewerId,
          profileId: 'IMC-A00001',
          status: 'ACTIVE',
          photos: [],
        },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: viewerId,
        profileId: 'IMC-A00001',
        profile: { id: 'prof-1' },
      });

      await expect(
        service.getPublicProfile('IMC-A00001', viewerId, { excludeSelf: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target profile is DELETED or has deletedAt set', async () => {
      const viewerId = '11111111-1111-1111-1111-111111111111';
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-del',
        userId: '33333333-3333-3333-3333-333333333333',
        user: {
          id: '33333333-3333-3333-3333-333333333333',
          profileId: 'IMC-A00009',
          status: 'DELETED',
          deletedAt: new Date(),
          photos: [],
        },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: viewerId,
        profileId: 'IMC-A00001',
        profile: { id: 'prof-1' },
      });

      await expect(
        service.getPublicProfile('IMC-A00009', viewerId, { excludeSelf: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid Member ID formats when excludeSelf is true', async () => {
      await expect(
        service.getPublicProfile('IMC-12', '11111111-1111-1111-1111-111111111111', { excludeSelf: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should normalize same-gender bare lookingFor to opposite gender on Marriage public profiles', async () => {
      const targetUserId = '22222222-2222-2222-2222-222222222222';
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-monisha',
        userId: targetUserId,
        category: 'Marriage',
        profileFor: 'Marriage',
        gender: 'female',
        lookingFor: 'Female',
        user: {
          id: targetUserId,
          profileId: 'IMC-A00029',
          firstName: 'Monisha',
          lastName: 'KG',
          status: 'ACTIVE',
          photos: [],
        },
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.connection.findFirst.mockResolvedValue(null);

      const res = await service.getPublicProfile(targetUserId);
      expect(res.lookingFor).toBe('Male');
    });
  });
});
