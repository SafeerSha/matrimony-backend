import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RmService } from './rm.service';
import { RmUserQueryDto } from './dto/rm-user-query.dto';
import { RmFeedbackQueryDto } from './dto/rm-feedback-query.dto';
import { UpdateRmFeedbackDto } from './dto/update-rm-feedback.dto';

@ApiTags('Relationship Manager')
@ApiBearerAuth('JWT-auth')
@Controller('rm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RM', 'ADMIN')
export class RmController {
  constructor(private readonly rmService: RmService) {}

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

