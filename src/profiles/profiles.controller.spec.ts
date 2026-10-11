import { Test, TestingModule } from '@nestjs/testing';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { MediaService } from '../media/media.service';
import { ForbiddenException } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let profilesService: ProfilesService;
  let mediaService: MediaService;

  const mockProfilesService = {
    getProfile: jest.fn(),
    getPublicProfile: jest.fn(),
    updateProfile: jest.fn(),
    updatePreferences: jest.fn(),
  };

  const mockMediaService = {
    setPrimaryPhoto: jest.fn(),
    deletePhoto: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: ProfilesService,
          useValue: mockProfilesService,
        },
        {
          provide: MediaService,
          useValue: mockMediaService,
        },
      ],
    }).compile();

    controller = module.get<ProfilesController>(ProfilesController);
    profilesService = module.get<ProfilesService>(ProfilesService);
    mediaService = module.get<MediaService>(MediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyProfile', () => {
    it('should return profile for current authenticated user', async () => {
      const user = { sub: 'user-1' };
      mockProfilesService.getProfile.mockResolvedValue({ id: 'p1', userId: 'user-1' });

      const result = await controller.getMyProfile(user);
      expect(result).toBeDefined();
      expect(mockProfilesService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateMyProfile', () => {
    it('should update profile for current user', async () => {
      const user = { sub: 'user-1' };
      const dto: UpdateProfileDto = { firstName: 'Alice' };
      mockProfilesService.updateProfile.mockResolvedValue({ id: 'p1', firstName: 'Alice' });

      const result = await controller.updateMyProfile(user, dto);
      expect(result).toBeDefined();
      expect(mockProfilesService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('photo actions via profiles controller', () => {
    it('should delegate set primary photo to mediaService', async () => {
      const user = { sub: 'user-1' };
      mockMediaService.setPrimaryPhoto.mockResolvedValue({ id: 'photo-1', isPrimary: true });

      const result = await controller.setMyPrimaryPhoto(user, 'photo-1');
      expect(result?.isPrimary).toBe(true);
      expect(mockMediaService.setPrimaryPhoto).toHaveBeenCalledWith('user-1', 'photo-1');
    });

    it('should delegate delete photo to mediaService', async () => {
      const user = { sub: 'user-1' };
      mockMediaService.deletePhoto.mockResolvedValue({ success: true });

      const result = await controller.deleteMyPhoto(user, 'photo-1');
      expect(result.success).toBe(true);
      expect(mockMediaService.deletePhoto).toHaveBeenCalledWith('user-1', 'photo-1');
    });
  });

  describe('updateProfile (:id)', () => {
    it('should allow user to update their own profile', async () => {
      const user = { sub: 'user-1', role: 'USER' };
      const dto: UpdateProfileDto = {
        education: 'B.Tech',
        employmentStatus: 'Private Sector',
      };
      mockProfilesService.updateProfile.mockResolvedValue({ id: 'p1', userId: 'user-1' });

      const result = await controller.updateProfile('user-1', user, dto);
      expect(result).toBeDefined();
      expect(mockProfilesService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    });

    it('should allow admin to update any user profile', async () => {
      const admin = { sub: 'admin-1', role: 'ADMIN' };
      const dto: UpdateProfileDto = { education: 'M.Tech' };
      mockProfilesService.updateProfile.mockResolvedValue({ id: 'p2', userId: 'user-2' });

      const result = await controller.updateProfile('user-2', admin, dto);
      expect(result).toBeDefined();
      expect(mockProfilesService.updateProfile).toHaveBeenCalledWith('user-2', dto);
    });

    it('should throw ForbiddenException if user tries to update another profile', async () => {
      const user = { sub: 'user-1', role: 'USER' };
      const dto: UpdateProfileDto = { education: 'B.Tech' };

      await expect(controller.updateProfile('user-2', user, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockProfilesService.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('updatePreferences (:id/preferences)', () => {
    it('should allow user to update their own preferences', async () => {
      const user = { sub: 'user-1', role: 'USER' };
      const dto: UpdatePreferencesDto = { occupations: 'Engineer', employmentStatuses: 'Private Sector' };
      mockProfilesService.updatePreferences.mockResolvedValue({ preferences: {} });

      const result = await controller.updatePreferences('user-1', user, dto);
      expect(result).toBeDefined();
      expect(mockProfilesService.updatePreferences).toHaveBeenCalledWith('user-1', dto);
    });

    it('should throw ForbiddenException if user tries to update another preferences', async () => {
      const user = { sub: 'user-1', role: 'USER' };
      const dto: UpdatePreferencesDto = { education: 'Bachelors' };

      await expect(controller.updatePreferences('user-2', user, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockProfilesService.updatePreferences).not.toHaveBeenCalled();
    });
  });
});
