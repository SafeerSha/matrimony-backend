import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwt: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    findById: jest.fn(),
    clearRefreshToken: jest.fn(),
    generateUniqueProfileId: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn(),
    signAsync: jest.fn().mockResolvedValue('token'),
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    otpVerification: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwt = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
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
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash', role: 'USER', isBanned: false };
      
      mockUsersService.findByEmail.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      mockJwt.sign.mockReturnValue('token');

      const result = await service.login(dto);

      expect(result.accessToken).toEqual('token');
      expect(result.user.id).toEqual('1');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const dto = { email: 'test@test.com', password: 'password' };
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash', role: 'USER', isBanned: false };
      
      mockUsersService.findByEmail.mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if user registered via OTP and has no password', async () => {
      const dto = { email: 'otpuser@test.com', password: 'password' };
      const user = { id: '1', email: 'otpuser@test.com', passwordHash: null, role: 'USER', isBanned: false };

      mockUsersService.findByEmail.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toThrow(
        'This account was registered via Mobile OTP and does not have a password set. Please sign in using the Mobile OTP tab.',
      );
    });

    it('should login by phone number when phone is provided as identifier', async () => {
      const dto = { identifier: '+919876543210', password: 'password' };
      const user = { id: '1', phone: '+919876543210', passwordHash: 'hash', role: 'USER', isBanned: false };

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
    it('should hash and update user password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'usr-1' });
      (argon2.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.setPassword('usr-1', { password: 'NewSecurePassword123!' });

      expect(result.success).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        data: { passwordHash: 'newHashedPassword' },
      });
    });

    it('should throw BadRequestException if password is less than 8 characters', async () => {
      await expect(
        service.setPassword('usr-1', { password: 'short' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});


