import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionsService } from './connections.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ConnectionsService', () => {
  let service: ConnectionsService;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    connection: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
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
    jest.resetAllMocks();
  });

  describe('sendInterest', () => {
    it('should throw BadRequestException if sender is receiver', async () => {
      await expect(service.sendInterest('1', '1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if receiver not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.sendInterest('1', '2')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if connection already exists in same direction', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '2' });
      mockPrisma.connection.findFirst.mockResolvedValue({ id: 'c1', senderId: '1', receiverId: '2', status: 'PENDING' });
      await expect(service.sendInterest('1', '2')).rejects.toThrow(BadRequestException);
    });

    it('should auto-accept and trigger mutual match if reverse pending connection exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '2' });
      const pendingReverse = {
        id: 'c-rev',
        senderId: '2',
        receiverId: '1',
        status: 'PENDING',
      };
      mockPrisma.connection.findFirst.mockResolvedValue(pendingReverse);
      mockPrisma.connection.update.mockResolvedValue({
        ...pendingReverse,
        status: 'ACCEPTED',
        sender: { id: '2', firstName: 'Priya' },
        receiver: { id: '1', firstName: 'John' },
      });

      const result: any = await service.sendInterest('1', '2');
      expect(result.status).toBe('ACCEPTED');
      expect(result.isMutualMatch).toBe(true);
      expect(result.partner.id).toBe('2');
      expect(mockNotifications.createNotification).toHaveBeenCalledWith('2', 'MATCH_ACCEPTED', expect.any(String), '1');
    });

    it('should create connection and notification', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '2' });
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      mockPrisma.connection.create.mockResolvedValue({ id: 'c1' });

      const result = await service.sendInterest('1', '2');
      
      expect(result).toEqual({ id: 'c1', isMutualMatch: false });
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
      expect(result.isMutualMatch).toBe(true);
      expect(mockNotifications.createNotification).toHaveBeenCalledWith('1', 'MATCH_ACCEPTED', expect.any(String), '2');
    });

    it('should throw NotFoundException if connection request does not exist', async () => {
      mockPrisma.connection.findUnique.mockResolvedValue(null);
      await expect(service.acceptInterest('2', '1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('shortlistProfile', () => {
    it('should throw BadRequestException if user shortlists themselves', async () => {
      await expect(service.shortlistProfile('u1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should upsert connection with SHORTLISTED status', async () => {
      const mockResult = { id: 'c-short', senderId: 'u1', receiverId: 'u2', status: 'SHORTLISTED' };
      mockPrisma.connection.upsert.mockResolvedValue(mockResult);

      const result = await service.shortlistProfile('u1', 'u2');
      expect(result).toEqual(mockResult);
      expect(mockPrisma.connection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { senderId_receiverId: { senderId: 'u1', receiverId: 'u2' } },
          update: { status: 'SHORTLISTED' },
          create: { senderId: 'u1', receiverId: 'u2', status: 'SHORTLISTED' },
        })
      );
    });
  });

  describe('removeShortlist', () => {
    it('should throw BadRequestException if user removes themselves', async () => {
      await expect(service.removeShortlist('u1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if shortlisted profile not found', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      await expect(service.removeShortlist('u1', 'u2')).rejects.toThrow(NotFoundException);
    });

    it('should delete connection record and return success confirmation', async () => {
      const existing = { id: 'c-short-123', senderId: 'u1', receiverId: 'u2', status: 'SHORTLISTED' };
      mockPrisma.connection.findFirst.mockResolvedValue(existing);
      mockPrisma.connection.delete.mockResolvedValue(existing);

      const result = await service.removeShortlist('u1', 'u2');
      expect(result).toEqual({
        success: true,
        message: 'Profile removed from shortlist',
        id: 'c-short-123',
        targetId: 'u2',
      });
      expect(mockPrisma.connection.delete).toHaveBeenCalledWith({
        where: { id: 'c-short-123' },
      });
    });
  });

  describe('getConnections', () => {
    it('should retrieve live mutual matches with partner mapping', async () => {
      const mockMatches = [
        {
          id: 'c1',
          senderId: 'user-me',
          receiverId: 'user-partner-1',
          status: 'ACCEPTED',
          sender: { id: 'user-me', firstName: 'Myself', lastName: 'User' },
          receiver: {
            id: 'user-partner-1',
            firstName: 'Priya',
            lastName: 'Sharma',
            photos: [{ url: 'https://img.test/priya.jpg', isPrimary: true }],
            profile: { city: 'Mumbai', occupation: 'Architect' },
          },
        },
        {
          id: 'c2',
          senderId: 'user-partner-2',
          receiverId: 'user-me',
          status: 'ACCEPTED',
          sender: {
            id: 'user-partner-2',
            firstName: 'Aarav',
            lastName: 'Patel',
            photos: [{ url: 'https://img.test/aarav.jpg', isPrimary: true }],
            profile: { city: 'Bangalore', occupation: 'Engineer' },
          },
          receiver: { id: 'user-me', firstName: 'Myself', lastName: 'User' },
        },
      ];

      mockPrisma.connection.findMany.mockResolvedValue(mockMatches);

      const result = await service.getConnections('user-me', 'matches');
      expect(result).toHaveLength(2);
      expect(result[0].partner.id).toBe('user-partner-1');
      expect(result[0].partner.firstName).toBe('Priya');
      expect(result[0].isMutualMatch).toBe(true);

      expect(result[1].partner.id).toBe('user-partner-2');
      expect(result[1].partner.firstName).toBe('Aarav');
      expect(result[1].isMutualMatch).toBe(true);
    });

    it('should retrieve shortlisted profiles with partner mapping', async () => {
      const mockShortlisted = [
        {
          id: 'c-short-1',
          senderId: 'user-me',
          receiverId: 'user-short-1',
          status: 'SHORTLISTED',
          receiver: {
            id: 'user-short-1',
            firstName: 'Kavya',
            lastName: 'Nambiar',
            profileId: 'SC-KAVY99',
            photos: [{ url: 'https://img.test/kavya.jpg', isPrimary: true }],
            profile: { city: 'Kochi', occupation: 'Teacher' },
          },
        },
      ];

      mockPrisma.connection.findMany.mockResolvedValue(mockShortlisted);

      const result = await service.getConnections('user-me', 'shortlisted');
      expect(result).toHaveLength(1);
      expect(result[0].partner.id).toBe('user-short-1');
      expect(result[0].partner.firstName).toBe('Kavya');
      expect(result[0].status).toBe('SHORTLISTED');
    });

    it('should return empty array when no mutual matches exist', async () => {
      mockPrisma.connection.findMany.mockResolvedValue([]);
      const result = await service.getConnections('user-me', 'matches');
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException on invalid type', async () => {
      await expect(service.getConnections('user-me', 'invalid' as any)).rejects.toThrow(BadRequestException);
    });
  });
});
