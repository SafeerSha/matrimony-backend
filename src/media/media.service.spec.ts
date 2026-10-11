import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';

jest.mock('fs');

describe('MediaService', () => {
  let service: MediaService;
  let prisma: PrismaService;

  const mockPrisma: any = {
    photo: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((callback: any): any => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.all(callback);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadPhoto', () => {
    it('should upload a photo and mark primary if it is the first one', async () => {
      mockPrisma.photo.count.mockResolvedValue(0);
      mockPrisma.photo.create.mockResolvedValue({ id: 'p1', isPrimary: true });

      const file = { filename: 'test.jpg' } as any;
      const result = await service.uploadPhoto('1', file);

      expect(result.isPrimary).toBe(true);
      expect(prisma.photo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPrimary: true, url: '/uploads/test.jpg' }),
        }),
      );
    });

    it('should throw BadRequestException if user already has 5 photos', async () => {
      mockPrisma.photo.count.mockResolvedValue(5);
      const file = { filename: 'test.jpg', path: 'uploads/test.jpg' } as any;
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(service.uploadPhoto('1', file)).rejects.toThrow(BadRequestException);
    });
  });

  describe('uploadMultiplePhotos', () => {
    it('should upload multiple photos within limit', async () => {
      mockPrisma.photo.count.mockResolvedValue(1);
      mockPrisma.photo.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'new-p', ...data }),
      );

      const files = [{ filename: 'p1.jpg' }, { filename: 'p2.jpg' }] as any[];
      const result = await service.uploadMultiplePhotos('1', files);

      expect(result).toHaveLength(2);
      expect(mockPrisma.photo.create).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException if total exceeds 5 photos', async () => {
      mockPrisma.photo.count.mockResolvedValue(4);
      const files = [{ filename: 'p1.jpg' }, { filename: 'p2.jpg' }] as any[];

      await expect(service.uploadMultiplePhotos('1', files)).rejects.toThrow(BadRequestException);
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
      await expect(service.setPrimaryPhoto('1', 'unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deletePhoto', () => {
    it('should delete a photo physically and from DB', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1', userId: '1', url: '/uploads/test.jpg', isPrimary: false });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = await service.deletePhoto('1', 'p1');
      expect(result.success).toBe(true);
      expect(prisma.photo.delete).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should promote remaining photo to primary if deleted photo was primary', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1', userId: '1', url: '/uploads/test.jpg', isPrimary: true });
      mockPrisma.photo.findFirst.mockResolvedValue({ id: 'p2', userId: '1' });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await service.deletePhoto('1', 'p1');
      expect(mockPrisma.photo.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: { isPrimary: true },
      });
    });

    it('should throw NotFoundException if photo does not belong to user', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1', userId: '2', url: '/uploads/test.jpg' });
      await expect(service.deletePhoto('1', 'p1')).rejects.toThrow(NotFoundException);
    });
  });
});
