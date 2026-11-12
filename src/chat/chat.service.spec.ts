import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionService } from '../subscription/subscription.service';

describe('ChatService', () => {
  let service: ChatService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn<any>(),
    },
    profile: {
      findFirst: jest.fn<any>(),
    },
    connection: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>(),
    },
    message: {
      create: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>(),
      groupBy: jest.fn<any>(),
      count: jest.fn<any>(),
      updateMany: jest.fn<any>(),
    },
  };

  const mockNotifications = {
    createNotification: jest.fn<any>(),
    upsertMessageNotification: jest.fn<any>(),
    markMessageNotificationAsRead: jest.fn<any>(),
  };

  const mockSubscriptionService = {
    hasActiveChatPermit: jest.fn<any>(),
  };

  const makeMessage = (index: number, baseTimeMs = Date.UTC(2026, 0, 1, 0, 0, 0)) => {
    const ts = new Date(baseTimeMs + index * 1000);
    return {
      id: `msg-${String(index).padStart(4, '0')}`,
      senderId: index % 2 === 0 ? 'user-1' : 'user-2',
      receiverId: index % 2 === 0 ? 'user-2' : 'user-1',
      content: `Message ${index}`,
      isRead: true,
      createdAt: ts,
      updatedAt: ts,
    };
  };

  beforeEach(async () => {
    mockPrisma.message.findMany.mockReset();
    mockPrisma.message.findFirst.mockReset();
    mockPrisma.message.groupBy.mockReset();
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      isBanned: false,
      firstName: 'Test',
      lastName: 'User',
      profile: null,
    }));
    mockPrisma.profile.findFirst.mockResolvedValue(null);
    mockSubscriptionService.hasActiveChatPermit.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send a message if connection is ACCEPTED', async () => {
      mockPrisma.connection.findFirst
        .mockResolvedValueOnce(null) // not blocked
        .mockResolvedValueOnce({ id: 'c1', status: 'ACCEPTED' }); // accepted connection
      mockPrisma.message.create.mockResolvedValue({
        id: 'm1',
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'hello',
        createdAt: new Date(),
      });

      const result = await service.sendMessage('user-1', 'user-2', 'hello');

      expect(result.id).toBe('m1');
      expect(mockNotifications.upsertMessageNotification).toHaveBeenCalledWith(
        'user-2',
        'user-1',
        expect.any(String),
        'hello',
      );
    });

    it('should throw ForbiddenException if not connected and no prior history', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      mockPrisma.message.findFirst.mockResolvedValue(null);
      await expect(service.sendMessage('user-1', 'user-2', 'hello')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if senderId equals receiverId', async () => {
      await expect(service.sendMessage('user-1', 'user-1', 'hello')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if content is empty or whitespace only', async () => {
      await expect(service.sendMessage('user-1', 'user-2', '   ')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getChatHistory', () => {
    it('should return paginated chat history with default limit 50 in ascending chronological order', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null); // not blocked
      // DB returns descending order when fetching latest messages
      const m1 = makeMessage(1);
      const m2 = makeMessage(2);
      mockPrisma.message.findMany.mockResolvedValue([m2, m1]);

      const result = await service.getChatHistory('user-1', 'user-2');

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result.data).toEqual([m1, m2]);
      expect(result.meta).toEqual({
        limit: 50,
        count: 2,
        hasMore: false,
        nextCursor: null,
        prevCursor: null,
      });
    });

    it('should return empty data and metadata for an empty conversation', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await service.getChatHistory('user-1', 'user-2');

      expect(result).toEqual({
        data: [],
        meta: {
          limit: 50,
          count: 0,
          hasMore: false,
          nextCursor: null,
          prevCursor: null,
        },
      });
    });

    it('should cap page size at maximum 100 when limit exceeds 100', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      const rowsDesc = Array.from({ length: 101 }, (_, i) => makeMessage(150 - i));
      mockPrisma.message.findMany.mockResolvedValue(rowsDesc);

      const result = await service.getChatHistory('user-1', 'user-2', { limit: 500 });

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 101,
        }),
      );
      expect(result.data).toHaveLength(100);
      expect(result.data[0].id).toBe('msg-0051');
      expect(result.data[99].id).toBe('msg-0150');
      expect(result.meta).toEqual({
        limit: 100,
        count: 100,
        hasMore: true,
        nextCursor: 'msg-0051',
        prevCursor: null,
      });
    });

    it('should paginate backward with cursor and preserve chronological order', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      const cursorMsg = makeMessage(51);
      mockPrisma.message.findFirst.mockResolvedValue({
        id: cursorMsg.id,
        createdAt: cursorMsg.createdAt,
      });

      const pageDesc = Array.from({ length: 51 }, (_, i) => makeMessage(50 - i));
      mockPrisma.message.findMany.mockResolvedValue(pageDesc);

      const result = await service.getChatHistory('user-1', 'user-2', {
        cursor: 'msg-0051',
        limit: 50,
      });

      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'msg-0051',
          OR: [
            { senderId: 'user-1', receiverId: 'user-2' },
            { senderId: 'user-2', receiverId: 'user-1' },
          ],
        },
        select: { id: true, createdAt: true },
      });
      expect(result.data).toHaveLength(50);
      expect(result.data[0].id).toBe('msg-0001');
      expect(result.data[49].id).toBe('msg-0050');
      expect(result.meta).toEqual({
        limit: 50,
        count: 50,
        hasMore: true,
        nextCursor: 'msg-0001',
        prevCursor: 'msg-0050',
      });
    });

    it('should throw BadRequestException when cursor does not belong to conversation', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await expect(
        service.getChatHistory('user-1', 'user-2', { cursor: 'other-conv-msg' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when limit is less than 1 or non-integer', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);

      await expect(
        service.getChatHistory('user-1', 'user-2', { limit: 0 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getChatHistory('user-1', 'user-2', { limit: -5 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getChatHistory('user-1', 'user-2', { limit: 12.5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if users have a BLOCKED connection', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue({ id: 'c1', status: 'BLOCKED' });

      await expect(service.getChatHistory('user-1', 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should mark unread messages as read and return success: true', async () => {
      mockPrisma.message.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAsRead('user-1', 'user-2');
      expect(result).toEqual({ success: true });
      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          receiverId: 'user-1',
          senderId: 'user-2',
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });
    });
  });

  describe('getConversations', () => {
    it('should return conversations with partner profile, lastMessage, and unreadCount', async () => {
      const mockConnections = [
        {
          id: 'conn-1',
          senderId: 'user-1',
          receiverId: 'user-2',
          status: 'ACCEPTED',
          updatedAt: new Date('2026-01-01'),
          receiver: {
            id: 'user-2',
            firstName: 'Priya',
            lastName: 'Sharma',
            isPhoneVerified: true,
            isEmailVerified: true,
            status: 'ACTIVE',
            profile: {
              id: 'prof-2',
              firstName: 'Priya',
              lastName: 'Sharma',
              city: 'Mumbai',
              occupation: 'Software Engineer',
            },
            photos: [
              {
                id: 'photo-1',
                url: 'https://example.com/p1.jpg',
                isPrimary: true,
                isVerified: true,
                createdAt: new Date(),
              },
            ],
          },
        },
      ];

      mockPrisma.connection.findMany.mockResolvedValue(mockConnections);
      mockPrisma.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          senderId: 'user-2',
          receiverId: 'user-1',
          content: 'Hi there!',
          isRead: false,
          createdAt: new Date('2026-01-02T10:00:00Z'),
          updatedAt: new Date('2026-01-02T10:00:00Z'),
        },
      ]);
      mockPrisma.message.groupBy.mockResolvedValue([
        { senderId: 'user-2', _count: 1 },
      ]);

      const conversations = await service.getConversations('user-1');

      expect(conversations.length).toBe(1);
      const conv = conversations[0];
      expect(conv.id).toBe('user-2');
      expect(conv.participantId).toBe('user-2');
      expect(conv.participant.firstName).toBe('Priya');
      expect(conv.participant.city).toBe('Mumbai');
      expect(conv.participant.isVerified).toBe(true);
      expect(conv.lastMessage?.content).toBe('Hi there!');
      expect(conv.unreadCount).toBe(1);
      expect(conv.updatedAt).toEqual(new Date('2026-01-02T10:00:00Z'));
    });
  });

  describe('initiateChat', () => {
    it('should successfully initialize chat when mutual match exists', async () => {
      const mockConn = {
        id: 'conn-1',
        senderId: 'user-1',
        receiverId: 'user-2',
        status: 'ACCEPTED',
        createdAt: new Date(),
        sender: { id: 'user-1', firstName: 'John', lastName: 'Doe', profile: {} },
        receiver: {
          id: 'user-2',
          firstName: 'Jane',
          lastName: 'Smith',
          photos: [{ url: 'https://test.com/photo.jpg', isPrimary: true }],
          profile: { city: 'Mumbai', occupation: 'Designer' },
        },
      };

      mockPrisma.connection.findFirst.mockResolvedValue(mockConn);
      mockPrisma.message.findFirst.mockResolvedValue(null);

      const result = await service.initiateChat('user-1', 'user-2');
      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-user-2');
      expect(result.contactId).toBe('user-2');
      expect(result.partner.name).toBe('Jane Smith');
      expect(result.partner.photo).toBe('https://test.com/photo.jpg');
    });

    it('should throw ForbiddenException if users are not matched', async () => {
      mockPrisma.connection.findFirst.mockResolvedValue(null);
      await expect(service.initiateChat('user-1', 'user-unmatched')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if initiating chat with oneself', async () => {
      await expect(service.initiateChat('user-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
