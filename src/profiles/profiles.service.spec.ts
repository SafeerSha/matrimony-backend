import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesService, calculateAge, formatPreferencesObject } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: PrismaService;

  const mockPrisma = {
    profile: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
    },
    preference: {
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
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
      mockPrisma.user.findUnique.mockResolvedValue({ id: userId, profile: {}, photos: [] });

      await service.updateProfile(userId, dto);

      const updatePayload = (prisma.profile.upsert as jest.Mock).mock.calls[0][0].update;
      expect(updatePayload.role).toBeUndefined();
      expect(updatePayload.status).toBeUndefined();
      expect(updatePayload.isBanned).toBeUndefined();
      expect(updatePayload.phone).toBeUndefined();
    });

    it('should throw ConflictException if updated email belongs to another user', async () => {
      const userId = '1';
      const dto = { email: 'duplicate@test.com' };
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'other-user', email: 'duplicate@test.com' });

      await expect(service.updateProfile(userId, dto)).rejects.toThrow(ConflictException);
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
});
