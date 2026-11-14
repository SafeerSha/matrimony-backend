import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportService } from './report.service';
import {
  AdminReportQueryDto,
  BlockUserDto,
  CreateReportDto,
  UpdateReportStatusDto,
} from './dto/report.dto';

@ApiTags('Report & Block')
@ApiBearerAuth('JWT-auth')
@Controller('report')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post('block/:targetId')
  @ApiOperation({ summary: 'Block a member (peer-to-peer block)' })
  async blockUser(
    @CurrentUser() user: any,
    @Param('targetId') targetId: string,
    @Body() body: BlockUserDto,
  ) {
    return this.reportService.blockUser(user.id, targetId, body?.reason);
  }

  @Delete('block/:targetId')
  @ApiOperation({ summary: 'Unblock a previously blocked member' })
  async unblockUser(
    @CurrentUser() user: any,
    @Param('targetId') targetId: string,
  ) {
    return this.reportService.unblockUser(user.id, targetId);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'List members blocked by the current user' })
  async getBlockedUsers(@CurrentUser() user: any) {
    return this.reportService.getBlockedUsers(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RM')
  @ApiOperation({ summary: 'Admin & RM: List user reports with status and date filters' })
  async getReportsAdmin(@Query() query: AdminReportQueryDto) {
    return this.reportService.getReportsAdmin(query);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'RM')
  @ApiOperation({ summary: 'Admin & RM: Update report status and internal moderation notes' })
  async updateReportAdmin(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: UpdateReportStatusDto,
  ) {
    return this.reportService.updateReportAdmin(id, body, user.id);
  }

  @Post(':targetId')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Report a member for trust & safety review' })
  async createReport(
    @CurrentUser() user: any,
    @Param('targetId') targetId: string,
    @Body() body: CreateReportDto,
  ) {
    return this.reportService.createReport(user.id, targetId, body);
  }
}

