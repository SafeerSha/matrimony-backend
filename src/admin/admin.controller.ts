import { Controller, Get, Post, Put, Patch, Delete, Param, UseGuards, Query, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsQueryDto, AnalyticsTimeSeriesQueryDto } from './dto/analytics-query.dto';
import {
  AdminUserQueryDto,
  CreateAdminUserDto,
  UpdateStatusBodyDto,
  UpdateTierBodyDto,
  VerifyPhotoBodyDto,
  AssignPlanBodyDto,
  AdminResetPasswordDto,
  AdminUpdateUserDto,
} from './dto/user-query.dto';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { UpdateCoolingPeriodSettingDto } from './dto/platform-setting.dto';
import {
  PhotoModerationQueryDto,
  BatchVerifyPhotoDto,
  RejectProfileDto,
  PendingProfileQueryDto,
  AssignClientsToRmDto,
  UnassignClientsDto,
} from './dto/moderation.dto';
import { SubscriptionService } from '../subscription/subscription.service';
import { ApiOperation } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly analyticsService: AnalyticsService,
    private readonly subscriptionService: SubscriptionService,
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

  @Post('users')
  @ApiOperation({ summary: 'Create a normal (USER) or Relationship Manager (RM) account' })
  async createUser(@Body() body: CreateAdminUserDto) {
    return this.adminService.createUser(body);
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
  @ApiOperation({ summary: 'Purge / permanently delete a user account' })
  async purgeUser(@Param('id') userId: string) {
    return this.adminService.purgeUser(userId);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Permanently delete a user or Relationship Manager account' })
  async deleteUser(@Param('id') userId: string) {
    return this.adminService.purgeUser(userId);
  }

  @Post('users/:id/reset-password')
  @ApiOperation({ summary: 'Reset password for a user or Relationship Manager' })
  async resetUserPassword(
    @Param('id') userId: string,
    @Body() body: AdminResetPasswordDto,
  ) {
    return this.adminService.resetUserPassword(userId, body.password);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user or Relationship Manager profile details' })
  async updateUser(
    @Param('id') userId: string,
    @Body() body: AdminUpdateUserDto,
  ) {
    return this.adminService.updateUser(userId, body);
  }

  @Post('users/:id/ban')
  @Roles('ADMIN', 'RM')
  async banUser(@Param('id') userId: string) {
    return this.adminService.banUser(userId);
  }

  @Post('users/:id/unban')
  @Roles('ADMIN', 'RM')
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

  @Post('users/:id/assign-plan')
  @ApiOperation({ summary: 'Manually assign or revoke user subscription plan' })
  async assignUserPlan(
    @Param('id') userId: string,
    @Body() body: AssignPlanBodyDto,
  ) {
    return this.adminService.assignUserPlan(userId, body);
  }

  @Post('photos/:id/verify')
  async verifyPhoto(
    @Param('id') photoId: string,
    @Body() body: VerifyPhotoBodyDto,
  ) {
    return this.adminService.verifyPhoto(photoId, body.status);
  }

  // ==========================================
  // Plan Configuration Module Endpoints
  // ==========================================

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans for admin configuration' })
  async getPlans() {
    return this.subscriptionService.getAllPlansAdmin();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a new subscription plan' })
  async createPlan(@Body() body: CreatePlanDto) {
    return this.subscriptionService.createPlan(body);
  }

  @Put('plans/:id')
  @ApiOperation({ summary: 'Update an existing subscription plan' })
  async updatePlan(
    @Param('id') id: string,
    @Body() body: UpdatePlanDto,
  ) {
    return this.subscriptionService.updatePlan(id, body);
  }

  @Patch('plans/:id/toggle-active')
  @ApiOperation({ summary: 'Toggle active status of a plan' })
  async togglePlanActive(@Param('id') id: string) {
    return this.subscriptionService.togglePlanActive(id);
  }

  @Patch('plans/:id/toggle-popular')
  @ApiOperation({ summary: 'Set or toggle plan as the single most popular plan' })
  async togglePlanPopular(@Param('id') id: string) {
    return this.subscriptionService.togglePlanPopular(id);
  }

  @Delete('plans/:id')
  @ApiOperation({ summary: 'Delete a subscription plan' })
  async deletePlan(@Param('id') id: string) {
    return this.subscriptionService.deletePlan(id);
  }

  // ==========================================
  // Platform Settings Endpoints
  // ==========================================

  @Get('settings/cooling-period')
  @ApiOperation({ summary: 'Get current user deletion cooling-off period platform configuration' })
  async getCoolingPeriodSetting() {
    return this.adminService.getCoolingPeriodSetting();
  }

  @Patch('settings/cooling-period')
  @ApiOperation({ summary: 'Update user deletion cooling-off period platform configuration (turn on/off)' })
  async updateCoolingPeriodSetting(
    @Body() body: UpdateCoolingPeriodSettingDto,
    @CurrentUser() user: any,
  ) {
    return this.adminService.updateCoolingPeriodSetting(body, user?.id);
  }

  // ==========================================
  // Image Moderation Endpoints
  // ==========================================

  @Get('photos/moderation')
  @ApiOperation({ summary: 'List photos for moderation queue (unverified, verified, all)' })
  async getPhotosForModeration(@Query() query: PhotoModerationQueryDto) {
    return this.adminService.getPhotosForModeration(query);
  }

  @Post('photos/batch-verify')
  @ApiOperation({ summary: 'Batch approve or reject photos in moderation queue' })
  async batchVerifyPhotos(@Body() body: BatchVerifyPhotoDto) {
    return this.adminService.batchVerifyPhotos(body.photoIds, body.status);
  }

  // ==========================================
  // Profile Approval & Moderation Endpoints
  // ==========================================

  @Get('profiles/pending')
  @ApiOperation({ summary: 'List pending or unverified member profiles awaiting approval' })
  async getPendingProfiles(@Query() query: PendingProfileQueryDto) {
    return this.adminService.getPendingProfiles(query);
  }

  @Post('profiles/:id/approve')
  @ApiOperation({ summary: 'Approve a member profile to active status' })
  async approveProfile(@Param('id') userId: string) {
    return this.adminService.approveProfile(userId);
  }

  @Post('profiles/:id/reject')
  @ApiOperation({ summary: 'Reject a member profile with detailed reason' })
  async rejectProfile(
    @Param('id') userId: string,
    @Body() body: RejectProfileDto,
  ) {
    return this.adminService.rejectProfile(userId, body.reason);
  }

  // ==========================================
  // Relationship Manager (RM) Management Endpoints
  // ==========================================

  @Get('rms')
  @ApiOperation({ summary: 'List all Relationship Managers with active client stats' })
  async getRelationshipManagers() {
    return this.adminService.getRelationshipManagers();
  }

  @Get('rms/:id/clients')
  @ApiOperation({ summary: 'List all clients assigned to a specific Relationship Manager' })
  async getRmClients(@Param('id') rmId: string) {
    return this.adminService.getRmClients(rmId);
  }

  @Post('rms/assign')
  @ApiOperation({ summary: 'Assign clients to a Relationship Manager' })
  async assignClientsToRm(
    @Body() body: AssignClientsToRmDto,
    @CurrentUser() user: any,
  ) {
    return this.adminService.assignClientsToRm(body.rmId, body.clientUserIds, user?.id);
  }

  @Post('rms/unassign')
  @ApiOperation({ summary: 'Unassign clients from their Relationship Manager' })
  async unassignClientsFromRm(@Body() body: UnassignClientsDto) {
    return this.adminService.unassignClientsFromRm(body.clientUserIds);
  }
}
