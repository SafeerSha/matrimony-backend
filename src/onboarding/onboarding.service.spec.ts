import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

jest.mock('argon2');

describe('OnboardingService', () => {
  let service: OnboardingService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockNotificationsService = {
    createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw NotFoundException if user does not exist', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(
      service.completeOnboarding('unknown-id', {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if user is suspended', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      status: 'SUSPENDED',
      profile: {},
      photos: [],
    });

    await expect(
      service.completeOnboarding('usr-1', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if mandatory fields are missing', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      status: 'DRAFT',
      profile: { gender: 'MALE' }, // Missing dateOfBirth, education, photos
      photos: [],
    });

    await expect(
      service.completeOnboarding('usr-1', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('should activate user and profile when valid, and send welcome notification', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      email: 'test@example.com',
      phone: '+919876543210',
      profileId: 'LT-A00001',
      role: 'USER',
      status: 'DRAFT',
      profile: {
        gender: 'MALE',
        dateOfBirth: new Date('1995-05-15'),
        education: 'B.Tech',
      },
      photos: [{ id: 'p1', url: 'https://img.com/p1.jpg' }],
    });

    (argon2.hash as jest.Mock).mockResolvedValue('hashedPassword');

    const mockUpdatedUser = {
      id: 'usr-1',
      email: 'test@example.com',
      phone: '+919876543210',
      profileId: 'LT-A00001',
      role: 'USER',
      status: 'ACTIVE',
    };

    const mockUpdatedProfile = {
      id: 'prof-1',
      userId: 'usr-1',
      gender: 'MALE',
      dateOfBirth: new Date('1995-05-15'),
      education: 'B.Tech',
      onboardingStep: 5,
    };

    mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
      return cb({
        user: { update: jest.fn().mockResolvedValue(mockUpdatedUser) },
        profile: { upsert: jest.fn().mockResolvedValue(mockUpdatedProfile) },
      });
    });

    const result = await service.completeOnboarding('usr-1', {
      password: 'StrongPassword123!',
    });

    expect(result.success).toBe(true);
    expect(result.user.status).toBe('ACTIVE');
    expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
      'usr-1',
      'SYSTEM',
      expect.stringContaining('Welcome to ShaadiChat'),
    );
  });

  it('should throw ConflictException if email passed to completeOnboarding is taken', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'usr-1',
      status: 'DRAFT',
      profile: { gender: 'MALE', dateOfBirth: new Date('1995-05-15'), education: 'B.Tech' },
      photos: [{ id: 'p1', url: 'https://img.com/p1.jpg' }],
    });
    mockPrismaService.user.findFirst.mockResolvedValue({ id: 'usr-2', email: 'taken@example.com' });

    await expect(
      service.completeOnboarding('usr-1', { email: 'taken@example.com' }),
    ).rejects.toThrow(ConflictException);
  });
});
