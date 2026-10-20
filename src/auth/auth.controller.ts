import { Controller, Post, Body, Get, Delete, Param, UseGuards, Request, Res } from '@nestjs/common';
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
import { EnablePasswordDto } from './dto/enable-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { parseUserAgentAndHeaders, ParsedDeviceInfo } from '../common/utils/device-parser.util';

const isProd = process.env.NODE_ENV === 'production';
const OTP_LIMIT = isProd ? 5 : 100;
const OTP_TTL = isProd ? 60000 : 60000;
const VERIFY_LIMIT = isProd ? 5 : 100;
const VERIFY_TTL = isProd ? 60000 : 60000;
const LOGIN_LIMIT = isProd ? 5 : 100;
const LOGIN_TTL = 60000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractDeviceInfo(req: any): ParsedDeviceInfo {
    const userAgent = (req.headers && req.headers['user-agent']) as string | undefined;
    const clientIp = ((req.headers && req.headers['x-forwarded-for']) as string)?.split(',')[0]?.trim() || req.ip;
    const geoHeader = (req.headers && (req.headers['x-client-location'] || req.headers['cf-ipcity'] || req.headers['x-client-city'])) as string | undefined;
    return parseUserAgentAndHeaders(userAgent, clientIp, geoHeader);
  }

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
  async verifyOtp(@Request() req: any, @Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const deviceInfo = this.extractDeviceInfo(req);
    const data = await this.authService.verifyOtp(dto, false, deviceInfo);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @Throttle({ default: { limit: VERIFY_LIMIT, ttl: VERIFY_TTL } })
  @Post('verify-registration')
  async verifyRegistration(@Request() req: any, @Body() dto: VerifyRegistrationDto, @Res({ passthrough: true }) res: Response) {
    const deviceInfo = this.extractDeviceInfo(req);
    const data = await this.authService.verifyRegistration(dto, deviceInfo);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  async setPassword(@Request() req: any, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(req.user.sub || req.user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('enable-password')
  async enablePassword(@Request() req: any, @Body() dto?: EnablePasswordDto) {
    return this.authService.enablePassword(req.user.sub || req.user.id, dto);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('disable-password')
  async disablePassword(@Request() req: any) {
    return this.authService.disablePassword(req.user.sub || req.user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('password-status')
  async getPasswordStatus(@Request() req: any) {
    return this.authService.getPasswordStatus(req.user.sub || req.user.id);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('devices')
  async getDevices(@Request() req: any) {
    const deviceInfo = this.extractDeviceInfo(req);
    return this.authService.getDevices(req.user.sub || req.user.id, req.user.sessionId, deviceInfo);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('devices/logout-others')
  async logoutOtherDevices(@Request() req: any) {
    return this.authService.logoutOtherDevices(req.user.sub || req.user.id, req.user.sessionId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Delete('devices/:id')
  async removeDevice(@Request() req: any, @Param('id') deviceId: string) {
    return this.authService.removeDevice(req.user.sub || req.user.id, deviceId, req.user.sessionId);
  }

  @Throttle({ default: { limit: VERIFY_LIMIT, ttl: VERIFY_TTL } })
  @Post('quick-register')
  async quickRegister(@Request() req: any, @Body() dto: QuickRegisterDto, @Res({ passthrough: true }) res: Response) {
    const deviceInfo = this.extractDeviceInfo(req);
    const data = await this.authService.quickRegister(dto, deviceInfo);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @Post('register')
  async register(@Request() req: any, @Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const deviceInfo = this.extractDeviceInfo(req);
    const data = await this.authService.register(dto, deviceInfo);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: LOGIN_TTL } })
  @Post('login')
  async login(@Request() req: any, @Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const deviceInfo = this.extractDeviceInfo(req);
    const data = await this.authService.login(dto, deviceInfo);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.sub, req.user.sessionId);
    res.clearCookie('__Host-matrimony_session', { path: '/' });
    res.clearCookie('matrimony_session', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return { message: 'Logged out successfully' };
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  async refresh(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const data = await this.authService.refreshTokens(req.user.sub, req.user.refreshToken, req.user.sessionId);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return data;
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('heartbeat')
  async heartbeat(@Request() req: any) {
    const userId = req.user.sub || req.user.id;
    return this.authService.updatePresence(userId, req.user.sessionId);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return req.user;
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const sessionMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const refreshMaxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (isProd) {
      res.cookie('__Host-matrimony_session', accessToken, {
        httpOnly: true,
        secure: true, // Browser specification strictly requires Secure=true for __Host- prefix
        sameSite: 'lax',
        path: '/',
        maxAge: sessionMaxAge,
      });
    }

    res.cookie('matrimony_session', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionMaxAge,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshMaxAge,
    });
  }
}
