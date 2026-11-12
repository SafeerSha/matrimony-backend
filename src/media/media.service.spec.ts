import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.unstable_mockModule('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get() {
      return undefined;
    }
  },
}));

const { PrismaService } = await import('../prisma/prisma.service');
const { STORAGE_SERVICE } = await import('../storage/storage.service');
const { MediaService } = await import('./media.service');

describe('MediaService', () => {
  let service: InstanceType<typeof MediaService>;
  let prisma: any;
  let storageService: any;

  const mockPrisma: any = {
    photo: {
      count: jest.fn<any>(),
      create: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      delete: jest.fn<any>(),
    },
    $transaction: jest.fn((callback: any): any => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  const mockStorageService = {
    uploadFile: jest.fn<any>(),
    deleteFile: jest.fn<any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_SERVICE, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get(MediaService);
    prisma = module.get(PrismaService);
    storageService = module.get(STORAGE_SERVICE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadPhoto', () => {
    it('should upload a photo and mark primary if it is the first one', async () => {
      mockPrisma.photo.count.mockResolvedValue(0);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://media.test.com/uploads/users/1/p1.jpg',
        objectKey: 'uploads/users/1/p1.jpg',
        storageProvider: 'r2',
      });
      mockPrisma.photo.create.mockResolvedValue({
        id: 'p1',
        url: 'https://media.test.com/uploads/users/1/p1.jpg',
        objectKey: 'uploads/users/1/p1.jpg',
        storageProvider: 'r2',
        isPrimary: true,
      });

      const file = { buffer: Buffer.from('test') } as any;
      const result = await service.uploadPhoto('1', file);

      expect(result.isPrimary).toBe(true);
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(file, '1');
      expect(prisma.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPrimary: true,
            url: 'https://media.test.com/uploads/users/1/p1.jpg',
            objectKey: 'uploads/users/1/p1.jpg',
            storageProvider: 'r2',
          }),
        }),
      );
    });

    it('should throw BadRequestException if user already has 3 photos without uploading', async () => {
      mockPrisma.photo.count.mockResolvedValue(3);
      const file = { buffer: Buffer.from('test') } as any;

      await expect(service.uploadPhoto('1', file)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
    });

    it('should rollback uploaded storage object if database record creation fails', async () => {
      mockPrisma.photo.count.mockResolvedValue(0);
      mockStorageService.uploadFile.mockResolvedValue({
        url: 'https://media.test.com/uploads/users/1/p1.jpg',
        objectKey: 'uploads/users/1/p1.jpg',
        storageProvider: 'r2',
      });
      mockPrisma.photo.create.mockRejectedValue(new Error('DB connection lost'));

      const file = { buffer: Buffer.from('test') } as any;
      await expect(service.uploadPhoto('1', file)).rejects.toThrow(
        'DB connection lost',
      );

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith({
        url: 'https://media.test.com/uploads/users/1/p1.jpg',
        objectKey: 'uploads/users/1/p1.jpg',
        storageProvider: 'r2',
      });
    });
  });

  describe('uploadMultiplePhotos', () => {
    it('should upload multiple photos within limit', async () => {
      mockPrisma.photo.count.mockResolvedValue(1);
      mockStorageService.uploadFile
        .mockResolvedValueOnce({
          url: '/uploads/p1.jpg',
          objectKey: 'p1.jpg',
          storageProvider: 'local',
        })
        .mockResolvedValueOnce({
          url: '/uploads/p2.jpg',
          objectKey: 'p2.jpg',
          storageProvider: 'local',
        });
      mockPrisma.photo.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'new-p', ...data }),
      );

      const files = [
        { buffer: Buffer.from('1') },
        { buffer: Buffer.from('2') },
      ] as any[];
      const result = await service.uploadMultiplePhotos('1', files);

      expect(result).toHaveLength(2);
      expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(2);
      expect(mockPrisma.photo.create).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException if total exceeds 3 photos without uploading', async () => {
      mockPrisma.photo.count.mockResolvedValue(2);
      const files = [
        { buffer: Buffer.from('1') },
        { buffer: Buffer.from('2') },
      ] as any[];

      await expect(service.uploadMultiplePhotos('1', files)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe('setPrimaryPhoto', () => {
    it('should mark designated photo as primary and unset others', async () => {
      mockPrisma.photo.findUnique
        .mockResolvedValueOnce({ id: 'p2', userId: '1', isPrimary: false })
        .mockResolvedValueOnce({ id: 'p2', userId: '1', isPrimary: true });

      const result = await service.setPrimaryPhoto('1', 'p2');
      expect(mockPrisma.photo.updateMany).toHaveBeenCalledWith({
        where: { userId: '1' },
        data: { isPrimary: false },
      });
      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: { isPrimary: true },
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if photo not found or does not belong to user', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(null);
      await expect(service.setPrimaryPhoto('1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deletePhoto', () => {
    it('should delete an R2 photo via storageService and delete from DB', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'p1',
        userId: '1',
        url: 'https://media.test.com/uploads/users/1/p1.jpg',
        objectKey: 'uploads/users/1/p1.jpg',
        storageProvider: 'r2',
        isPrimary: false,
      });

      const result = await service.deletePhoto('1', 'p1');
      expect(result.success).toBe(true);
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith({
        url: 'https://media.test.com/uploads/users/1/p1.jpg',
        objectKey: 'uploads/users/1/p1.jpg',
        storageProvider: 'r2',
      });
    });

    it('should delete a local photo via storageService and delete from DB', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'p1',
        userId: '1',
        url: '/uploads/legacy.jpg',
        objectKey: null,
        storageProvider: 'local',
        isPrimary: false,
      });

      const result = await service.deletePhoto('1', 'p1');
      expect(result.success).toBe(true);
      expect(prisma.photo.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(mockStorageService.deleteFile).toHaveBeenCalledWith({
        url: '/uploads/legacy.jpg',
        objectKey: null,
        storageProvider: 'local',
      });
    });

    it('should promote remaining photo to primary if deleted photo was primary', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'p1',
        userId: '1',
        url: '/uploads/test.jpg',
        isPrimary: true,
        storageProvider: 'local',
      });
      mockPrisma.photo.findFirst.mockResolvedValue({ id: 'p2', userId: '1' });

      await service.deletePhoto('1', 'p1');
      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: { isPrimary: true },
      });
    });

    it('should throw NotFoundException if photo does not belong to user', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'p1',
        userId: '2',
        url: '/uploads/test.jpg',
      });
      await expect(service.deletePhoto('1', 'p1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.photo.delete).not.toHaveBeenCalled();
      expect(mockStorageService.deleteFile).not.toHaveBeenCalled();
    });
  });
});
