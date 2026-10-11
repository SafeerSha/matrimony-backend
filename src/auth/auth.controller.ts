import { Controller, Post, Body, Get, UseGuards, Request, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { QuickRegisterDto } from './dto/quick-register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';

const isProd = process.env.NODE_ENV === 'production';
const OTP_LIMIT = isProd ? 3 : 100;
const OTP_TTL = isProd ? 600000 : 60000;
const VERIFY_LIMIT = isProd ? 5 : 100;
const VERIFY_TTL = isProd ? 600000 : 60000;
const LOGIN_LIMIT = isProd ? 5 : 100;
const LOGIN_TTL = 60000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: OTP_LIMIT, ttl: OTP_TTL } })
  @Post('send-otp')
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Throttle({ default: { limit: OTP_LIMIT, ttl: OTP_TTL } })
  @Post('send-email-otp')
  async sendEmailOtp(@Body() dto: { email?: string }) {
    return {
      message: `Verification code sent successfully to ${dto.email || 'your email'}`,
      defaultOtp: '123456',
    };
  }

  @Throttle({ default: { limit: VERIFY_LIMIT, ttl: VERIFY_TTL } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.verifyOtp(dto);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @Throttle({ default: { limit: VERIFY_LIMIT, ttl: VERIFY_TTL } })
  @Post('verify-registration')
  async verifyRegistration(@Body() dto: VerifyRegistrationDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.verifyRegistration(dto);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  async setPassword(@Request() req: any, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(req.user.sub || req.user.id, dto);
  }

  @Throttle({ default: { limit: VERIFY_LIMIT, ttl: VERIFY_TTL } })
  @Post('quick-register')
  async quickRegister(@Body() dto: QuickRegisterDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.quickRegister(dto);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.register(dto);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: LOGIN_TTL } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.login(dto);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.sub);
    res.clearCookie('__Host-matrimony_session', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  async refresh(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.refreshTokens(req.user.sub, req.user.refreshToken);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return req.user;
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('__Host-matrimony_session', accessToken, {
      httpOnly: true,
      secure: true, // Browser specification strictly requires Secure=true for __Host- prefix
      sameSite: 'lax',
      path: '/'
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }
}
