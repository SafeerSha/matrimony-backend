import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

const mockArgon2Hash = jest.fn<any>();
const mockArgon2Verify = jest.fn<any>();

jest.unstable_mockModule('argon2', () => ({
  hash: mockArgon2Hash,
  verify: mockArgon2Verify,
  default: {
    hash: mockArgon2Hash,
    verify: mockArgon2Verify,
  },
}));

jest.unstable_mockModule('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    sign = jest.fn();
    signAsync = jest.fn();
  },
}));

jest.unstable_mockModule('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));

const argon2 = await import('argon2');
const { JwtService } = await import('@nestjs/jwt');
const { ConfigService } = await import('@nestjs/config');
const { AuthService } = await import('./auth.service');
const { UsersService } = await import('../users/users.service');
const { PrismaService } = await import('../prisma/prisma.service');

describe('AuthService', () => {
  let service: InstanceType<typeof AuthService>;
  let usersService: InstanceType<typeof UsersService>;
  let jwt: InstanceType<typeof JwtService>;

  const mockUsersService = {
    findByEmail: jest.fn<any>(),
    findByPhone: jest.fn<any>(),
    create: jest.fn<any>(),
    updateRefreshToken: jest.fn<any>(),
    findById: jest.fn<any>(),
    clearRefreshToken: jest.fn<any>(),
    generateUniqueProfileId: jest.fn<any>(),
  };

  const mockJwt = {
    sign: jest.fn<any>(),
    signAsync: jest.fn<any>().mockResolvedValue('token'),
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    profile: {
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      upsert: jest.fn<any>(),
    },
    otpVerification: {
      findFirst: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
    },
    userDevice: {
      findMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      upsert: jest.fn<any>(),
      delete: jest.fn<any>(),
      deleteMany: jest.fn<any>(),
    },
    $transaction: jest.fn<any>(),
  };

  beforeEach(async () => {
    mockPrismaService.user.update.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    jwt = module.get(JwtService);
  });

  afterEach(() => {
    service?.onModuleDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const dto = { email: 'test@test.com', password: 'password', firstName: 'Test', lastName: 'User' };
      mockUsersService.findByEmail.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashedPassword');
      
      const createdUser = { id: '1', ...dto, passwordHash: 'hashedPassword', isBanned: false, role: 'USER' };
      mockUsersService.create.mockResolvedValue(createdUser);
      mockJwt.sign.mockReturnValue('token');

      const result = await service.register(dto);

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(dto.email);
      expect(mockUsersService.create).toHaveBeenCalled();
      expect((result as any).user.passwordHash).toBeUndefined();
      expect(result.accessToken).toBe('token');
      expect((result as any).user.id).toEqual('1');
    });

    it('should throw ConflictException if email exists', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      mockUsersService.findByEmail.mockResolvedValue({ id: '1', email: dto.email });

      await expect(service.register(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully and return token', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash', isPasswordEnabled: true, role: 'USER', isBanned: false };
      
      mockUsersService.findByEmail.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      mockJwt.sign.mockReturnValue('token');

      const result = await service.login(dto);

      expect(result.accessToken).toEqual('token');
      expect(result.user.id).toEqual('1');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash', isPasswordEnabled: true, role: 'USER', isBanned: false };
      
      mockUsersService.findByEmail.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if user registered via OTP and has no password', async () => {
      const dto = { email: 'otpuser@test.com', password: 'password' };
      const user = { id: '1', email: 'otpuser@test.com', passwordHash: null, isPasswordEnabled: false, role: 'USER', isBanned: false };

      mockUsersService.findByEmail.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toThrow(
        'This account was registered via Mobile OTP and does not have a password set. Please sign in using the Mobile OTP tab.',
      );
    });

    it('should throw BadRequestException if password login is disabled for the account', async () => {
      const dto = { email: 'disabled@test.com', password: 'password' };
      const user = { id: '1', email: 'disabled@test.com', passwordHash: 'hash', isPasswordEnabled: false, role: 'USER', isBanned: false };

      mockUsersService.findByEmail.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toThrow(
        'Password login is disabled for this account. Please sign in using the Mobile OTP tab or re-enable password login in account settings.',
      );
    });

    it('should login by phone number when phone is provided as identifier', async () => {
      const dto = { identifier: '+919876543210', password: 'password' };
      const user = { id: '1', phone: '+919876543210', passwordHash: 'hash', isPasswordEnabled: true, role: 'USER', isBanned: false };

      mockUsersService.findByPhone.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login(dto);

      expect(mockUsersService.findByPhone).toHaveBeenCalledWith('+919876543210');
      expect(result.accessToken).toEqual('token');
    });
  });

  describe('quickRegister', () => {
    it('should create new DRAFT user and profile and return tokens', async () => {
      const dto = {
        name: 'Safeer Sha',
        email: 'safeer@example.com',
        phone: '+919876543210',
        gender: 'MALE',
        profileFor: 'Myself',
      };

      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockUsersService.generateUniqueProfileId = jest.fn().mockResolvedValue('LT-A00001');

      const mockCreatedUser = {
        id: 'usr-1',
        email: 'safeer@example.com',
        phone: '+919876543210',
        firstName: 'Safeer',
        lastName: 'Sha',
        role: 'USER',
        status: 'DRAFT',
        profileId: 'LT-A00001',
      };

      const mockCreatedProfile = {
        id: 'prof-1',
        userId: 'usr-1',
        firstName: 'Safeer',
        lastName: 'Sha',
        gender: 'MALE',
        onboardingStep: 1,
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        return cb({
          user: { create: jest.fn().mockResolvedValue(mockCreatedUser) },
          profile: { create: jest.fn().mockResolvedValue(mockCreatedProfile) },
        });
      });

      (argon2.hash as jest.Mock).mockResolvedValue('hashedRefresh');

      const result = await service.quickRegister(dto);

      expect(result.user.email).toBe('safeer@example.com');
      expect(result.user.status).toBe('DRAFT');
      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('token');
      expect(result.refreshToken).toBe('token');
    });

    it('should create new DRAFT user and profile without email when email is omitted (phone-first)', async () => {
      const dto = {
        name: 'Safeer Sha',
        phone: '+919876543210',
        gender: 'MALE',
        profileFor: 'Myself',
      };

      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockUsersService.generateUniqueProfileId = jest.fn().mockResolvedValue('LT-A00002');

      const mockCreatedUser = {
        id: 'usr-2',
        email: null,
        phone: '+919876543210',
        firstName: 'Safeer',
        lastName: 'Sha',
        role: 'USER',
        status: 'DRAFT',
        profileId: 'LT-A00002',
      };

      const mockCreatedProfile = {
        id: 'prof-2',
        userId: 'usr-2',
        firstName: 'Safeer',
        lastName: 'Sha',
        gender: 'MALE',
        onboardingStep: 1,
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        return cb({
          user: { create: jest.fn().mockResolvedValue(mockCreatedUser) },
          profile: { create: jest.fn().mockResolvedValue(mockCreatedProfile) },
        });
      });

      const result = await service.quickRegister(dto);

      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ phone: '+919876543210' }],
        },
        include: { profile: true },
      });
      expect(result.user.email).toBeNull();
      expect(result.user.status).toBe('DRAFT');
      expect(result.success).toBe(true);
    });

    it('should throw ConflictException if ACTIVE user exists with same email/phone', async () => {
      const dto = {
        email: 'active@example.com',
        phone: '+919876543210',
      };

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'usr-existing',
        email: 'active@example.com',
        status: 'ACTIVE',
      });

      await expect(service.quickRegister(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('sendOtp', () => {
    it('should invalidate existing unconsumed OTPs and create new OTP record', async () => {
      const dto = { phone: '+919876543210' };
      mockPrismaService.otpVerification.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.otpVerification.create.mockResolvedValue({ id: 'otp-1' });

      const result = await service.sendOtp(dto);

      expect(mockPrismaService.otpVerification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phone: '+919876543210', consumed: false },
          data: { consumed: true },
        }),
      );
      expect(mockPrismaService.otpVerification.create).toHaveBeenCalled();
      expect(result.message).toBe('Verification code sent successfully');
    });

    it('should throw BadRequestException for invalid phone number', async () => {
      await expect(service.sendOtp({ phone: '123' })).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException on sendOtp if purpose is login and user is not registered', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      await expect(
        service.sendOtp({ phone: '+919876543210', purpose: 'login' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyOtp', () => {
    it('should throw BadRequestException if no active OTP found for non-default code', async () => {
      mockPrismaService.otpVerification.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ phone: '+919876543210', otp: '999999' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException on verifyOtp if user is not registered', async () => {
      const otpRecord = {
        id: 'otp-1',
        phone: '+919876543210',
        codeHash: 'somehash',
        attempts: 0,
        consumed: false,
        expiresAt: new Date(Date.now() + 60000),
      };

      mockPrismaService.otpVerification.findFirst.mockResolvedValue(otpRecord);
      mockPrismaService.otpVerification.update.mockResolvedValue({});
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ phone: '+919876543210', otp: '123456' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify OTP and create new User & Profile when allowCreate is true during registration', async () => {
      const otpRecord = {
        id: 'otp-1',
        phone: '+919876543210',
        codeHash: 'somehash',
        attempts: 0,
        consumed: false,
        expiresAt: new Date(Date.now() + 60000),
      };

      mockPrismaService.otpVerification.findFirst.mockResolvedValue(otpRecord);
      mockPrismaService.otpVerification.update.mockResolvedValue({});
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockUsersService.generateUniqueProfileId.mockResolvedValue('LT-A00001');

      const mockUser = {
        id: 'usr-new',
        phone: '+919876543210',
        email: null,
        role: 'USER',
        status: 'DRAFT',
        isPhoneVerified: true,
        profileId: 'LT-A00001',
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        return cb({
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          profile: { create: jest.fn().mockResolvedValue({ id: 'prof-new' }) },
        });
      });

      const result = await service.verifyRegistration({ phone: '+919876543210', phoneOtp: '123456' });

      expect(mockPrismaService.otpVerification.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { consumed: true },
      });
      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('token');
      expect(result.user.phone).toBe('+919876543210');
      expect(result.user.isPhoneVerified).toBe(true);
    });

    it('should update isPhoneVerified for existing user upon OTP verification', async () => {
      const otpRecord = {
        id: 'otp-1',
        phone: '+919876543210',
        codeHash: 'somehash',
        attempts: 0,
        consumed: false,
        expiresAt: new Date(Date.now() + 60000),
      };

      mockPrismaService.otpVerification.findFirst.mockResolvedValue(otpRecord);
      mockPrismaService.otpVerification.update.mockResolvedValue({});

      const existingUser = {
        id: 'usr-exist',
        phone: '+919876543210',
        email: 'exist@test.com',
        role: 'USER',
        status: 'ACTIVE',
        isPhoneVerified: false,
        profileId: 'LT-A00001',
      };

      mockPrismaService.user.findFirst.mockResolvedValue(existingUser);
      mockPrismaService.user.update.mockResolvedValue({
        ...existingUser,
        isPhoneVerified: true,
      });

      const result = await service.verifyOtp({ phone: '+919876543210', otp: '123456' });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-exist' },
        data: { isPhoneVerified: true },
        include: { profile: true },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('setPassword', () => {
    it('should hash and update user password and enable password login', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      (argon2.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      const updatedUser = {
        id: 'usr-1',
        isPasswordEnabled: true,
        passwordChangedAt: new Date(),
      };
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.setPassword('usr-1', {
        password: 'NewSecurePassword123!',
        confirmPassword: 'NewSecurePassword123!',
      });

      expect(result.success).toBe(true);
      expect(result.isPasswordEnabled).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-1' },
          data: expect.objectContaining({
            passwordHash: 'newHashedPassword',
            isPasswordEnabled: true,
          }),
        }),
      );
    });

    it('should throw BadRequestException if password is less than 8 characters', async () => {
      await expect(
        service.setPassword('usr-1', { password: 'short' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if confirmPassword does not match', async () => {
      await expect(
        service.setPassword('usr-1', {
          password: 'Password123!',
          confirmPassword: 'MismatchedPassword123!',
        }),
      ).rejects.toThrow('Passwords do not match');
    });
  });

  describe('enablePassword', () => {
    it('should enable password when user already has a passwordHash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'usr-1',
        passwordHash: 'existingHash',
        isPasswordEnabled: false,
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'usr-1',
        isPasswordEnabled: true,
        passwordChangedAt: new Date(),
      });

      const result = await service.enablePassword('usr-1');

      expect(result.success).toBe(true);
      expect(result.isPasswordEnabled).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { isPasswordEnabled: true },
      });
    });

    it('should set and enable new password if provided in enable request', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'usr-1', passwordHash: null });
      (argon2.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      mockPrismaService.user.update.mockResolvedValue({
        id: 'usr-1',
        isPasswordEnabled: true,
        passwordChangedAt: new Date(),
      });

      const result = await service.enablePassword('usr-1', {
        password: 'BrandNewPassword123!',
        confirmPassword: 'BrandNewPassword123!',
      });

      expect(result.success).toBe(true);
      expect(result.isPasswordEnabled).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-1' },
          data: expect.objectContaining({
            passwordHash: 'newHashedPassword',
            isPasswordEnabled: true,
          }),
        }),
      );
    });

    it('should throw BadRequestException if user has no password and none is provided', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'usr-1',
        passwordHash: null,
      });

      await expect(service.enablePassword('usr-1')).rejects.toThrow(
        'No password set on this account. Please set a password first to enable password login.',
      );
    });
  });

  describe('disablePassword', () => {
    it('should disable password login successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'usr-1',
        passwordHash: 'existingHash',
        isPasswordEnabled: true,
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'usr-1',
        isPasswordEnabled: false,
        passwordChangedAt: new Date(),
      });

      const result = await service.disablePassword('usr-1');

      expect(result.success).toBe(true);
      expect(result.isPasswordEnabled).toBe(false);
      expect(result.message).toContain('Mobile OTP');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { isPasswordEnabled: false },
      });
    });
  });

  describe('getPasswordStatus', () => {
    it('should return password status for user', async () => {
      const now = new Date();
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'usr-1',
        isPasswordEnabled: true,
        passwordHash: 'someHash',
        passwordChangedAt: now,
      });

      const result = await service.getPasswordStatus('usr-1');

      expect(result.success).toBe(true);
      expect(result.hasPassword).toBe(true);
      expect(result.isPasswordEnabled).toBe(true);
      expect(result.passwordChangedAt).toEqual(now);
    });
  });

  describe('Device Session Management', () => {
    it('should return list of active devices and identify current device', async () => {
      const now = new Date();
      const mockDevices = [
        {
          id: 'dev-1',
          userId: 'usr-1',
          sessionId: 'sess-current',
          deviceName: 'Chrome on Windows 11',
          deviceType: 'DESKTOP',
          browser: 'Chrome',
          os: 'Windows 11',
          location: 'Kochi, Kerala',
          ipAddress: '127.0.0.1',
          lastActiveAt: now,
          createdAt: now,
        },
        {
          id: 'dev-2',
          userId: 'usr-1',
          sessionId: 'sess-other',
          deviceName: 'ShaadiChat iOS Mobile App',
          deviceType: 'MOBILE',
          browser: 'ShaadiChat App',
          os: 'iOS',
          location: 'Kochi',
          ipAddress: '127.0.0.1',
          lastActiveAt: new Date(now.getTime() - 7200000),
          createdAt: new Date(now.getTime() - 7200000),
        },
      ];

      mockPrismaService.userDevice.findMany.mockResolvedValue(mockDevices);
      mockPrismaService.userDevice.updateMany.mockResolvedValue({});

      const result = await service.getDevices('usr-1', 'sess-current');

      expect(result).toHaveLength(2);
      expect(result[0].isCurrent).toBe(true);
      expect(result[0].deviceName).toBe('Chrome on Windows 11');
      expect(result[1].isCurrent).toBe(false);
      expect(result[1].deviceType).toBe('MOBILE');
    });

    it('should log out all other devices except current session', async () => {
      mockPrismaService.userDevice.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.logoutOtherDevices('usr-1', 'sess-current');

      expect(result.success).toBe(true);
      expect(result.revokedCount).toBe(2);
      expect(mockPrismaService.userDevice.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'usr-1',
          sessionId: { not: 'sess-current' },
        },
      });
    });

    it('should remove specific device by id', async () => {
      mockPrismaService.userDevice.findFirst.mockResolvedValue({
        id: 'dev-other',
        userId: 'usr-1',
        sessionId: 'sess-other',
      });
      mockPrismaService.userDevice.delete.mockResolvedValue({});

      const result = await service.removeDevice('usr-1', 'dev-other', 'sess-current');

      expect(result.success).toBe(true);
      expect(mockPrismaService.userDevice.delete).toHaveBeenCalledWith({
        where: { id: 'dev-other' },
      });
    });

    it('should throw NotFoundException if device to remove does not exist', async () => {
      mockPrismaService.userDevice.findFirst.mockResolvedValue(null);

      await expect(
        service.removeDevice('usr-1', 'dev-unknown', 'sess-current'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('activityThrottleMap TTL cleanup & bounded memory', () => {
    it('should throttle repeated updates within 5 minutes and allow update after TTL expires', () => {
      jest.useFakeTimers({ now: 1_000_000 });
      service.onModuleDestroy(); // stop constructor's real-timer interval
      const localService = new AuthService(
        mockUsersService as any,
        mockPrismaService as any,
        mockJwt as any,
        { get: jest.fn() } as any,
      );

      try {
        localService.recordActivityThrottled('user-1');
        localService.recordActivityThrottled('user-1');
        expect(mockPrismaService.user.update).toHaveBeenCalledTimes(1);
        expect(localService.getActivityThrottleMapSize()).toBe(1);

        // Advance 4 minutes (still within 5-min throttle window)
        jest.advanceTimersByTime(4 * 60 * 1000);
        localService.recordActivityThrottled('user-1');
        expect(mockPrismaService.user.update).toHaveBeenCalledTimes(1);

        // Advance 1 more minute (total 5 minutes -> TTL expired)
        jest.advanceTimersByTime(60 * 1000);
        localService.recordActivityThrottled('user-1');
        expect(mockPrismaService.user.update).toHaveBeenCalledTimes(2);
      } finally {
        localService.onModuleDestroy();
      }
    });

    it('should periodically remove expired entries from activityThrottleMap', () => {
      jest.useFakeTimers({ now: 1_000_000 });
      service.onModuleDestroy();
      const localService = new AuthService(
        mockUsersService as any,
        mockPrismaService as any,
        mockJwt as any,
        { get: jest.fn() } as any,
      );

      try {
        localService.recordActivityThrottled('user-old');
        jest.advanceTimersByTime(3 * 60 * 1000);
        localService.recordActivityThrottled('user-fresh');
        expect(localService.getActivityThrottleMapSize()).toBe(2);

        // Advance 2 more minutes -> interval runs at t+5m; user-old is 5m old (expired), user-fresh is 2m old (kept)
        jest.advanceTimersByTime(2 * 60 * 1000);
        expect(localService.getActivityThrottleMapSize()).toBe(1);

        // Advance another 5 minutes -> user-fresh is now expired and cleaned up too
        jest.advanceTimersByTime(5 * 60 * 1000);
        expect(localService.getActivityThrottleMapSize()).toBe(0);
      } finally {
        localService.onModuleDestroy();
      }
    });

    it('should prevent unbounded Map growth beyond max capacity', () => {
      jest.useFakeTimers({ now: 1_000_000 });
      service.onModuleDestroy();
      const localService = new AuthService(
        mockUsersService as any,
        mockPrismaService as any,
        mockJwt as any,
        { get: jest.fn() } as any,
      );

      try {
        for (let i = 0; i < 10_250; i++) {
          localService.recordActivityThrottled(`user-${i}`);
        }

        expect(localService.getActivityThrottleMapSize()).toBe(10_000);
      } finally {
        localService.onModuleDestroy();
      }
    });

    it('should purge expired entries first before evicting active entries when capacity is reached', () => {
      jest.useFakeTimers({ now: 1_000_000 });
      service.onModuleDestroy();
      const localService = new AuthService(
        mockUsersService as any,
        mockPrismaService as any,
        mockJwt as any,
        { get: jest.fn() } as any,
      );

      try {
        // Constructor ran at t=0 (interval runs at 5m, 10m, ...).
        // Advance 1m so old-* are recorded at t=1m (only 4m old at first 5m tick).
        jest.advanceTimersByTime(1 * 60 * 1000);
        for (let i = 0; i < 5_000; i++) {
          localService.recordActivityThrottled(`old-${i}`);
        }

        // Advance 4m -> t=5m: interval runs (old-* are 4m old, still active); record fresh-* at t=5m
        jest.advanceTimersByTime(4 * 60 * 1000);
        for (let i = 0; i < 4_999; i++) {
          localService.recordActivityThrottled(`fresh-${i}`);
        }
        expect(localService.getActivityThrottleMapSize()).toBe(9_999);

        // Advance 1m -> t=6m: old-* are now 5m old (expired), fresh-* are 1m old (active),
        // and next interval isn't until t=10m. Capacity check purges expired old-* first.
        jest.advanceTimersByTime(1 * 60 * 1000);
        localService.recordActivityThrottled('trigger-1');
        expect(localService.getActivityThrottleMapSize()).toBe(10_000);
        localService.recordActivityThrottled('trigger-2');
        // All 5,000 expired entries were purged, leaving 4,999 fresh + 2 triggers
        expect(localService.getActivityThrottleMapSize()).toBe(5_001);
      } finally {
        localService.onModuleDestroy();
      }
    });
  });
});


