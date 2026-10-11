import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { QuickRegisterDto } from './dto/quick-register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ConfigService } from '@nestjs/config';
import { normalizePhoneNumber } from '../common/utils/phone.util';
import { splitFullName } from '../common/utils/name.util';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async getTokens(userId: string, email: string | null | undefined, role: string) {
    const payload = { sub: userId, email: email || '', role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.usersService.updateRefreshToken(userId, hashedRefreshToken);
  }

  async quickRegister(dto: QuickRegisterDto) {
    const normalizedEmail = dto.email ? dto.email.trim().toLowerCase() : null;
    const normalizedPhone = normalizePhoneNumber(dto.phone);

    if (!normalizedPhone) {
      throw new BadRequestException('A valid phone number is required');
    }

    const { firstName, lastName } = splitFullName(dto.name, dto.firstName, dto.lastName);

    // Determine category, profileFor, and createdBy
    const CATEGORIES = ['Marriage', 'Friendship', 'Living Together'];
    let category = dto.category || 'Marriage';
    let profileFor = dto.profileFor || dto.createdBy || 'Myself';
    const createdBy = dto.createdBy || (dto.profileFor && !CATEGORIES.includes(dto.profileFor) ? dto.profileFor : 'Myself');

    if (dto.profileFor && CATEGORIES.includes(dto.profileFor)) {
      category = dto.profileFor;
      profileFor = dto.createdBy || 'Myself';
    }

    // Collision check: does email or phone exist?
    // Avoid checking { email: null } because that would match all users without emails
    const orConditions: Array<{ email?: string; phone?: string }> = [{ phone: normalizedPhone }];
    if (normalizedEmail) {
      orConditions.push({ email: normalizedEmail });
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: orConditions,
      },
      include: {
        profile: true,
      },
    });

    if (existingUser) {
      if (existingUser.status === 'ACTIVE' || existingUser.status === 'PENDING_VERIFICATION') {
        throw new ConflictException({
          code: 'ACCOUNT_EXISTS',
          message: 'An account with this email/phone already exists. Please log in.',
        });
      }

      if (existingUser.status === 'SUSPENDED' || existingUser.isBanned) {
        throw new UnauthorizedException('This account has been suspended. Please contact support.');
      }

      if (existingUser.status === 'DRAFT') {
        // If email was provided now and wasn't set earlier on this draft, attach it
        if (normalizedEmail && !existingUser.email) {
          await this.prisma.user.update({
            where: { id: existingUser.id },
            data: { email: normalizedEmail },
          });
          existingUser.email = normalizedEmail;
        }

        // Resuming existing draft
        const tokens = await this.getTokens(existingUser.id, existingUser.email, existingUser.role);
        await this.updateRefreshToken(existingUser.id, tokens.refreshToken);

        let profile = existingUser.profile;
        if (!profile) {
          profile = await this.prisma.profile.create({
            data: {
              userId: existingUser.id,
              firstName: firstName || existingUser.firstName,
              lastName: lastName || existingUser.lastName,
              gender: dto.gender,
              profileFor,
              category,
              lookingIn: dto.lookingIn || dto.community,
              community: dto.community || dto.lookingIn,
              onboardingStep: 1,
            },
          });
        } else {
          // Update draft fields if newly provided
          profile = await this.prisma.profile.update({
            where: { id: profile.id },
            data: {
              firstName: firstName || profile.firstName,
              lastName: lastName || profile.lastName,
              gender: dto.gender || profile.gender,
              lookingIn: dto.lookingIn || profile.lookingIn,
              community: dto.community || profile.community,
              category: category || profile.category,
              profileFor: profileFor || profile.profileFor,
            },
          });
        }

        return {
          success: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            phone: existingUser.phone,
            status: existingUser.status,
            role: existingUser.role,
          },
          profile: {
            id: profile.id,
            firstName: profile.firstName || existingUser.firstName || 'User',
            lastName: profile.lastName || existingUser.lastName || '',
            gender: profile.gender,
            profileFor: profile.profileFor || profile.category || 'Marriage',
            category: profile.category,
            lookingIn: profile.lookingIn,
            onboardingStep: profile.onboardingStep,
          },
        };
      }
    }

    // New user creation within transaction
    const profileId = await this.usersService.generateUniqueProfileId();

    const { user, profile } = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          phone: normalizedPhone,
          firstName,
          lastName,
          profileId,
          role: 'USER',
          status: 'DRAFT',
          isPhoneVerified: false,
          isEmailVerified: false,
        },
      });

      const newProfile = await tx.profile.create({
        data: {
          userId: newUser.id,
          firstName,
          lastName,
          gender: dto.gender,
          profileFor,
          category,
          lookingIn: dto.lookingIn || dto.community,
          community: dto.community || dto.lookingIn,
          onboardingStep: 1,
        },
      });

      return { user: newUser, profile: newProfile };
    });

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        status: user.status,
        role: user.role,
      },
      profile: {
        id: profile.id,
        firstName: profile.firstName || 'User',
        lastName: profile.lastName || '',
        gender: profile.gender,
        profileFor: profile.profileFor || profile.category || 'Marriage',
        category: profile.category,
        lookingIn: profile.lookingIn,
        onboardingStep: profile.onboardingStep,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      status: 'ACTIVE',
    });

    // Create linked profile if not exists
    await this.prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        onboardingStep: 5,
      },
      update: {},
    });

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    const { passwordHash: _, hashedRefreshToken: __, ...result } = user;

    return {
      ...tokens,
      user: result,
    };
  }

  private getOtpSecret(): string {
    return this.configService.get<string>('JWT_ACCESS_SECRET') || 'shaadichat-otp-secret-salt';
  }

  async sendOtp(dto: SendOtpDto) {
    const normalizedPhone = normalizePhoneNumber(dto.phone);
    if (!normalizedPhone) {
      throw new BadRequestException('A valid 10-digit mobile number is required');
    }

    if (dto.purpose === 'login') {
      const existingUser = await this.prisma.user.findFirst({
        where: { phone: normalizedPhone },
      });
      if (!existingUser) {
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'No account found with this mobile number. Please register first.',
        });
      }
    }

    // Invalidate any previous unconsumed OTPs for this phone number
    await this.prisma.otpVerification.updateMany({
      where: {
        phone: normalizedPhone,
        consumed: false,
      },
      data: {
        consumed: true,
      },
    });

    // Skip real SMS sending and accept default 123456 OTP
    const defaultOtp = '123456';
    const codeHash = crypto
      .createHmac('sha256', this.getOtpSecret())
      .update(defaultOtp)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.otpVerification.create({
      data: {
        phone: normalizedPhone,
        codeHash,
        attempts: 0,
        consumed: false,
        expiresAt,
      },
    });

    const maskedPhone = `${normalizedPhone.slice(0, 3)}****${normalizedPhone.slice(-4)}`;
    console.log(`[SMS-SERVICE] Mobile OTP bypassed for ${maskedPhone}. Default OTP: 123456`);

    return {
      message: 'Verification code sent successfully',
      defaultOtp: '123456',
    };
  }

  async verifyOtp(dto: VerifyOtpDto, allowCreate = false) {
    const code = (dto.otp || dto.phoneOtp || '').trim();
    if (!code) {
      throw new BadRequestException('A valid 6-digit OTP code is required');
    }

    const normalizedPhone = normalizePhoneNumber(dto.phone);
    if (!normalizedPhone) {
      throw new BadRequestException('A valid 10-digit mobile number is required');
    }

    const isDefaultOtp = code === '123456';

    // Lookup latest unconsumed OtpVerification for phone where expiresAt > NOW()
    const otpRecord = await this.prisma.otpVerification.findFirst({
      where: {
        phone: normalizedPhone,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!isDefaultOtp) {
      if (!otpRecord) {
        throw new BadRequestException('Invalid or expired OTP. Please request a new code.');
      }

      // Enforce max 3 attempts per OTP to prevent brute force; mark consumed: true if exceeded
      if (otpRecord.attempts >= 3) {
        await this.prisma.otpVerification.update({
          where: { id: otpRecord.id },
          data: { consumed: true },
        });
        throw new BadRequestException(
          'Too many invalid attempts. This OTP has been invalidated. Please request a new code.',
        );
      }

      // Verify code against codeHash (constant-time comparison)
      const calculatedHash = crypto
        .createHmac('sha256', this.getOtpSecret())
        .update(code)
        .digest('hex');

      const hashesMatch =
        otpRecord.codeHash.length === calculatedHash.length &&
        crypto.timingSafeEqual(
          Buffer.from(otpRecord.codeHash, 'hex'),
          Buffer.from(calculatedHash, 'hex'),
        );

      if (!hashesMatch) {
        const newAttempts = otpRecord.attempts + 1;
        await this.prisma.otpVerification.update({
          where: { id: otpRecord.id },
          data: {
            attempts: newAttempts,
            consumed: newAttempts >= 3,
          },
        });

        throw new BadRequestException(
          newAttempts >= 3
            ? 'Too many invalid attempts. This OTP has been invalidated.'
            : `Invalid OTP code. ${3 - newAttempts} attempt(s) remaining.`,
        );
      }
    }

    // Mark the OTP as consumed immediately if an OTP record exists
    if (otpRecord) {
      await this.prisma.otpVerification.update({
        where: { id: otpRecord.id },
        data: { consumed: true },
      });
    }

    // Find User
    let user = await this.prisma.user.findFirst({
      where: { phone: normalizedPhone },
      include: { profile: true },
    });

    if (user) {
      if (user.status === 'SUSPENDED') {
        throw new UnauthorizedException('Account is suspended');
      }

      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true },
        include: { profile: true },
      });
    } else {
      if (!allowCreate) {
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          message: 'No account found with this mobile number. Please register first.',
        });
      }

      const profileId = await this.usersService.generateUniqueProfileId();
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            phone: normalizedPhone,
            isPhoneVerified: true,
            passwordHash: null,
            status: 'DRAFT',
            role: 'USER',
            profileId,
          },
        });

        const newProfile = await tx.profile.create({
          data: {
            userId: newUser.id,
            onboardingStep: 1,
            category: 'Marriage',
            profileFor: 'Myself',
          },
        });

        return { ...newUser, profile: newProfile };
      });
    }

    const tokens = await this.getTokens(user.id, user.email || '', user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        role: user.role,
        status: user.status,
        isPhoneVerified: user.isPhoneVerified,
        profileId: user.profileId,
      },
      profile: user.profile
        ? {
            id: user.profile.id,
            firstName: user.profile.firstName || user.firstName || 'User',
            lastName: user.profile.lastName || user.lastName || '',
            gender: user.profile.gender,
            profileFor: user.profile.profileFor || user.profile.category || 'Marriage',
            category: user.profile.category,
            onboardingStep: user.profile.onboardingStep,
          }
        : undefined,
    };
  }

  async verifyRegistration(dto: VerifyRegistrationDto) {
    const code = (dto.phoneOtp || dto.otp || '').trim();
    const result = await this.verifyOtp({ phone: dto.phone, otp: code }, true);

    if (dto.email && result.user) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          id: { not: result.user.id },
        },
      });
      if (existing) {
        throw new ConflictException('This email is already associated with another account');
      }
      if (!result.user.email) {
        await this.prisma.user.update({
          where: { id: result.user.id },
          data: { email: normalizedEmail },
        });
        result.user.email = normalizedEmail;
      }
    }

    return result;
  }

  async login(dto: LoginDto) {
    const rawIdentifier = (dto.identifier || dto.email || dto.phone || '').trim();
    if (!rawIdentifier) {
      throw new BadRequestException('Email or phone number is required');
    }

    let user;
    if (rawIdentifier.includes('@')) {
      user = await this.usersService.findByEmail(rawIdentifier.toLowerCase());
    } else {
      const normalizedPhone = normalizePhoneNumber(rawIdentifier);
      if (!normalizedPhone) {
        throw new UnauthorizedException('Invalid credentials');
      }
      user = await this.usersService.findByPhone(normalizedPhone);
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.passwordHash === null || user.passwordHash === undefined) {
      throw new BadRequestException(
        'This account was registered via Mobile OTP and does not have a password set. Please sign in using the Mobile OTP tab.',
      );
    }

    if (user.isBanned) {
      throw new ForbiddenException('Your account has been banned');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is suspended');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.getTokens(user.id, user.email || '', user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    const { passwordHash: _, hashedRefreshToken: __, ...result } = user;

    return {
      success: true,
      ...tokens,
      user: result,
    };
  }

  async setPassword(userId: string, dto: SetPasswordDto) {
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  async logout(userId: string) {
    await this.usersService.clearRefreshToken(userId);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access Denied');
    }

    const refreshTokenMatches = await argon2.verify(user.hashedRefreshToken, refreshToken);
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Access Denied');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }
}
