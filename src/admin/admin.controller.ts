import { Controller, Get, Post, Param, UseGuards, Query, Body, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.adminService.getUsers(pageNum, limitNum);
  }

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Post('users/:id/ban')
  async banUser(@Param('id') userId: string) {
    return this.adminService.banUser(userId);
  }

  @Post('photos/:id/verify')
  async verifyPhoto(
    @Param('id') photoId: string,
    @Body() body: { status: string },
  ) {
    if (body.status !== 'approved' && body.status !== 'rejected') {
      throw new BadRequestException('Status must be approved or rejected');
    }
    return this.adminService.verifyPhoto(photoId, body.status as 'approved' | 'rejected');
  }
}
