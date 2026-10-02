import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwt: JwtService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
  };

  const mockJwt = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
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
  });
});
