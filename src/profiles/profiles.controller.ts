import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { MediaService } from '../media/media.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Profiles')
@ApiBearerAuth('JWT-auth')
@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('me')
  async getMyProfile(@CurrentUser() user: any) {
    return this.profilesService.getProfile(user.sub);
  }

  @Get(':id')
  async getPublicProfile(@Param('id') id: string) {
    return this.profilesService.getPublicProfile(id);
  }

  @Put('me')
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(user.sub, updateProfileDto);
  }

  @Put('me/preferences')
  async updateMyPreferences(
    @CurrentUser() user: any,
    @Body() updatePreferencesDto: UpdatePreferencesDto,
  ) {
    return this.profilesService.updatePreferences(user.sub, updatePreferencesDto);
  }

  @Put('me/photos/:id/primary')
  async setMyPrimaryPhoto(
    @CurrentUser() user: any,
    @Param('id') photoId: string,
  ) {
    return this.mediaService.setPrimaryPhoto(user.sub, photoId);
  }

  @Delete('me/photos/:id')
  async deleteMyPhoto(
    @CurrentUser() user: any,
    @Param('id') photoId: string,
  ) {
    return this.mediaService.deletePhoto(user.sub, photoId);
  }

  @Put(':id')
  async updateProfile(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    if (id !== user.sub && user.role !== 'ADMIN') {
      throw new ForbiddenException('You do not have permission to update this profile');
    }
    return this.profilesService.updateProfile(id, updateProfileDto);
  }

  @Put(':id/preferences')
  async updatePreferences(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updatePreferencesDto: UpdatePreferencesDto,
  ) {
    if (id !== user.sub && user.role !== 'ADMIN') {
      throw new ForbiddenException('You do not have permission to update these preferences');
    }
    return this.profilesService.updatePreferences(id, updatePreferencesDto);
  }
}
