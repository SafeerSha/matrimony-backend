import { Test, TestingModule } from '@nestjs/testing';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';

jest.mock('fs');

describe('MediaService', () => {
  let service: MediaService;
  let prisma: PrismaService;

  const mockPrisma = {
    photo: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
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
      expect(prisma.photo.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ isPrimary: true, url: '/uploads/test.jpg' })
      }));
    });
  });

  describe('deletePhoto', () => {
    it('should delete a photo physically and from DB', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1', userId: '1', url: '/uploads/test.jpg' });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = await service.deletePhoto('1', 'p1');
      expect(result.success).toBe(true);
      expect(prisma.photo.delete).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should throw NotFoundException if photo does not belong to user', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({ id: 'p1', userId: '2', url: '/uploads/test.jpg' });
      await expect(service.deletePhoto('1', 'p1')).rejects.toThrow(NotFoundException);
    });
  });
});
