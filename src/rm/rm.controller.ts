import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RmService } from './rm.service';
import { RmUserQueryDto } from './dto/rm-user-query.dto';
import { RmFeedbackQueryDto } from './dto/rm-feedback-query.dto';
import { UpdateRmFeedbackDto } from './dto/update-rm-feedback.dto';
import {
  CreateShortlistDto,
  CreateInteractionDto,
  CreateFollowUpDto,
  UpdateFollowUpDto,
  UpdateClientStageDto,
  RmCandidateSearchQueryDto,
  RmFollowUpQueryDto,
} from './dto/rm-workflow.dto';

@ApiTags('Relationship Manager')
@ApiBearerAuth('JWT-auth')
@Controller('rm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RM', 'ADMIN')
export class RmController {
  constructor(private readonly rmService: RmService) {}

  // ==========================================
  // RM Dashboard & Client Portfolio
  // ==========================================

  @Get('dashboard')
  @ApiOperation({ summary: 'Get RM dashboard metrics, stats, and agenda' })
  async getDashboard(@CurrentUser() user: any) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.getRmDashboard(rmId, isAdmin);
  }

  @Get('my-clients')
  @ApiOperation({ summary: 'List assigned clients for the logged-in Relationship Manager' })
  async getMyClients(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('stage') stage?: string,
    @Query('tier') tier?: string,
    @CurrentUser() user?: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.getMyClients(
      rmId,
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        search,
        stage,
        tier,
      },
      isAdmin,
    );
  }

  @Patch('clients/:id/stage')
  @ApiOperation({ summary: 'Update client progression stage' })
  async updateClientStage(
    @Param('id') clientId: string,
    @Body() dto: UpdateClientStageDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.updateClientStage(clientId, dto.clientStage, rmId, isAdmin);
  }

  // ==========================================
  // Shortlists on Behalf of Clients
  // ==========================================

  @Get('clients/:id/shortlists')
  @ApiOperation({ summary: 'List profiles shortlisted on behalf of client' })
  async getShortlistsForClient(
    @Param('id') clientId: string,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.getShortlistsForClient(clientId, rmId, isAdmin);
  }

  @Post('clients/:id/shortlists')
  @ApiOperation({ summary: 'Shortlist a candidate profile on behalf of client' })
  async createShortlist(
    @Param('id') clientId: string,
    @Body() dto: CreateShortlistDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.createShortlist(clientId, dto, rmId, isAdmin);
  }

  @Delete('clients/:id/shortlists/:candidateId')
  @ApiOperation({ summary: 'Remove a candidate profile from client shortlist' })
  async deleteShortlist(
    @Param('id') clientId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.deleteShortlist(clientId, candidateId, rmId, isAdmin);
  }

  @Get('clients/:id/candidates')
  @ApiOperation({ summary: 'Search and browse match candidates for a specific client' })
  async searchCandidates(
    @Param('id') clientId: string,
    @Query() query: RmCandidateSearchQueryDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.searchCandidateProfiles(clientId, query, rmId, isAdmin);
  }

  // ==========================================
  // Client Interaction Tracking
  // ==========================================

  @Get('clients/:id/interactions')
  @ApiOperation({ summary: 'Get interaction history for a client' })
  async getInteractions(
    @Param('id') clientId: string,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.getInteractions(clientId, rmId, isAdmin);
  }

  @Post('clients/:id/interactions')
  @ApiOperation({ summary: 'Record a new client interaction' })
  async createInteraction(
    @Param('id') clientId: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.createInteraction(clientId, dto, rmId, isAdmin);
  }

  // ==========================================
  // Follow-Up Reminders & Scheduling
  // ==========================================

  @Get('follow-ups')
  @ApiOperation({ summary: 'List follow-ups (today, upcoming, overdue, all)' })
  async getFollowUps(
    @Query() query: RmFollowUpQueryDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.getFollowUps(rmId, query, isAdmin);
  }

  @Post('clients/:id/follow-ups')
  @ApiOperation({ summary: 'Schedule a new follow-up for a client' })
  async createFollowUp(
    @Param('id') clientId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.createFollowUp(clientId, dto, rmId, isAdmin);
  }

  @Patch('follow-ups/:id')
  @ApiOperation({ summary: 'Update, complete, or reschedule a follow-up' })
  async updateFollowUp(
    @Param('id') followUpId: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: any,
  ) {
    const rmId = user?.sub || user?.id;
    const isAdmin = user?.role === 'ADMIN';
    return this.rmService.updateFollowUp(followUpId, dto, rmId, isAdmin);
  }

  // ==========================================
  // Existing Directory & Feedback Endpoints
  // ==========================================

  @Get('users')
  @ApiOperation({ summary: 'List categorized users for RM directory (read-only)' })
  async getUsers(@Query() query: RmUserQueryDto) {
    return this.rmService.getUsers(query);
  }

  @Get('users/stats')
  @ApiOperation({ summary: 'Get user counts by category and verification status for RM portal' })
  async getUserStats() {
    return this.rmService.getUserStats();
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get full user profile and metadata for RM directory (read-only)' })
  async getUserDetail(@Param('id') id: string) {
    return this.rmService.getUserDetail(id);
  }

  @Get('feedback')
  @ApiOperation({ summary: 'List user feedback, feature suggestions, and bug reports' })
  async getFeedback(@Query() query: RmFeedbackQueryDto) {
    return this.rmService.getFeedback(query);
  }

  @Get('feedback/stats')
  @ApiOperation({ summary: 'Get summary counts and average rating for feedback & issues' })
  async getFeedbackStats() {
    return this.rmService.getFeedbackStats();
  }

  @Patch('feedback/:id')
  @ApiOperation({ summary: 'Triage user feedback or bug report (status, priority, RM notes)' })
  async updateFeedback(
    @Param('id') id: string,
    @Body() dto: UpdateRmFeedbackDto,
    @CurrentUser() user: any,
  ) {
    const reviewerId = user?.sub || user?.id;
    return this.rmService.updateFeedback(id, dto, reviewerId);
  }
}


