import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: PrismaService;

  const mockPrisma = {
    profile: {
      upsert: jest.fn(),
    },
    preference: {
      upsert: jest.fn(),
    },
    user: {
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertProfile', () => {
    it('should upsert user profile', async () => {
      const userId = '1';
      const dto = { bio: 'Hello', city: 'NY' };
      const expectedResult = { id: 'p1', userId, ...dto };

      mockPrisma.profile.upsert.mockResolvedValue(expectedResult);

      const result = await service.updateProfile(userId, dto);
      expect(result).toEqual(expectedResult);
      expect(prisma.profile.upsert).toHaveBeenCalledWith({
        where: { userId },
        update: { ...dto, dateOfBirth: undefined },
        create: {
          ...dto,
          dateOfBirth: undefined,
          user: { connect: { id: userId } },
        },
      });
    });
  });

  describe('upsertPreferences', () => {
    it('should upsert user preferences', async () => {
      const userId = '1';
      const dto = { minAge: 20, maxAge: 30 };
      const expectedResult = { id: 'pref1', userId, ...dto };

      mockPrisma.preference.upsert.mockResolvedValue(expectedResult);

      const result = await service.updatePreferences(userId, dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getProfile', () => {
    it('should return user profile if user exists', async () => {
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash', profile: { bio: 'test' } };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getProfile('1');
      expect((result as any).passwordHash).toBeUndefined();
      expect((result as any).profile).toBeDefined();
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('invalid')).rejects.toThrow(NotFoundException);
    });
  });
});
