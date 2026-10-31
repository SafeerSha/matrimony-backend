import { Controller, Get, Post, Patch, Param, UseGuards, Query, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsQueryDto, AnalyticsTimeSeriesQueryDto } from './dto/analytics-query.dto';
import { AdminUserQueryDto, UpdateStatusBodyDto, UpdateTierBodyDto, VerifyPhotoBodyDto } from './dto/user-query.dto';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('analytics/overview')
  async getAnalyticsOverview(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.analyticsService.getOverview(query, user?.role || 'ADMIN');
  }

  @Get('analytics/timeseries')
  async getAnalyticsTimeSeries(
    @Query() query: AnalyticsTimeSeriesQueryDto,
  ) {
    return this.analyticsService.getTimeSeries(query);
  }

  @Get('users')
  async getUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.getUsers(query);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Post('users/:id/reactivate')
  async reactivateUser(@Param('id') userId: string) {
    return this.adminService.reactivateUser(userId);
  }

  @Post('users/:id/restore')
  async restoreUser(@Param('id') userId: string) {
    return this.adminService.restoreUser(userId);
  }

  @Post('users/:id/purge')
  async purgeUser(@Param('id') userId: string) {
    return this.adminService.purgeUser(userId);
  }

  @Post('users/:id/ban')
  async banUser(@Param('id') userId: string) {
    return this.adminService.banUser(userId);
  }

  @Post('users/:id/unban')
  async unbanUser(@Param('id') userId: string) {
    return this.adminService.unbanUser(userId);
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') userId: string,
    @Body() body: UpdateStatusBodyDto,
  ) {
    return this.adminService.updateUserStatus(userId, body.status);
  }

  @Patch('users/:id/tier')
  async updateSubscriptionTier(
    @Param('id') userId: string,
    @Body() body: UpdateTierBodyDto,
  ) {
    return this.adminService.updateSubscriptionTier(userId, body.tier);
  }

  @Post('photos/:id/verify')
  async verifyPhoto(
    @Param('id') photoId: string,
    @Body() body: VerifyPhotoBodyDto,
  ) {
    return this.adminService.verifyPhoto(photoId, body.status);
  }
}
