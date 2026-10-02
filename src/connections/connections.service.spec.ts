import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionsService } from './connections.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    connection: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockNotifications = {
    createNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ConnectionsService>(ConnectionsService);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendInterest', () => {
    it('should throw BadRequestException if sender is receiver', async () => {
      await expect(service.sendInterest('1', '1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if receiver not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.sendInterest('1', '2')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if connection already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '2' });
      mockPrisma.connection.findFirst.mockResolvedValue({ id: 'c1' });
      await expect(service.sendInterest('1', '2')).rejects.toThrow(BadRequestException);
    });

    it('should create connection and notification', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '2' });
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      mockPrisma.connection.create.mockResolvedValue({ id: 'c1' });

      const result = await service.sendInterest('1', '2');
      
      expect(result).toEqual({ id: 'c1' });
      expect(mockNotifications.createNotification).toHaveBeenCalledWith('2', 'NEW_INTEREST', expect.any(String), '1');
    });
  });

  describe('acceptInterest', () => {
    it('should accept interest and notify', async () => {
      const connection = { id: 'c1', senderId: '1', receiverId: '2' };
      mockPrisma.connection.findUnique.mockResolvedValue(connection);
      mockPrisma.connection.update.mockResolvedValue({ ...connection, status: 'ACCEPTED' });

      const result = await service.acceptInterest('2', '1');
      expect(result.status).toBe('ACCEPTED');
      expect(mockNotifications.createNotification).toHaveBeenCalledWith('1', 'MATCH_ACCEPTED', expect.any(String), '2');
    });
  });
});
