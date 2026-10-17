import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { BadRequestException } from '@nestjs/common';

jest.mock('file-type', () => ({
  fromBuffer: jest.fn((buffer: Buffer) => {
    if (buffer.toString().includes('invalid')) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ mime: 'image/jpeg', ext: 'jpg' });
  }),
}));

describe('MediaController', () => {
  let controller: MediaController;
  let mediaService: MediaService;

  const mockMediaService = {
    uploadPhoto: jest.fn(),
    uploadMultiplePhotos: jest.fn(),
    setPrimaryPhoto: jest.fn(),
    deletePhoto: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mockMediaService }],
    }).compile();

    controller = module.get<MediaController>(MediaController);
    mediaService = module.get<MediaService>(MediaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadPhoto', () => {
    it('should throw BadRequestException if no file uploaded', async () => {
      await expect(
        controller.uploadPhoto({ sub: 'user-1' }, null as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if magic bytes are invalid', async () => {
      const invalidFile = {
        buffer: Buffer.from('invalid file contents'),
      } as Express.Multer.File;

      await expect(
        controller.uploadPhoto({ sub: 'user-1' }, invalidFile),
      ).rejects.toThrow('Invalid file type detected by magic bytes!');
    });

    it('should call mediaService.uploadPhoto on valid file', async () => {
      const validFile = {
        buffer: Buffer.from('valid jpeg content'),
      } as Express.Multer.File;

      mockMediaService.uploadPhoto.mockResolvedValue({ id: 'photo-1' });

      const result = await controller.uploadPhoto(
        { sub: 'user-1' },
        validFile,
      );

      expect(result).toEqual({ id: 'photo-1' });
      expect(mockMediaService.uploadPhoto).toHaveBeenCalledWith(
        'user-1',
        validFile,
      );
    });
  });

  describe('uploadMultiplePhotos', () => {
    it('should throw BadRequestException if empty files array', async () => {
      await expect(
        controller.uploadMultiplePhotos({ sub: 'user-1' }, []),
      ).rejects.toThrow('No files uploaded');
    });

    it('should throw BadRequestException if any file fails magic bytes', async () => {
      const files = [
        { buffer: Buffer.from('valid content') },
        { buffer: Buffer.from('invalid content') },
      ] as Express.Multer.File[];

      await expect(
        controller.uploadMultiplePhotos({ sub: 'user-1' }, files),
      ).rejects.toThrow(
        'Invalid file type detected by magic bytes in one or more uploaded files!',
      );
    });

    it('should call mediaService.uploadMultiplePhotos when all valid', async () => {
      const files = [
        { buffer: Buffer.from('valid 1') },
        { buffer: Buffer.from('valid 2') },
      ] as Express.Multer.File[];

      mockMediaService.uploadMultiplePhotos.mockResolvedValue([
        { id: 'p1' },
        { id: 'p2' },
      ]);

      const result = await controller.uploadMultiplePhotos(
        { sub: 'user-1' },
        files,
      );

      expect(result).toEqual([{ id: 'p1' }, { id: 'p2' }]);
      expect(mockMediaService.uploadMultiplePhotos).toHaveBeenCalledWith(
        'user-1',
        files,
      );
    });
  });

  describe('setPrimaryPhoto', () => {
    it('should call mediaService.setPrimaryPhoto on PUT', async () => {
      mockMediaService.setPrimaryPhoto.mockResolvedValue({ id: 'p1', isPrimary: true });
      const result = await controller.setPrimaryPhotoPut({ sub: 'user-1' }, 'p1');
      expect(result).toEqual({ id: 'p1', isPrimary: true });
      expect(mockMediaService.setPrimaryPhoto).toHaveBeenCalledWith('user-1', 'p1');
    });

    it('should call mediaService.setPrimaryPhoto on PATCH', async () => {
      mockMediaService.setPrimaryPhoto.mockResolvedValue({ id: 'p1', isPrimary: true });
      const result = await controller.setPrimaryPhotoPatch({ sub: 'user-1' }, 'p1');
      expect(result).toEqual({ id: 'p1', isPrimary: true });
      expect(mockMediaService.setPrimaryPhoto).toHaveBeenCalledWith('user-1', 'p1');
    });
  });

  describe('deletePhoto', () => {
    it('should call mediaService.deletePhoto', async () => {
      mockMediaService.deletePhoto.mockResolvedValue({ success: true, message: 'Photo deleted successfully' });
      const result = await controller.deletePhoto({ sub: 'user-1' }, 'p1');
      expect(result.success).toBe(true);
      expect(mockMediaService.deletePhoto).toHaveBeenCalledWith('user-1', 'p1');
    });
  });
});
