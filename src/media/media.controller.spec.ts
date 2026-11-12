import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockUnlink = jest.fn<any>().mockResolvedValue(undefined);
const mockMkdir = jest.fn<any>().mockResolvedValue(undefined);

jest.unstable_mockModule('fs/promises', () => ({
  unlink: mockUnlink,
  mkdir: mockMkdir,
}));

jest.unstable_mockModule('file-type', () => ({
  fromFile: jest.fn((filePath: string) => {
    if (String(filePath).includes('invalid')) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ mime: 'image/jpeg', ext: 'jpg' });
  }),
  fromBuffer: jest.fn((buffer: Buffer) => {
    if (buffer.toString().includes('invalid')) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ mime: 'image/jpeg', ext: 'jpg' });
  }),
}));

jest.unstable_mockModule('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get() {
      return undefined;
    }
  },
}));

const { MediaController } = await import('./media.controller');
const { MediaService } = await import('./media.service');

describe('MediaController', () => {
  let controller: InstanceType<typeof MediaController>;

  const mockMediaService = {
    uploadPhoto: jest.fn<any>(),
    uploadMultiplePhotos: jest.fn<any>(),
    setPrimaryPhoto: jest.fn<any>(),
    replacePhoto: jest.fn<any>(),
    deletePhoto: jest.fn<any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mockMediaService }],
    }).compile();

    controller = module.get(MediaController);
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

    it('should throw BadRequestException and remove temp file if magic bytes are invalid', async () => {
      const invalidFile = {
        path: '/tmp/invalid-photo.jpg',
        buffer: Buffer.from('invalid file contents'),
      } as Express.Multer.File;

      await expect(
        controller.uploadPhoto({ sub: 'user-1' }, invalidFile),
      ).rejects.toThrow('Invalid file type detected by magic bytes!');
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/invalid-photo.jpg');
    });

    it('should await uploadPhoto before cleaning up temp file on valid file', async () => {
      const order: string[] = [];
      const validFile = {
        path: '/tmp/valid-photo.jpg',
        buffer: Buffer.from('valid jpeg content'),
      } as Express.Multer.File;

      mockMediaService.uploadPhoto.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('upload_done');
        return { id: 'photo-1' };
      });
      mockUnlink.mockImplementation(async () => {
        order.push('unlink_done');
      });

      const result = await controller.uploadPhoto(
        { sub: 'user-1' },
        validFile,
      );

      expect(result).toEqual({ id: 'photo-1' });
      expect(mockMediaService.uploadPhoto).toHaveBeenCalledWith(
        'user-1',
        validFile,
      );
      expect(order).toEqual(['upload_done', 'unlink_done']);
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
        { path: '/tmp/valid-1.jpg', buffer: Buffer.from('valid content') },
        { path: '/tmp/invalid-2.jpg', buffer: Buffer.from('invalid content') },
      ] as Express.Multer.File[];

      await expect(
        controller.uploadMultiplePhotos({ sub: 'user-1' }, files),
      ).rejects.toThrow(
        'Invalid file type detected by magic bytes in one or more uploaded files!',
      );
      expect(mockUnlink).toHaveBeenCalledTimes(2);
    });

    it('should call mediaService.uploadMultiplePhotos when all valid', async () => {
      const files = [
        { path: '/tmp/valid-1.jpg', buffer: Buffer.from('valid 1') },
        { path: '/tmp/valid-2.jpg', buffer: Buffer.from('valid 2') },
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
      expect(mockUnlink).toHaveBeenCalledTimes(2);
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
